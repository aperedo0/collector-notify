-- D39: fire_alert was the final authority for alert liveness in name only. Its
-- only row lock was on alert_trigger_state, while every liveness predicate was
-- evaluated inside the `INSERT ... SELECT` against unlocked rows. A price or
-- status edit still serialized, but only as a side effect: its re-arm trigger
-- reaches the state row this function already holds. `deleted_at` is in no
-- trigger's column list and touches no state row, so nothing serialized a soft
-- delete at all -- an alert the customer had just deleted fired anyway, landed
-- in Recent history, and queued a push (measured: 3 phantom fires in 1519).
--
-- The fix locks the alerts row FIRST and decides liveness under that lock.
-- The alerts -> alert_trigger_state order is mandatory, not stylistic: the
-- user-edit path is `UPDATE alerts` (alerts row lock) -> alerts_rearm_update ->
-- rearm_alert() (state row lock). Taking the state row first here would invert
-- the pair and deadlock against every price and status edit. Measured under a
-- forced interleave: alerts -> state, 0 deadlocks in 2,000 iterations;
-- state -> alerts, one deadlock per iteration.
--
-- Two sequential statements rather than one joined statement, deliberately: in a
-- joined `SELECT ... FOR UPDATE` the row-lock order is a property of the plan the
-- planner chooses, not of this text (measured: flipping the `FROM` order flipped
-- the lock order), and PLAN.md section 14 makes M0 the last milestone that may
-- write a migration, so a future planner change could silently invert it.
--
-- products.is_active is deliberately NOT locked: a catalog lock would serialize
-- every user's fires for a product behind catalog writes. The residual window
-- equals the deactivating transaction's duration and is accepted -- a
-- just-retired product firing once is a catalog event, not a broken promise.
--
-- The `a.deleted_at IS null AND a.status = 'active'` predicates in the
-- `INSERT ... SELECT` are now unreachable as a guard and are kept anyway: they
-- cost nothing and keep that WHERE a complete statement of the firing condition.
CREATE OR REPLACE FUNCTION public.fire_alert(
  p_alert_id uuid,
  p_trigger_key text,
  p_price_cents int,
  p_cooldown_minutes int
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_event_id uuid;
  v_user_id uuid;
  v_alert alerts%rowtype;
  v_state alert_trigger_state%rowtype;
BEGIN
  -- D32: every argument is required; a null silently corrupts the checks below.
  -- This runs before the new lock so a null p_alert_id still raises rather than
  -- attempting `WHERE id = null FOR UPDATE`.
  IF p_alert_id IS null
     OR p_trigger_key IS null
     OR p_price_cents IS null
     OR p_cooldown_minutes IS null
  THEN
    RAISE EXCEPTION 'fire_alert requires non-null arguments';
  END IF;

  -- D39: the alerts row lock comes first, and liveness is decided under it.
  -- A fire racing a soft delete either arrives first (the delete waits, and the
  -- alert really was live when it fired) or arrives second, where EvalPlanQual
  -- re-reads the committed row version and the guard below refuses. A delete
  -- that rolls back correctly does not suppress the fire.
  SELECT * INTO v_alert
    FROM alerts
   WHERE id = p_alert_id
   FOR UPDATE;

  IF NOT FOUND
     OR v_alert.deleted_at IS NOT null
     OR v_alert.status <> 'active'
  THEN
    RETURN null;
  END IF;

  SELECT * INTO v_state
    FROM alert_trigger_state
   WHERE alert_id = p_alert_id
   FOR UPDATE;

  IF NOT FOUND OR NOT v_state.armed THEN
    RETURN null;
  END IF;

  IF v_state.last_triggered_at IS NOT null
     AND v_state.last_triggered_at > now() - make_interval(mins => p_cooldown_minutes)
  THEN
    RETURN null;
  END IF;

  INSERT INTO recent_events (
    user_id,
    alert_id,
    product_id,
    type,
    price_cents,
    trigger_key
  )
  SELECT
    a.user_id,
    a.id,
    a.product_id,
    'alert_triggered',
    p_price_cents,
    p_trigger_key
  FROM alerts a
  JOIN products p ON p.id = a.product_id
  WHERE a.id = p_alert_id
    AND a.deleted_at IS null
    AND a.status = 'active'
    AND p.is_active
    AND p_price_cents <= a.price_threshold_cents
  ON CONFLICT (alert_id, trigger_key) DO NOTHING
  RETURNING id, user_id INTO v_event_id, v_user_id;

  IF v_event_id IS null THEN
    RETURN null;
  END IF;

  UPDATE alert_trigger_state
     SET armed = false,
         last_triggered_at = now(),
         updated_at = now()
   WHERE alert_id = p_alert_id;

  INSERT INTO notification_deliveries (event_id, channel, target)
  SELECT v_event_id, 'expo_push', t.expo_push_token
    FROM push_tokens t
    JOIN user_preferences up ON up.user_id = t.user_id
   WHERE t.user_id = v_user_id
     AND up.notifications_enabled
  ON CONFLICT (event_id, channel, target) DO NOTHING;

  RETURN v_event_id;
END
$function$;

-- D40: a queued push must never reach an account that no longer owns the token.
-- fire_alert stores only the token string in notification_deliveries.target, so
-- the moment a token is unregistered or re-registered to another user, every
-- delivery still pending for it is terminated here, at the source.
--
-- The guarantee has a stated boundary: it covers every delivery that EXISTS when
-- the token changes. A delivery enqueued concurrently by an in-flight fire_alert
-- is not covered -- that outbox insert reads push_tokens unlocked and this
-- trigger is AFTER -- which is why D40 also makes section 7.7's dispatcher-side
-- ownership check mandatory rather than optional.
--
-- SECURITY DEFINER is load-bearing, not decorative: notify_api may DELETE a push
-- token but may not UPDATE notification_deliveries, so invoker rights would raise
-- 42501 on the customer's own unregistration path.
CREATE OR REPLACE FUNCTION public.invalidate_deliveries_on_token_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE notification_deliveries
     SET status = 'failed',
         -- A same-owner unregistration -- including section 7.7's own
         -- DeviceNotRegistered delete -- changes no ownership and must not be
         -- labelled as if it had.
         last_error = CASE TG_OP WHEN 'DELETE' THEN 'token_unregistered'
                                 ELSE 'owner_changed' END
   WHERE target = OLD.expo_push_token
     AND status = 'pending';
  RETURN NULL;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.invalidate_deliveries_on_token_change()
  FROM public;

-- Split in two for the same reason D35 split alerts_rearm: a WHEN clause
-- referencing OLD is invalid on the delete side's counterpart, and an
-- unconditional update trigger would fire on every unrelated push_tokens write.
CREATE TRIGGER push_tokens_invalidate_deliveries_delete
AFTER DELETE ON push_tokens
FOR EACH ROW EXECUTE FUNCTION public.invalidate_deliveries_on_token_change();
CREATE TRIGGER push_tokens_invalidate_deliveries_update
AFTER UPDATE OF user_id ON push_tokens
FOR EACH ROW
WHEN (OLD.user_id IS DISTINCT FROM NEW.user_id)
EXECUTE FUNCTION public.invalidate_deliveries_on_token_change();

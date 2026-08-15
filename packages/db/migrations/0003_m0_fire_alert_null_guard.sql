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
  v_state alert_trigger_state%rowtype;
BEGIN
  -- D32: every argument is required; a null silently corrupts the checks below
  IF p_alert_id IS null
     OR p_trigger_key IS null
     OR p_price_cents IS null
     OR p_cooldown_minutes IS null
  THEN
    RAISE EXCEPTION 'fire_alert requires non-null arguments';
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

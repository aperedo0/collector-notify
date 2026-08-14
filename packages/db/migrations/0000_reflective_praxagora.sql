CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
DO $security_check$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_proc AS procedure
      JOIN pg_depend AS dependency
        ON dependency.classid = 'pg_proc'::regclass
       AND dependency.objid = procedure.oid
       AND dependency.deptype = 'e'
      JOIN pg_extension AS extension
        ON extension.oid = dependency.refobjid
     WHERE extension.extname = 'pgcrypto'
       AND has_function_privilege('public', procedure.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'pgcrypto provisioning must revoke PUBLIC function execution before migrations';
  END IF;

  IF NOT has_function_privilege(
    'notify_migrator',
    'public.gen_random_uuid()',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'notify_api',
    'public.gen_random_uuid()',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'notify_monitor',
    'public.gen_random_uuid()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'pgcrypto provisioning must grant gen_random_uuid to Notify database roles';
  END IF;
END
$security_check$;
--> statement-breakpoint
REVOKE ALL ON SCHEMA "public" FROM PUBLIC;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE "notify_migrator" IN SCHEMA "public" REVOKE ALL ON TABLES FROM PUBLIC;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE "notify_migrator" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM PUBLIC;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE "notify_migrator" IN SCHEMA "public" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_trigger_state" (
	"alert_id" uuid PRIMARY KEY NOT NULL,
	"armed" boolean DEFAULT true NOT NULL,
	"consecutive_eligible" integer DEFAULT 0 NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"price_threshold_cents" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alerts_price_threshold_cents_check" CHECK ("alerts"."price_threshold_cents" between 100 and 999999),
	CONSTRAINT "alerts_status_check" CHECK ("alerts"."status" in ('active', 'paused'))
);
--> statement-breakpoint
CREATE TABLE "fake_offers" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"purchasable" boolean DEFAULT false NOT NULL,
	"best_price_cents" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_job_state" (
	"job_name" text PRIMARY KEY NOT NULL,
	"last_completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitor_product_state" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"last_polled_at" timestamp with time zone,
	"consecutive_errors" integer DEFAULT 0 NOT NULL,
	"backoff_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitor_source_config" (
	"source" text PRIMARY KEY NOT NULL,
	"proxy_group_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitor_source_state" (
	"source" text PRIMARY KEY NOT NULL,
	"consecutive_errors" integer DEFAULT 0 NOT NULL,
	"backoff_until" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"target" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"ticket_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_event_channel_target_unique" UNIQUE("event_id","channel","target"),
	CONSTRAINT "notification_deliveries_channel_check" CHECK ("notification_deliveries"."channel" in ('expo_push'))
);
--> statement-breakpoint
CREATE TABLE "offer_observations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "offer_observations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"product_id" uuid NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purchasable" boolean NOT NULL,
	"best_price_cents" integer,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"product_url" text,
	"retailer" text DEFAULT 'target' NOT NULL,
	"retailer_product_id" text NOT NULL,
	"default_alert_price_cents" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_suggested" boolean DEFAULT false NOT NULL,
	"suggested_rank" integer,
	"poll_interval_seconds" integer DEFAULT 60 NOT NULL,
	"confirm_observations" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_retailer_product_id_unique" UNIQUE("retailer","retailer_product_id"),
	CONSTRAINT "products_default_alert_price_cents_check" CHECK ("products"."default_alert_price_cents" between 100 and 999999),
	CONSTRAINT "products_confirm_observations_check" CHECK ("products"."confirm_observations" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "proxy_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"protocol" text NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"username_enc" text,
	"password_enc" text,
	"username_fp" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"cooldown_until" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proxy_endpoints_group_protocol_host_port_username_fp_unique" UNIQUE("group_id","protocol","host","port","username_fp"),
	CONSTRAINT "proxy_endpoints_protocol_check" CHECK ("proxy_endpoints"."protocol" in ('http', 'https', 'socks5')),
	CONSTRAINT "proxy_endpoints_port_check" CHECK ("proxy_endpoints"."port" between 1 and 65535)
);
--> statement-breakpoint
CREATE TABLE "proxy_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proxy_groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"expo_push_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_expo_push_token_unique" UNIQUE("expo_push_token"),
	CONSTRAINT "push_tokens_platform_check" CHECK ("push_tokens"."platform" in ('ios', 'android'))
);
--> statement-breakpoint
CREATE TABLE "realtime_tickets" (
	"ticket_hash" "bytea" PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"alert_id" uuid,
	"product_id" uuid NOT NULL,
	"type" text DEFAULT 'alert_triggered' NOT NULL,
	"price_cents" integer NOT NULL,
	"retailer" text DEFAULT 'target' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trigger_key" text NOT NULL,
	CONSTRAINT "recent_events_alert_id_trigger_key_unique" UNIQUE("alert_id","trigger_key")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_plan_check" CHECK ("user_preferences"."plan" in ('free', 'basic', 'plus'))
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_trigger_state" ADD CONSTRAINT "alert_trigger_state_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fake_offers" ADD CONSTRAINT "fake_offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_product_state" ADD CONSTRAINT "monitor_product_state_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_source_config" ADD CONSTRAINT "monitor_source_config_proxy_group_id_proxy_groups_id_fk" FOREIGN KEY ("proxy_group_id") REFERENCES "public"."proxy_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_event_id_recent_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."recent_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_observations" ADD CONSTRAINT "offer_observations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proxy_endpoints" ADD CONSTRAINT "proxy_endpoints_group_id_proxy_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."proxy_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realtime_tickets" ADD CONSTRAINT "realtime_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_events" ADD CONSTRAINT "recent_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_events" ADD CONSTRAINT "recent_events_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_events" ADD CONSTRAINT "recent_events_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_one_active_per_product" ON "alerts" USING btree ("user_id","product_id") WHERE "alerts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "alerts_by_product" ON "alerts" USING btree ("product_id") WHERE "alerts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "offer_obs_by_product" ON "offer_observations" USING btree ("product_id","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "proxy_by_group" ON "proxy_endpoints" USING btree ("group_id") WHERE "proxy_endpoints"."enabled";--> statement-breakpoint
CREATE INDEX "realtime_tickets_expiry" ON "realtime_tickets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "recent_by_user" ON "recent_events" USING btree ("user_id","occurred_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$function$;
--> statement-breakpoint
CREATE TRIGGER alerts_touch
BEFORE UPDATE ON alerts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER prefs_touch
BEFORE UPDATE ON user_preferences
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.rearm_alert() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO alert_trigger_state (alert_id, armed)
  VALUES (NEW.id, true)
  ON CONFLICT (alert_id) DO UPDATE
    SET armed = true,
        consecutive_eligible = 0,
        last_triggered_at = null,
        updated_at = now();
  RETURN NEW;
END
$function$;
--> statement-breakpoint
CREATE TRIGGER alerts_rearm
AFTER INSERT OR UPDATE OF price_threshold_cents, status ON alerts
FOR EACH ROW EXECUTE FUNCTION public.rearm_alert();
--> statement-breakpoint
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$function$;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.emit_realtime_notification() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_type text;
  v_entity_id uuid;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'alerts' THEN
      v_type := 'alerts.changed';
      v_entity_id := NEW.id;
    WHEN 'recent_events' THEN
      v_type := 'recent.created';
      v_entity_id := NEW.id;
    WHEN 'user_preferences' THEN
      v_type := 'preferences.changed';
      v_entity_id := NEW.user_id;
    ELSE
      RAISE EXCEPTION 'Unsupported realtime table: %', TG_TABLE_NAME;
  END CASE;

  PERFORM pg_notify(
    'notify_realtime',
    json_build_object(
      'v', 1,
      'userId', NEW.user_id,
      'type', v_type,
      'entityId', v_entity_id
    )::text
  );
  RETURN NEW;
END
$function$;
--> statement-breakpoint
CREATE TRIGGER alerts_realtime
AFTER INSERT OR UPDATE ON alerts
FOR EACH ROW EXECUTE FUNCTION public.emit_realtime_notification();
--> statement-breakpoint
CREATE TRIGGER recent_events_realtime
AFTER INSERT ON recent_events
FOR EACH ROW EXECUTE FUNCTION public.emit_realtime_notification();
--> statement-breakpoint
CREATE TRIGGER user_preferences_realtime
AFTER INSERT OR UPDATE ON user_preferences
FOR EACH ROW EXECUTE FUNCTION public.emit_realtime_notification();
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO notify_api, notify_monitor;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  users,
  sessions,
  accounts,
  verifications
TO notify_api;
--> statement-breakpoint
GRANT SELECT ON TABLE products TO notify_api;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE alerts TO notify_api;
--> statement-breakpoint
GRANT UPDATE (price_threshold_cents, status, deleted_at) ON TABLE alerts TO notify_api;
--> statement-breakpoint
GRANT SELECT ON TABLE recent_events TO notify_api;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE push_tokens TO notify_api;
--> statement-breakpoint
GRANT SELECT ON TABLE user_preferences TO notify_api;
--> statement-breakpoint
GRANT UPDATE (notifications_enabled) ON TABLE user_preferences TO notify_api;
--> statement-breakpoint
GRANT SELECT (ticket_hash, user_id, expires_at, consumed_at),
  INSERT, UPDATE, DELETE ON TABLE realtime_tickets TO notify_api;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE products TO notify_monitor;
--> statement-breakpoint
GRANT SELECT, DELETE ON TABLE alerts, recent_events, push_tokens TO notify_monitor;
--> statement-breakpoint
GRANT SELECT (expires_at, consumed_at), DELETE ON TABLE realtime_tickets TO notify_monitor;
--> statement-breakpoint
GRANT SELECT ON TABLE user_preferences TO notify_monitor;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  alert_trigger_state,
  monitor_product_state,
  monitor_source_config,
  monitor_source_state,
  offer_observations,
  fake_offers,
  notification_deliveries,
  proxy_groups,
  proxy_endpoints,
  maintenance_job_state
TO notify_monitor;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE offer_observations_id_seq TO notify_monitor;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.fire_alert(uuid, text, int, int) TO notify_monitor;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.fire_alert(uuid, text, int, int) FROM notify_api;

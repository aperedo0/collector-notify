import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth-schema.ts";

const bytea = customType<{ data: Uint8Array }>({
  dataType: () => "bytea",
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    productUrl: text("product_url"),
    retailer: text("retailer").notNull().default("target"),
    retailerProductId: text("retailer_product_id").notNull(),
    defaultAlertPriceCents: integer("default_alert_price_cents").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    isSuggested: boolean("is_suggested").notNull().default(false),
    suggestedRank: integer("suggested_rank"),
    pollIntervalSeconds: integer("poll_interval_seconds").notNull().default(60),
    confirmObservations: integer("confirm_observations").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    unique("products_retailer_product_id_unique").on(
      table.retailer,
      table.retailerProductId,
    ),
    check(
      "products_default_alert_price_cents_check",
      sql`${table.defaultAlertPriceCents} between 100 and 999999`,
    ),
    check(
      "products_confirm_observations_check",
      sql`${table.confirmObservations} between 1 and 5`,
    ),
  ],
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    priceThresholdCents: integer("price_threshold_cents").notNull(),
    status: text("status").notNull().default("active"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "alerts_price_threshold_cents_check",
      sql`${table.priceThresholdCents} between 100 and 999999`,
    ),
    check("alerts_status_check", sql`${table.status} in ('active', 'paused')`),
    uniqueIndex("alerts_one_active_per_product")
      .on(table.userId, table.productId)
      .where(sql`${table.deletedAt} is null`),
    index("alerts_by_product")
      .on(table.productId)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const alertTriggerState = pgTable("alert_trigger_state", {
  alertId: uuid("alert_id")
    .primaryKey()
    .references(() => alerts.id, { onDelete: "cascade" }),
  armed: boolean("armed").notNull().default(true),
  consecutiveEligible: integer("consecutive_eligible").notNull().default(0),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const monitorProductState = pgTable("monitor_product_state", {
  productId: uuid("product_id")
    .primaryKey()
    .references(() => products.id, { onDelete: "cascade" }),
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  consecutiveErrors: integer("consecutive_errors").notNull().default(0),
  backoffUntil: timestamp("backoff_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const offerObservations = pgTable(
  "offer_observations",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    purchasable: boolean("purchasable").notNull(),
    bestPriceCents: integer("best_price_cents"),
    raw: jsonb("raw"),
  },
  (table) => [
    // NULLS FIRST is deliberate: PostgreSQL renders it back as plain `DESC`,
    // which is what Drizzle's query-side `desc()` emits. A `DESC NULLS LAST`
    // index carries different pathkeys, so the planner cannot use it for
    // `ORDER BY observed_at DESC` and sorts the whole table instead.
    index("offer_obs_by_product").on(table.productId, table.observedAt.desc().nullsFirst()),
  ],
);

export const recentEvents = pgTable(
  "recent_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    alertId: uuid("alert_id").references(() => alerts.id, { onDelete: "set null" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    type: text("type").notNull().default("alert_triggered"),
    priceCents: integer("price_cents").notNull(),
    retailer: text("retailer").notNull().default("target"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    triggerKey: text("trigger_key").notNull(),
  },
  (table) => [
    unique("recent_events_alert_id_trigger_key_unique").on(
      table.alertId,
      table.triggerKey,
    ),
    // NULLS FIRST for the same reason as `offer_obs_by_product` above.
    index("recent_by_user").on(table.userId, table.occurredAt.desc().nullsFirst()),
  ],
);

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    expoPushToken: text("expo_push_token").notNull().unique(),
    ...timestamps,
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("push_tokens_platform_check", sql`${table.platform} in ('ios', 'android')`),
  ],
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => recentEvents.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    target: text("target").notNull(),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastError: text("last_error"),
    ticketId: text("ticket_id"),
    ...timestamps,
  },
  (table) => [
    check(
      "notification_deliveries_channel_check",
      sql`${table.channel} in ('expo_push')`,
    ),
    unique("notification_deliveries_event_channel_target_unique").on(
      table.eventId,
      table.channel,
      table.target,
    ),
    // D42, created by migration 0006 rather than by drizzle-kit. It serves the
    // D40 invalidation trigger's `where target = ? and status = 'pending'`,
    // which the unique constraint above cannot: `target` is its third column.
    // Declared here so this schema still describes the live database.
    index("deliveries_pending_by_target")
      .on(table.target)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
    plan: text("plan").notNull().default("free"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("user_preferences_plan_check", sql`${table.plan} in ('free', 'basic', 'plus')`),
  ],
);

export const fakeOffers = pgTable("fake_offers", {
  productId: uuid("product_id")
    .primaryKey()
    .references(() => products.id),
  purchasable: boolean("purchasable").notNull().default(false),
  bestPriceCents: integer("best_price_cents"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const proxyGroups = pgTable("proxy_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  ...timestamps,
});

export const proxyEndpoints = pgTable(
  "proxy_endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => proxyGroups.id, { onDelete: "cascade" }),
    protocol: text("protocol").notNull(),
    host: text("host").notNull(),
    port: integer("port").notNull(),
    usernameEnc: text("username_enc"),
    passwordEnc: text("password_enc"),
    usernameFp: text("username_fp").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check(
      "proxy_endpoints_protocol_check",
      sql`${table.protocol} in ('http', 'https', 'socks5')`,
    ),
    check("proxy_endpoints_port_check", sql`${table.port} between 1 and 65535`),
    unique("proxy_endpoints_group_protocol_host_port_username_fp_unique").on(
      table.groupId,
      table.protocol,
      table.host,
      table.port,
      table.usernameFp,
    ),
    index("proxy_by_group").on(table.groupId).where(sql`${table.enabled}`),
  ],
);

export const monitorSourceConfig = pgTable("monitor_source_config", {
  source: text("source").primaryKey(),
  proxyGroupId: uuid("proxy_group_id").references(() => proxyGroups.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const monitorSourceState = pgTable("monitor_source_state", {
  source: text("source").primaryKey(),
  consecutiveErrors: integer("consecutive_errors").notNull().default(0),
  backoffUntil: timestamp("backoff_until", { withTimezone: true }),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const realtimeTickets = pgTable(
  "realtime_tickets",
  {
    ticketHash: bytea("ticket_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("realtime_tickets_expiry").on(table.expiresAt)],
);

export const maintenanceJobState = pgTable("maintenance_job_state", {
  jobName: text("job_name").primaryKey(),
  lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

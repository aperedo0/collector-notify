ALTER DEFAULT PRIVILEGES FOR ROLE "notify_migrator"
  REVOKE ALL ON TABLES FROM PUBLIC;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE "notify_migrator"
  REVOKE ALL ON SEQUENCES FROM PUBLIC;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE "notify_migrator"
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--> statement-breakpoint
INSERT INTO "products" (
  "slug",
  "name",
  "image_url",
  "product_url",
  "retailer",
  "retailer_product_id",
  "default_alert_price_cents",
  "is_active",
  "is_suggested",
  "suggested_rank",
  "poll_interval_seconds",
  "confirm_observations"
)
VALUES
  (
    'prismatic-evolutions-etb',
    'Prismatic Evolutions Elite Trainer Box',
    NULL,
    'https://www.target.com/p/notify-placeholder-prismatic-evolutions-etb',
    'target',
    'notify-placeholder-01',
    5499,
    true,
    true,
    1,
    15,
    1
  ),
  (
    'destined-rivals-etb',
    'Destined Rivals Elite Trainer Box',
    NULL,
    'https://www.target.com/p/notify-placeholder-destined-rivals-etb',
    'target',
    'notify-placeholder-02',
    5499,
    true,
    true,
    2,
    15,
    1
  ),
  (
    '151-booster-bundle',
    '151 Booster Bundle',
    NULL,
    'https://www.target.com/p/notify-placeholder-151-booster-bundle',
    'target',
    'notify-placeholder-03',
    2999,
    true,
    true,
    3,
    15,
    1
  ),
  (
    'journey-together-etb',
    'Journey Together ETB',
    NULL,
    'https://www.target.com/p/notify-placeholder-journey-together-etb',
    'target',
    'notify-placeholder-04',
    4999,
    true,
    true,
    4,
    15,
    1
  ),
  (
    'charizard-ex-premium',
    'Charizard ex Premium Collection',
    NULL,
    'https://www.target.com/p/notify-placeholder-charizard-ex-premium',
    'target',
    'notify-placeholder-05',
    7999,
    true,
    false,
    NULL,
    60,
    1
  ),
  (
    'charizard-ex-super-premium',
    'Charizard ex Super-Premium Collection',
    NULL,
    'https://www.target.com/p/notify-placeholder-charizard-ex-super-premium',
    'target',
    'notify-placeholder-06',
    8999,
    true,
    false,
    NULL,
    60,
    1
  ),
  (
    'charizard-ex-ultra-premium',
    'Charizard ex Ultra-Premium Collection',
    NULL,
    'https://www.target.com/p/notify-placeholder-charizard-ex-ultra-premium',
    'target',
    'notify-placeholder-07',
    11999,
    true,
    false,
    NULL,
    60,
    1
  ),
  (
    'charizard-ex-special',
    'Charizard ex Special Collection',
    NULL,
    'https://www.target.com/p/notify-placeholder-charizard-ex-special',
    'target',
    'notify-placeholder-08',
    3999,
    true,
    false,
    NULL,
    60,
    1
  )
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "image_url" = EXCLUDED."image_url",
  "product_url" = EXCLUDED."product_url",
  "retailer" = EXCLUDED."retailer",
  "retailer_product_id" = EXCLUDED."retailer_product_id",
  "default_alert_price_cents" = EXCLUDED."default_alert_price_cents",
  "is_active" = EXCLUDED."is_active",
  "is_suggested" = EXCLUDED."is_suggested",
  "suggested_rank" = EXCLUDED."suggested_rank",
  "poll_interval_seconds" = EXCLUDED."poll_interval_seconds",
  "confirm_observations" = EXCLUDED."confirm_observations";
--> statement-breakpoint
INSERT INTO "fake_offers" ("product_id", "purchasable", "best_price_cents")
SELECT "id", false, NULL
  FROM "products"
 WHERE "slug" IN (
   'prismatic-evolutions-etb',
   'destined-rivals-etb',
   '151-booster-bundle',
   'journey-together-etb',
   'charizard-ex-premium',
   'charizard-ex-super-premium',
   'charizard-ex-ultra-premium',
   'charizard-ex-special'
 )
ON CONFLICT ("product_id") DO UPDATE SET
  "purchasable" = EXCLUDED."purchasable",
  "best_price_cents" = EXCLUDED."best_price_cents";

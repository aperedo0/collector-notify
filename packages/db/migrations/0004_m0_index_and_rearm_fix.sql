-- Both indexes were created as DESC NULLS LAST. Drizzle's query-side `desc()`
-- helper emits plain DESC (= NULLS FIRST), so an ordered read written with it
-- carries pathkeys the old indexes could never match, and the planner sorts
-- instead of scanning the index. Measured on a 20,000-row fixture: Sort ->
-- Seq Scan against DESC NULLS LAST, Index Scan against plain DESC. No consumer
-- exists yet (M2 and M5 add the first ones); this is fixed now because PLAN.md
-- section 14 makes M0 the last milestone that may write a migration.
-- Plain DESC is also what PLAN.md section 6.1 specifies.
DROP INDEX recent_by_user;
CREATE INDEX recent_by_user ON recent_events USING btree (user_id, occurred_at DESC);
DROP INDEX offer_obs_by_product;
CREATE INDEX offer_obs_by_product ON offer_observations USING btree (product_id, observed_at DESC);

-- D35: `UPDATE OF col` fires on column MENTION, not on a changed value, and the
-- "Update alert" write path sets both columns on every save, so re-saving an
-- alert unchanged re-armed it and cleared its cooldown, letting any
-- authenticated client bypass the retrigger interval. The WHEN clause below
-- requires a real change. Splitting alerts_rearm in two is forced, not a
-- preference: a WHEN clause referencing OLD is rejected on an INSERT trigger.
-- public.rearm_alert() itself is unchanged.
DROP TRIGGER alerts_rearm ON alerts;
CREATE TRIGGER alerts_rearm_insert
AFTER INSERT ON alerts
FOR EACH ROW EXECUTE FUNCTION public.rearm_alert();
CREATE TRIGGER alerts_rearm_update
AFTER UPDATE OF price_threshold_cents, status ON alerts
FOR EACH ROW
WHEN (OLD.price_threshold_cents IS DISTINCT FROM NEW.price_threshold_cents
      OR OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.rearm_alert();

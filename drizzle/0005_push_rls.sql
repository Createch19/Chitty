-- push_subscription and notification are organiser data: same tenant rules as the other tables (see 0001_rls.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscription TO chitty_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON notification TO chitty_app;
--> statement-breakpoint
ALTER TABLE push_subscription ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant ON push_subscription TO chitty_app USING (organiser_id = app_organiser_id()) WITH CHECK (organiser_id = app_organiser_id());
--> statement-breakpoint
CREATE POLICY tenant ON notification TO chitty_app USING (organiser_id = app_organiser_id()) WITH CHECK (organiser_id = app_organiser_id());

-- room_join is organiser data: same tenant rules as the other tables (see 0001_rls.sql).
GRANT SELECT, INSERT, DELETE ON room_join TO chitty_app;
--> statement-breakpoint
ALTER TABLE room_join ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant ON room_join TO chitty_app USING (organiser_id = app_organiser_id()) WITH CHECK (organiser_id = app_organiser_id());

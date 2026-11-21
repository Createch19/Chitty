-- Tenant isolation (SaaS): every organiser-scoped transaction runs as role chitty_app with
-- app.organiser_id set (see src/db/tenant.ts). Row-Level Security then hides and blocks every
-- row of every other organiser. Migrations and the Super Admin's usage counts run as the owner.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chitty_app') THEN
    CREATE ROLE chitty_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO chitty_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON chit, seat, month, payment, payout, member_link TO chitty_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON bid, audit_log TO chitty_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE bid_id_seq, audit_log_id_seq TO chitty_app;
--> statement-breakpoint
-- The organiser may read their own profile, but never anyone's password hash.
GRANT SELECT (id, business_name, business_name_ta, owner_name, mobile, active, lang) ON organiser TO chitty_app;
--> statement-breakpoint
CREATE FUNCTION app_organiser_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.organiser_id', true), '')::uuid $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_organiser_id() TO chitty_app;
--> statement-breakpoint
ALTER TABLE organiser ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY organiser_self ON organiser TO chitty_app USING (id = app_organiser_id());
--> statement-breakpoint
ALTER TABLE chit ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant ON chit TO chitty_app USING (organiser_id = app_organiser_id()) WITH CHECK (organiser_id = app_organiser_id());
--> statement-breakpoint
ALTER TABLE seat ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant ON seat TO chitty_app USING (organiser_id = app_organiser_id()) WITH CHECK (organiser_id = app_organiser_id());
--> statement-breakpoint
ALTER TABLE month ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant ON month TO chitty_app USING (organiser_id = app_organiser_id()) WITH CHECK (organiser_id = app_organiser_id());
--> statement-breakpoint
ALTER TABLE bid ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant ON bid TO chitty_app USING (organiser_id = app_organiser_id()) WITH CHECK (organiser_id = app_organiser_id());
--> statement-breakpoint
ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant ON payment TO chitty_app USING (organiser_id = app_organiser_id()) WITH CHECK (organiser_id = app_organiser_id());
--> statement-breakpoint
ALTER TABLE payout ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant ON payout TO chitty_app USING (organiser_id = app_organiser_id()) WITH CHECK (organiser_id = app_organiser_id());
--> statement-breakpoint
ALTER TABLE member_link ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant ON member_link TO chitty_app USING (organiser_id = app_organiser_id()) WITH CHECK (organiser_id = app_organiser_id());
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant ON audit_log TO chitty_app USING (organiser_id = app_organiser_id()) WITH CHECK (organiser_id = app_organiser_id());
--> statement-breakpoint
-- Bids can never be withdrawn or edited; the audit trail is append-only. Applies to every role.
CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint
CREATE TRIGGER bid_append_only BEFORE UPDATE OR DELETE ON bid FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_change();

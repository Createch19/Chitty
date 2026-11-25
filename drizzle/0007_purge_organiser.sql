-- Bids and the audit trail stay append-only, with one exception: the Super Admin's "delete company" removes one
-- organiser's rows. That transaction names the organiser in app.purge_organiser; the tenant role can never use it.
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_user <> 'chitty_app' AND OLD.organiser_id IS NOT NULL
     AND OLD.organiser_id::text = current_setting('app.purge_organiser', true) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END
$$;

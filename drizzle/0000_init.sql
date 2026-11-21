CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organiser_id" uuid,
	"actor_kind" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"details" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_actor" CHECK ("audit_log"."actor_kind" in ('admin','organiser','member','system'))
);
--> statement-breakpoint
CREATE TABLE "bid" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organiser_id" uuid NOT NULL,
	"month_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bid_amount_per_month" UNIQUE("month_id","amount_paise"),
	CONSTRAINT "bid_amount" CHECK ("bid"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "chit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organiser_id" uuid NOT NULL,
	"code" text NOT NULL,
	"total_paise" bigint NOT NULL,
	"months" integer NOT NULL,
	"rate_bps" integer NOT NULL,
	"increment_paise" bigint NOT NULL,
	"open_time" time DEFAULT '09:00' NOT NULL,
	"display" text DEFAULT 'id' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"start_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chit_code_per_organiser" UNIQUE("organiser_id","code"),
	CONSTRAINT "chit_id_org" UNIQUE("id","organiser_id"),
	CONSTRAINT "chit_months" CHECK ("chit"."months" between 2 and 120),
	CONSTRAINT "chit_total" CHECK ("chit"."total_paise" > 0 and "chit"."total_paise" % "chit"."months" = 0),
	CONSTRAINT "chit_rate" CHECK ("chit"."rate_bps" between 1 and 10000),
	CONSTRAINT "chit_increment" CHECK ("chit"."increment_paise" > 0 and "chit"."increment_paise" < "chit"."total_paise"),
	CONSTRAINT "chit_display" CHECK ("chit"."display" in ('id','name')),
	CONSTRAINT "chit_status" CHECK ("chit"."status" in ('draft','active','completed')),
	CONSTRAINT "chit_start_day" CHECK ("chit"."start_date" is null or extract(day from "chit"."start_date") between 1 and 28)
);
--> statement-breakpoint
CREATE TABLE "login_attempt" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organiser_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "member_link_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "month" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organiser_id" uuid NOT NULL,
	"chit_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"auction_date" date NOT NULL,
	"bidding" boolean NOT NULL,
	"min_discount_paise" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"discount_paise" bigint,
	"winner_seat_id" uuid,
	"lottery" boolean DEFAULT false NOT NULL,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "month_per_chit" UNIQUE("chit_id","month"),
	CONSTRAINT "month_id_org" UNIQUE("id","organiser_id"),
	CONSTRAINT "month_one_win_per_seat" UNIQUE("chit_id","winner_seat_id"),
	CONSTRAINT "month_status" CHECK ("month"."status" in ('pending','open','closed'))
);
--> statement-breakpoint
CREATE TABLE "organiser" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_name" text NOT NULL,
	"business_name_ta" text,
	"owner_name" text NOT NULL,
	"mobile" text NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organiser_mobile_unique" UNIQUE("mobile"),
	CONSTRAINT "organiser_mobile_10" CHECK ("organiser"."mobile" ~ '^[6-9][0-9]{9}$'),
	CONSTRAINT "organiser_lang" CHECK ("organiser"."lang" in ('en','ta'))
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"organiser_id" uuid NOT NULL,
	"month_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"adjusted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_month_id_seat_id_pk" PRIMARY KEY("month_id","seat_id")
);
--> statement-breakpoint
CREATE TABLE "payout" (
	"organiser_id" uuid NOT NULL,
	"month_id" uuid PRIMARY KEY NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"prize_paise" bigint NOT NULL,
	"cash_paise" bigint NOT NULL,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "seat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organiser_id" uuid NOT NULL,
	"chit_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"aadhaar_enc" "bytea",
	"aadhaar_last4" text,
	"is_organiser" boolean DEFAULT false NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seat_number_per_chit" UNIQUE("chit_id","number"),
	CONSTRAINT "seat_id_org" UNIQUE("id","organiser_id"),
	CONSTRAINT "seat_number" CHECK ("seat"."number" >= 1),
	CONSTRAINT "seat_phone" CHECK ("seat"."phone" ~ '^[6-9][0-9]{9}$'),
	CONSTRAINT "seat_last4" CHECK ("seat"."aadhaar_last4" is null or "seat"."aadhaar_last4" ~ '^[0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "session_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "session_kind" CHECK ("session"."kind" in ('admin','organiser'))
);
--> statement-breakpoint
CREATE TABLE "super_admin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mobile" text NOT NULL,
	"name" text DEFAULT 'Super Admin' NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "super_admin_mobile_unique" UNIQUE("mobile")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organiser_id_organiser_id_fk" FOREIGN KEY ("organiser_id") REFERENCES "public"."organiser"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid" ADD CONSTRAINT "bid_organiser_id_organiser_id_fk" FOREIGN KEY ("organiser_id") REFERENCES "public"."organiser"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid" ADD CONSTRAINT "bid_month_id_month_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."month"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid" ADD CONSTRAINT "bid_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid" ADD CONSTRAINT "bid_month_same_org" FOREIGN KEY ("month_id","organiser_id") REFERENCES "public"."month"("id","organiser_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid" ADD CONSTRAINT "bid_seat_same_org" FOREIGN KEY ("seat_id","organiser_id") REFERENCES "public"."seat"("id","organiser_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chit" ADD CONSTRAINT "chit_organiser_id_organiser_id_fk" FOREIGN KEY ("organiser_id") REFERENCES "public"."organiser"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_link" ADD CONSTRAINT "member_link_organiser_id_organiser_id_fk" FOREIGN KEY ("organiser_id") REFERENCES "public"."organiser"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_link" ADD CONSTRAINT "member_link_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_link" ADD CONSTRAINT "member_link_seat_same_org" FOREIGN KEY ("seat_id","organiser_id") REFERENCES "public"."seat"("id","organiser_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month" ADD CONSTRAINT "month_organiser_id_organiser_id_fk" FOREIGN KEY ("organiser_id") REFERENCES "public"."organiser"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month" ADD CONSTRAINT "month_chit_id_chit_id_fk" FOREIGN KEY ("chit_id") REFERENCES "public"."chit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month" ADD CONSTRAINT "month_winner_seat_id_seat_id_fk" FOREIGN KEY ("winner_seat_id") REFERENCES "public"."seat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month" ADD CONSTRAINT "month_chit_same_org" FOREIGN KEY ("chit_id","organiser_id") REFERENCES "public"."chit"("id","organiser_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month" ADD CONSTRAINT "month_winner_same_org" FOREIGN KEY ("winner_seat_id","organiser_id") REFERENCES "public"."seat"("id","organiser_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_organiser_id_organiser_id_fk" FOREIGN KEY ("organiser_id") REFERENCES "public"."organiser"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_month_id_month_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."month"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_month_same_org" FOREIGN KEY ("month_id","organiser_id") REFERENCES "public"."month"("id","organiser_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_seat_same_org" FOREIGN KEY ("seat_id","organiser_id") REFERENCES "public"."seat"("id","organiser_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_organiser_id_organiser_id_fk" FOREIGN KEY ("organiser_id") REFERENCES "public"."organiser"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_month_id_month_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."month"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_month_same_org" FOREIGN KEY ("month_id","organiser_id") REFERENCES "public"."month"("id","organiser_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_organiser_id_organiser_id_fk" FOREIGN KEY ("organiser_id") REFERENCES "public"."organiser"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_chit_id_chit_id_fk" FOREIGN KEY ("chit_id") REFERENCES "public"."chit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_chit_same_org" FOREIGN KEY ("chit_id","organiser_id") REFERENCES "public"."chit"("id","organiser_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_by_org" ON "audit_log" USING btree ("organiser_id","id");--> statement-breakpoint
CREATE INDEX "login_attempt_key_at" ON "login_attempt" USING btree ("key","at");--> statement-breakpoint
CREATE INDEX "member_link_seat" ON "member_link" USING btree ("seat_id");--> statement-breakpoint
CREATE INDEX "session_subject" ON "session" USING btree ("kind","subject_id");
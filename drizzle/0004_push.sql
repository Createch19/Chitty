CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organiser_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"month_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"fields" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pushed" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "notification_kind" CHECK ("notification"."kind" in ('open','date','closed','reminder','receipt','correction'))
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organiser_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_ok_at" timestamp with time zone,
	CONSTRAINT "push_subscription_seat_endpoint" UNIQUE("seat_id","endpoint"),
	CONSTRAINT "push_subscription_lang" CHECK ("push_subscription"."lang" in ('en','ta'))
);
--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_organiser_id_organiser_id_fk" FOREIGN KEY ("organiser_id") REFERENCES "public"."organiser"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_month_id_month_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."month"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_seat_same_org" FOREIGN KEY ("seat_id","organiser_id") REFERENCES "public"."seat"("id","organiser_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_month_same_org" FOREIGN KEY ("month_id","organiser_id") REFERENCES "public"."month"("id","organiser_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_organiser_id_organiser_id_fk" FOREIGN KEY ("organiser_id") REFERENCES "public"."organiser"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_seat_same_org" FOREIGN KEY ("seat_id","organiser_id") REFERENCES "public"."seat"("id","organiser_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_seat" ON "notification" USING btree ("seat_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_reminder_once" ON "notification" USING btree ("seat_id","month_id") WHERE "notification"."kind" = 'reminder';
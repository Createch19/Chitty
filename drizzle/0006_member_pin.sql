ALTER TABLE "chit" ADD COLUMN "group_token" text;--> statement-breakpoint
ALTER TABLE "member_link" ADD COLUMN "kind" text DEFAULT 'link' NOT NULL;--> statement-breakpoint
ALTER TABLE "seat" ADD COLUMN "pin_enc" "bytea";--> statement-breakpoint
ALTER TABLE "chit" ADD CONSTRAINT "chit_group_token_unique" UNIQUE("group_token");
CREATE TABLE "room_join" (
	"organiser_id" uuid NOT NULL,
	"month_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_join_month_id_seat_id_pk" PRIMARY KEY("month_id","seat_id")
);
--> statement-breakpoint
ALTER TABLE "room_join" ADD CONSTRAINT "room_join_organiser_id_organiser_id_fk" FOREIGN KEY ("organiser_id") REFERENCES "public"."organiser"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_join" ADD CONSTRAINT "room_join_month_id_month_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."month"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_join" ADD CONSTRAINT "room_join_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_join" ADD CONSTRAINT "room_join_month_same_org" FOREIGN KEY ("month_id","organiser_id") REFERENCES "public"."month"("id","organiser_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_join" ADD CONSTRAINT "room_join_seat_same_org" FOREIGN KEY ("seat_id","organiser_id") REFERENCES "public"."seat"("id","organiser_id") ON DELETE no action ON UPDATE no action;
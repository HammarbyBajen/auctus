CREATE TABLE "at_risk_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"mana_user_id" text NOT NULL,
	"alert_id" uuid,
	"kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_id" text
);
--> statement-breakpoint
ALTER TABLE "at_risk_alert" ADD COLUMN "return_by" date;--> statement-breakpoint
ALTER TABLE "at_risk_alert" ADD COLUMN "assigned_to_id" text;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "at_risk_emails" jsonb;--> statement-breakpoint
ALTER TABLE "at_risk_note" ADD CONSTRAINT "at_risk_note_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_risk_note" ADD CONSTRAINT "at_risk_note_alert_id_at_risk_alert_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."at_risk_alert"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_risk_note" ADD CONSTRAINT "at_risk_note_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "at_risk_note_member_idx" ON "at_risk_note" USING btree ("studio_id","mana_user_id","created_at");--> statement-breakpoint
ALTER TABLE "at_risk_alert" ADD CONSTRAINT "at_risk_alert_assigned_to_id_user_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
CREATE TABLE "at_risk_alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"mana_user_id" text NOT NULL,
	"last_visit_at" timestamp,
	"status" text DEFAULT 'open' NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"handled_at" timestamp,
	"handled_by_id" text
);
--> statement-breakpoint
CREATE TABLE "mana_visit" (
	"studio_id" uuid NOT NULL,
	"id" text NOT NULL,
	"mana_user_id" text NOT NULL,
	"at" timestamp NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mana_visit_studio_id_id_pk" PRIMARY KEY("studio_id","id")
);
--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "at_risk_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "at_risk_alert" ADD CONSTRAINT "at_risk_alert_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_risk_alert" ADD CONSTRAINT "at_risk_alert_handled_by_id_user_id_fk" FOREIGN KEY ("handled_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mana_visit" ADD CONSTRAINT "mana_visit_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "at_risk_alert_studio_idx" ON "at_risk_alert" USING btree ("studio_id","status");--> statement-breakpoint
CREATE INDEX "mana_visit_user_idx" ON "mana_visit" USING btree ("studio_id","mana_user_id","at");
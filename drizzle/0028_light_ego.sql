CREATE TABLE "ai_suggestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"lead_id" uuid,
	"mana_user_id" text,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" integer DEFAULT 0 NOT NULL,
	"suggestion" jsonb,
	"error" text,
	"decision" text,
	"decided_by_id" text,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_settings" ALTER COLUMN "thresholds" SET DEFAULT '{"firstContactHours":24,"warnHoursBeforeDeadline":4,"stalledDays":7,"stalledDaysByStage":{"contacted":3,"booked_meeting":3,"booked_test_training":3,"consultation_done":5,"cancelled_meeting":2,"price_info":5},"clockDays":[1,2,3,4,5,6,7],"daysOff":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE "at_risk_note" ADD COLUMN "private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_note" ADD COLUMN "private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "ai_settings" jsonb;--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_decided_by_id_user_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_suggestion_studio_idx" ON "ai_suggestion" USING btree ("studio_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_suggestion_lead_idx" ON "ai_suggestion" USING btree ("lead_id");
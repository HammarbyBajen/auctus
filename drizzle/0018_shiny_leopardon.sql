CREATE TABLE "lead_submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"sender_id" text NOT NULL,
	"route" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"outcome" text NOT NULL,
	"lead_id" uuid
);
--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "attribution" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "attribution_parsed" jsonb;--> statement-breakpoint
ALTER TABLE "lead_submission" ADD CONSTRAINT "lead_submission_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_submission" ADD CONSTRAINT "lead_submission_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_submission_sender_idx" ON "lead_submission" USING btree ("studio_id","sender_id");--> statement-breakpoint
CREATE INDEX "lead_submission_received_idx" ON "lead_submission" USING btree ("studio_id","received_at");
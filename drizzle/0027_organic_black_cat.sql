CREATE TABLE "intake_rejection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"detail" text,
	"route" text,
	"issues" jsonb,
	"user_agent" text,
	"bytes" integer
);
--> statement-breakpoint
ALTER TABLE "intake_rejection" ADD CONSTRAINT "intake_rejection_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intake_rejection_received_idx" ON "intake_rejection" USING btree ("studio_id","received_at");
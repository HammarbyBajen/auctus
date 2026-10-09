CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"email_normalized" text,
	"phone" text,
	"phone_normalized" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "lead_studio_email_idx";--> statement-breakpoint
DROP INDEX "lead_studio_phone_idx";--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "person_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_studio_email_idx" ON "person" USING btree ("studio_id","email_normalized");--> statement-breakpoint
CREATE INDEX "person_studio_phone_idx" ON "person" USING btree ("studio_id","phone_normalized");--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_person_idx" ON "lead" USING btree ("person_id","created_at");
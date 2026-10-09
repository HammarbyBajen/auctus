ALTER TABLE "lead_event" ADD COLUMN "via" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "mana_user_id" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "mana_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "ignored_membership_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "person_studio_mana_idx" ON "person" USING btree ("studio_id","mana_user_id");
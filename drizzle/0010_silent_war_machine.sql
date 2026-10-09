ALTER TABLE "lead" ADD COLUMN "external_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_studio_external_ref_idx" ON "lead" USING btree ("studio_id","external_ref");
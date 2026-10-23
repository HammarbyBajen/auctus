ALTER TABLE "handbook_page" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "handbook_page" ADD COLUMN "archived_by_id" text;--> statement-breakpoint
ALTER TABLE "handbook_page" ADD CONSTRAINT "handbook_page_archived_by_id_user_id_fk" FOREIGN KEY ("archived_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Routines removed before archiving existed were promised to be kept: they become archived ones.
UPDATE "handbook_page" SET "archived_at" = "deleted_at", "deleted_at" = NULL WHERE "deleted_at" IS NOT NULL;

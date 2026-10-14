DROP TABLE "salary_person" CASCADE;--> statement-breakpoint
ALTER TABLE "salary_instructor" ADD COLUMN "free_classes_per_week" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_instructor" ADD COLUMN "active_from" date;--> statement-breakpoint
ALTER TABLE "salary_instructor" ADD COLUMN "notes" text DEFAULT '' NOT NULL;
CREATE TABLE "deletion_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"deleted_at" timestamp DEFAULT now() NOT NULL,
	"deleted_by_id" text,
	"leads" integer NOT NULL,
	"notes" integer NOT NULL,
	"tasks" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_settings" ALTER COLUMN "thresholds" SET DEFAULT '{"firstContactHours":24,"warnHoursBeforeDeadline":4,"stalledDays":7,"clockDays":[1,2,3,4,5,6,7],"daysOff":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE "deletion_log" ADD CONSTRAINT "deletion_log_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_log" ADD CONSTRAINT "deletion_log_deleted_by_id_user_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
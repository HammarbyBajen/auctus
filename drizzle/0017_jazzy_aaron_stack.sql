CREATE TABLE "lead_field" (
	"studio_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "lead_field_studio_id_key_pk" PRIMARY KEY("studio_id","key")
);
--> statement-breakpoint
ALTER TABLE "cold_reason" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_stage" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "lead_field" ADD CONSTRAINT "lead_field_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;
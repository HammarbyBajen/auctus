CREATE TABLE "handbook_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handbook_page" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_id" text,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "handbook_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_id" text
);
--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "handbook_editor_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "handbook_category" ADD CONSTRAINT "handbook_category_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handbook_page" ADD CONSTRAINT "handbook_page_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handbook_page" ADD CONSTRAINT "handbook_page_category_id_handbook_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."handbook_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handbook_page" ADD CONSTRAINT "handbook_page_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handbook_page" ADD CONSTRAINT "handbook_page_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handbook_version" ADD CONSTRAINT "handbook_version_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handbook_version" ADD CONSTRAINT "handbook_version_page_id_handbook_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."handbook_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handbook_version" ADD CONSTRAINT "handbook_version_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "handbook_category_studio_idx" ON "handbook_category" USING btree ("studio_id","position");--> statement-breakpoint
CREATE INDEX "handbook_page_studio_idx" ON "handbook_page" USING btree ("studio_id","category_id");--> statement-breakpoint
CREATE INDEX "handbook_version_page_idx" ON "handbook_version" USING btree ("page_id","created_at");
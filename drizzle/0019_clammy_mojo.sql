CREATE TABLE "salary_instructor" (
	"studio_id" uuid NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "salary_instructor_studio_id_id_pk" PRIMARY KEY("studio_id","id")
);
--> statement-breakpoint
CREATE TABLE "salary_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"month" text NOT NULL,
	"action" text NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL,
	"by_id" text
);
--> statement-breakpoint
CREATE TABLE "salary_month" (
	"studio_id" uuid NOT NULL,
	"month" text NOT NULL,
	"pulled_at" timestamp,
	"pulled_by_id" text,
	"locked_at" timestamp,
	"locked_by_id" text,
	"snapshot" jsonb,
	CONSTRAINT "salary_month_studio_id_month_pk" PRIMARY KEY("studio_id","month")
);
--> statement-breakpoint
CREATE TABLE "salary_person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mana_instructor_id" text,
	"free_classes_per_week" integer DEFAULT 0 NOT NULL,
	"active_from" date,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_type_rule" (
	"studio_id" uuid NOT NULL,
	"type_key" text NOT NULL,
	"label" text NOT NULL,
	"source" text NOT NULL,
	"paid" boolean,
	CONSTRAINT "salary_type_rule_studio_id_type_key_pk" PRIMARY KEY("studio_id","type_key")
);
--> statement-breakpoint
CREATE TABLE "salary_work" (
	"studio_id" uuid NOT NULL,
	"month" text NOT NULL,
	"id" text NOT NULL,
	"source" text NOT NULL,
	"type_key" text NOT NULL,
	"type_label" text NOT NULL,
	"instructor_id" text,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"status" text,
	CONSTRAINT "salary_work_studio_id_month_id_pk" PRIMARY KEY("studio_id","month","id")
);
--> statement-breakpoint
ALTER TABLE "salary_instructor" ADD CONSTRAINT "salary_instructor_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_log" ADD CONSTRAINT "salary_log_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_log" ADD CONSTRAINT "salary_log_by_id_user_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_month" ADD CONSTRAINT "salary_month_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_month" ADD CONSTRAINT "salary_month_pulled_by_id_user_id_fk" FOREIGN KEY ("pulled_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_month" ADD CONSTRAINT "salary_month_locked_by_id_user_id_fk" FOREIGN KEY ("locked_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_person" ADD CONSTRAINT "salary_person_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_type_rule" ADD CONSTRAINT "salary_type_rule_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_work" ADD CONSTRAINT "salary_work_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "salary_person_instructor_idx" ON "salary_person" USING btree ("studio_id","mana_instructor_id");--> statement-breakpoint
CREATE INDEX "salary_work_month_idx" ON "salary_work" USING btree ("studio_id","month","starts_at");
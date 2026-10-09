CREATE TABLE "cold_reason" (
	"studio_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "cold_reason_studio_id_key_pk" PRIMARY KEY("studio_id","key")
);
--> statement-breakpoint
CREATE TABLE "lead_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" text NOT NULL,
	"from_stage" text,
	"to_stage" text,
	"cold_reason" text,
	"outcome" text,
	"author_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_stage" (
	"studio_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"kind" text DEFAULT 'open' NOT NULL,
	CONSTRAINT "pipeline_stage_studio_id_key_pk" PRIMARY KEY("studio_id","key")
);
--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "cold_reason" text;--> statement-breakpoint
ALTER TABLE "cold_reason" ADD CONSTRAINT "cold_reason_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_event" ADD CONSTRAINT "lead_event_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_event" ADD CONSTRAINT "lead_event_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_event" ADD CONSTRAINT "lead_event_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stage" ADD CONSTRAINT "pipeline_stage_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Data step: every existing studio gets the default stages and Cold reasons,
-- before leads are required to point at one of them.
INSERT INTO "pipeline_stage" ("studio_id", "key", "name", "position", "kind")
SELECT s."id", v."key", v."name", v."position", v."kind"
FROM "studio" s
CROSS JOIN (VALUES
	('new_lead', 'Ny lead', 0, 'open'),
	('contacted', 'Kontaktad', 1, 'open'),
	('booked_meeting', 'Bokat möte', 2, 'open'),
	('booked_test_training', 'Bokat provträning', 3, 'open'),
	('consultation_done', 'Konsultation klar', 4, 'open'),
	('price_info', 'Prisinformation', 5, 'open'),
	('won', 'Medlem', 6, 'won'),
	('cold', 'Kall lead', 7, 'cold')
) AS v("key", "name", "position", "kind");--> statement-breakpoint
INSERT INTO "cold_reason" ("studio_id", "key", "name", "position")
SELECT s."id", v."key", v."name", v."position"
FROM "studio" s
CROSS JOIN (VALUES
	('price', 'Pris', 0),
	('location', 'Läge eller avstånd', 1),
	('no_response', 'Svarar inte', 2),
	('not_interested', 'Inte intresserad längre', 3),
	('other_gym', 'Valde en annan anläggning', 4),
	('other', 'Annat', 5)
) AS v("key", "name", "position");--> statement-breakpoint
CREATE INDEX "lead_event_lead_idx" ON "lead_event" USING btree ("lead_id","created_at");--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_studio_id_stage_pipeline_stage_studio_id_key_fk" FOREIGN KEY ("studio_id","stage") REFERENCES "public"."pipeline_stage"("studio_id","key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_studio_id_cold_reason_cold_reason_studio_id_key_fk" FOREIGN KEY ("studio_id","cold_reason") REFERENCES "public"."cold_reason"("studio_id","key") ON DELETE no action ON UPDATE no action;
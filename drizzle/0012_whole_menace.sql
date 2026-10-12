CREATE TABLE "kpi_snapshot" (
	"studio_id" uuid NOT NULL,
	"day" date NOT NULL,
	"paying_members" integer NOT NULL,
	"revenue" integer NOT NULL,
	"by_name" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_snapshot_studio_id_day_pk" PRIMARY KEY("studio_id","day")
);
--> statement-breakpoint
ALTER TABLE "kpi_snapshot" ADD CONSTRAINT "kpi_snapshot_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;
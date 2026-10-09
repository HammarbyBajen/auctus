CREATE TABLE "mana_purchase" (
	"studio_id" uuid NOT NULL,
	"id" text NOT NULL,
	"mana_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"description" text,
	"paid_at" timestamp NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mana_purchase_studio_id_id_pk" PRIMARY KEY("studio_id","id")
);
--> statement-breakpoint
CREATE TABLE "mana_signal" (
	"studio_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"mana_ref" text NOT NULL,
	"mana_user_id" text NOT NULL,
	"lead_id" uuid,
	"skipped" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mana_signal_studio_id_kind_mana_ref_pk" PRIMARY KEY("studio_id","kind","mana_ref")
);
--> statement-breakpoint
CREATE TABLE "win_back_reason" (
	"studio_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "win_back_reason_studio_id_key_pk" PRIMARY KEY("studio_id","key")
);
--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "win_back_reason" text;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "win_back_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mana_purchase" ADD CONSTRAINT "mana_purchase_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mana_signal" ADD CONSTRAINT "mana_signal_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mana_signal" ADD CONSTRAINT "mana_signal_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "win_back_reason" ADD CONSTRAINT "win_back_reason_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mana_purchase_user_idx" ON "mana_purchase" USING btree ("studio_id","mana_user_id");--> statement-breakpoint
-- Data step: every existing studio gets the default win-back reasons before leads may point at one.
INSERT INTO "win_back_reason" ("studio_id", "key", "name", "position")
SELECT s."id", v."key", v."name", v."position"
FROM "studio" s
CROSS JOIN (VALUES
	('injury', 'Skada', 0),
	('illness', 'Sjukdom', 1),
	('moved', 'Flyttat', 2),
	('other_gym', 'Hittat ett annat gym, kommer inte tillbaka', 3),
	('price', 'Pris', 4),
	('no_time', 'Ingen tid', 5),
	('other', 'Annat', 6)
) AS v("key", "name", "position");--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_studio_id_win_back_reason_win_back_reason_studio_id_key_fk" FOREIGN KEY ("studio_id","win_back_reason") REFERENCES "public"."win_back_reason"("studio_id","key") ON DELETE no action ON UPDATE no action;
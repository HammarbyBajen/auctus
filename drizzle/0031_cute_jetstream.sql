CREATE TABLE "member_stats" (
	"studio_id" uuid NOT NULL,
	"mana_user_id" text NOT NULL,
	"base_classes" integer NOT NULL,
	"base_streak" integer NOT NULL,
	"read_at" timestamp NOT NULL,
	"last_classes" integer,
	"last_streak" integer,
	"checked_at" timestamp,
	CONSTRAINT "member_stats_studio_id_mana_user_id_pk" PRIMARY KEY("studio_id","mana_user_id")
);
--> statement-breakpoint
CREATE TABLE "milestone_hit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"mana_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"threshold" integer NOT NULL,
	"reached_on" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"handled_at" timestamp,
	"handled_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestone_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"threshold" integer NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_stats" ADD CONSTRAINT "member_stats_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_hit" ADD CONSTRAINT "milestone_hit_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_hit" ADD CONSTRAINT "milestone_hit_handled_by_id_user_id_fk" FOREIGN KEY ("handled_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_rule" ADD CONSTRAINT "milestone_rule_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "milestone_hit_unique_idx" ON "milestone_hit" USING btree ("studio_id","mana_user_id","kind","threshold");--> statement-breakpoint
CREATE INDEX "milestone_hit_open_idx" ON "milestone_hit" USING btree ("studio_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "milestone_rule_unique_idx" ON "milestone_rule" USING btree ("studio_id","kind","threshold");
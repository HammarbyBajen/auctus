CREATE TABLE "mana_api_check" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"hash" text,
	"error" text,
	"changes" jsonb,
	"acknowledged_at" timestamp,
	"acknowledged_by_id" text
);
--> statement-breakpoint
CREATE TABLE "mana_api_spec" (
	"hash" text PRIMARY KEY NOT NULL,
	"spec" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mana_api_check" ADD CONSTRAINT "mana_api_check_acknowledged_by_id_user_id_fk" FOREIGN KEY ("acknowledged_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mana_api_check_checked_idx" ON "mana_api_check" USING btree ("checked_at");
CREATE TABLE "mana_member" (
	"studio_id" uuid NOT NULL,
	"mana_user_id" text NOT NULL,
	"role" text NOT NULL,
	"name" text,
	"email" text,
	"email_normalized" text,
	"phone" text,
	"phone_normalized" text,
	"last_run_id" text NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mana_member_studio_id_mana_user_id_pk" PRIMARY KEY("studio_id","mana_user_id")
);
--> statement-breakpoint
CREATE TABLE "mana_membership" (
	"studio_id" uuid NOT NULL,
	"id" text NOT NULL,
	"mana_user_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"start_date" date NOT NULL,
	"commitment_end_date" date,
	"cancel_effective_date" date,
	"pending_change_kind" text,
	"pending_change_date" date,
	"price_amount" integer,
	"price_currency" text,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mana_membership_studio_id_id_pk" PRIMARY KEY("studio_id","id")
);
--> statement-breakpoint
CREATE TABLE "sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"kind" text DEFAULT 'mana' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"error" text,
	"progress" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mana_member" ADD CONSTRAINT "mana_member_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mana_membership" ADD CONSTRAINT "mana_membership_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mana_member_email_idx" ON "mana_member" USING btree ("studio_id","email_normalized");--> statement-breakpoint
CREATE INDEX "mana_member_phone_idx" ON "mana_member" USING btree ("studio_id","phone_normalized");--> statement-breakpoint
CREATE INDEX "mana_membership_user_idx" ON "mana_membership" USING btree ("studio_id","mana_user_id");--> statement-breakpoint
CREATE INDEX "sync_run_studio_idx" ON "sync_run" USING btree ("studio_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_run_one_running" ON "sync_run" USING btree ("studio_id","kind") WHERE status = 'running';
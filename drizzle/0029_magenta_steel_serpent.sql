CREATE TABLE "mana_credit_balance" (
	"studio_id" uuid NOT NULL,
	"mana_user_id" text NOT NULL,
	"credits" double precision NOT NULL,
	"expire_date" date,
	"read_at" timestamp NOT NULL,
	CONSTRAINT "mana_credit_balance_studio_id_mana_user_id_pk" PRIMARY KEY("studio_id","mana_user_id")
);
--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "mana_credit_bundles" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "klippkort_bundle_ids" jsonb;--> statement-breakpoint
ALTER TABLE "mana_credit_balance" ADD CONSTRAINT "mana_credit_balance_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;
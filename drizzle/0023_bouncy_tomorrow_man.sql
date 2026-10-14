CREATE TABLE "discord_notice" (
	"studio_id" uuid NOT NULL,
	"key" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discord_notice_studio_id_key_pk" PRIMARY KEY("studio_id","key")
);
--> statement-breakpoint
ALTER TABLE "discord_notice" ADD CONSTRAINT "discord_notice_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;
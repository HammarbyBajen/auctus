CREATE TABLE "user_invite" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "user_invite" ADD CONSTRAINT "user_invite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invite" ADD CONSTRAINT "user_invite_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
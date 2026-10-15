CREATE TABLE "email_event" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" uuid,
	"type" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"lead_id" uuid,
	"mana_user_id" text,
	"to" text NOT NULL,
	"sent_to" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"resend_id" text,
	"error" text,
	"sent_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_suppression" (
	"studio_id" uuid NOT NULL,
	"address" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppression_studio_id_address_pk" PRIMARY KEY("studio_id","address")
);
--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "lead_email" jsonb;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "email_from" text;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "email_live" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email_event" ADD CONSTRAINT "email_event_message_id_email_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_message" ADD CONSTRAINT "email_message_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_message" ADD CONSTRAINT "email_message_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_message" ADD CONSTRAINT "email_message_sent_by_id_user_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_suppression" ADD CONSTRAINT "email_suppression_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_message_lead_idx" ON "email_message" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "email_message_member_idx" ON "email_message" USING btree ("studio_id","mana_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_message_resend_idx" ON "email_message" USING btree ("resend_id");
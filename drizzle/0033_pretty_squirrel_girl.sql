ALTER TABLE "at_risk_alert" ADD COLUMN "cause" text DEFAULT 'away' NOT NULL;--> statement-breakpoint
ALTER TABLE "at_risk_alert" ADD COLUMN "change_date" date;
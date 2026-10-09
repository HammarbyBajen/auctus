-- Data step: Pipedrive's "Avbokat möte" becomes a stage of its own, between
-- Konsultation klar and Prisinformation, for every studio that lacks it.
UPDATE "pipeline_stage" SET "position" = "position" + 1
WHERE "position" >= 5
  AND "studio_id" NOT IN (SELECT "studio_id" FROM "pipeline_stage" WHERE "key" = 'cancelled_meeting');--> statement-breakpoint
INSERT INTO "pipeline_stage" ("studio_id", "key", "name", "position", "kind")
SELECT DISTINCT "studio_id", 'cancelled_meeting', 'Avbokat möte', 5, 'open'
FROM "pipeline_stage"
ON CONFLICT DO NOTHING;

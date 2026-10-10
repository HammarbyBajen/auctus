-- Data step: Pipedrive's "Avbokat möte" becomes a stage of its own, right
-- after Konsultation klar (wherever a studio has put it), for every studio
-- that has Konsultation klar and lacks the new stage.
UPDATE "pipeline_stage" AS s SET "position" = s."position" + 1
FROM "pipeline_stage" AS c
WHERE c."studio_id" = s."studio_id"
  AND c."key" = 'consultation_done'
  AND s."position" > c."position"
  AND s."studio_id" NOT IN (SELECT "studio_id" FROM "pipeline_stage" WHERE "key" = 'cancelled_meeting');--> statement-breakpoint
INSERT INTO "pipeline_stage" ("studio_id", "key", "name", "position", "kind")
SELECT "studio_id", 'cancelled_meeting', 'Avbokat möte', "position" + 1, 'open'
FROM "pipeline_stage"
WHERE "key" = 'consultation_done'
ON CONFLICT DO NOTHING;

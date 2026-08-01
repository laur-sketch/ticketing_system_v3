ALTER TABLE "travel_orders" ADD COLUMN IF NOT EXISTS "approved_by_agent_ids" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "travel_orders"
SET "approved_by_agent_ids" = jsonb_build_array("approved_by_agent_id")
WHERE "approved_by_agent_id" IS NOT NULL
  AND (
    "approved_by_agent_ids" IS NULL
    OR "approved_by_agent_ids" = '[]'::jsonb
  );

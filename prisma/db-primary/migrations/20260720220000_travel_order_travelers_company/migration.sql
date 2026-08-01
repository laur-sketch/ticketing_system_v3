-- Travelers (creator + co-travelers) and company scoping for travel orders.
ALTER TABLE "travel_orders" ADD COLUMN IF NOT EXISTS "created_by_agent_id" TEXT;
ALTER TABLE "travel_orders" ADD COLUMN IF NOT EXISTS "company_team_id" TEXT;
ALTER TABLE "travel_orders" ADD COLUMN IF NOT EXISTS "traveler_agent_ids" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS "travel_orders_company_team_id_idx" ON "travel_orders" ("company_team_id");
CREATE INDEX IF NOT EXISTS "travel_orders_created_by_agent_id_idx" ON "travel_orders" ("created_by_agent_id");

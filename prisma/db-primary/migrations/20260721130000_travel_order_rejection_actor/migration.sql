ALTER TABLE "travel_orders" ADD COLUMN IF NOT EXISTS "rejected_by_agent_id" TEXT;
ALTER TABLE "travel_orders" ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMPTZ(3);
ALTER TABLE "travel_orders" ADD COLUMN IF NOT EXISTS "rejected_at_level" INTEGER;

ALTER TABLE "travel_orders" ADD COLUMN IF NOT EXISTS "kpi_percent" INTEGER;
ALTER TABLE "travel_orders" ADD COLUMN IF NOT EXISTS "kpi_submitted_at" TIMESTAMPTZ(3);

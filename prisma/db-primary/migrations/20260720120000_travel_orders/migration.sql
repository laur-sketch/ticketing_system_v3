-- Field Assignment: Request for Travel Order tables

CREATE TABLE IF NOT EXISTS "travel_orders" (
    "id" TEXT NOT NULL,
    "kpi_maintenance_id" TEXT NOT NULL,
    "order_request" TEXT NOT NULL,
    "approved_by_agent_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "travel_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "travel_order_locations" (
    "id" TEXT NOT NULL,
    "travel_order_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT,
    "attachments" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "travel_order_locations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "travel_orders_kpi_maintenance_id_created_at_idx" ON "travel_orders"("kpi_maintenance_id", "created_at");
CREATE INDEX IF NOT EXISTS "travel_orders_approved_by_agent_id_idx" ON "travel_orders"("approved_by_agent_id");
CREATE INDEX IF NOT EXISTS "travel_order_locations_travel_order_id_sort_order_idx" ON "travel_order_locations"("travel_order_id", "sort_order");

DO $$ BEGIN
  ALTER TABLE "travel_orders" ADD CONSTRAINT "travel_orders_kpi_maintenance_id_fkey"
    FOREIGN KEY ("kpi_maintenance_id") REFERENCES "kpi_maintenance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "travel_orders" ADD CONSTRAINT "travel_orders_approved_by_agent_id_fkey"
    FOREIGN KEY ("approved_by_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "travel_order_locations" ADD CONSTRAINT "travel_order_locations_travel_order_id_fkey"
    FOREIGN KEY ("travel_order_id") REFERENCES "travel_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

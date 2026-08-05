-- Optional driver details on travel orders (Driver present checkbox)

ALTER TABLE "travel_orders"
  ADD COLUMN IF NOT EXISTS "driver_present" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "driver_agent_id" TEXT,
  ADD COLUMN IF NOT EXISTS "driver_license_no" TEXT;

-- Start / End GPS visit tracking for travel order locations

ALTER TABLE "travel_order_locations"
  ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "started_latitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "started_longitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "ended_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "ended_latitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "ended_longitude" DOUBLE PRECISION;

-- Backfill End from legacy single check-in
UPDATE "travel_order_locations"
SET
  "ended_at" = COALESCE("ended_at", "checked_at"),
  "ended_latitude" = COALESCE("ended_latitude", "latitude"),
  "ended_longitude" = COALESCE("ended_longitude", "longitude")
WHERE "checked_at" IS NOT NULL
   OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL);

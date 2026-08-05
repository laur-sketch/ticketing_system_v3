-- Optional Gate Pass fields on travel orders

ALTER TABLE "travel_orders"
  ADD COLUMN IF NOT EXISTS "gate_pass_included" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "est_departure_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "est_arrival_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "actual_departure_started_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "actual_departure_started_latitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "actual_departure_started_longitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "actual_departure_ended_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "actual_departure_ended_latitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "actual_departure_ended_longitude" DOUBLE PRECISION;

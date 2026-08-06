-- Gate Pass: Guard on Duty names for Actual Departure Start / End.
ALTER TABLE "travel_orders"
  ADD COLUMN IF NOT EXISTS "gate_pass_start_guard_on_duty" TEXT,
  ADD COLUMN IF NOT EXISTS "gate_pass_end_guard_on_duty" TEXT;

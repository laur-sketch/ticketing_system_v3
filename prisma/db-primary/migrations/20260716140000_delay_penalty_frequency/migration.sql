-- Delay penalty frequency on board TaskItem (default DAILY preserves legacy math).
DO $$ BEGIN
  CREATE TYPE "DelayPenaltyFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "task_items"
  ADD COLUMN IF NOT EXISTS "delay_penalty_frequency" "DelayPenaltyFrequency" NOT NULL DEFAULT 'DAILY';

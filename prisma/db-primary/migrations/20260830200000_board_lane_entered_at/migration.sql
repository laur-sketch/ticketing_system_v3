-- Track when a request entered its current Request Board lane (for 24h OVERDUE).
ALTER TABLE "tickets"
  ADD COLUMN IF NOT EXISTS "board_lane_entered_at" TIMESTAMPTZ;

UPDATE "tickets"
SET "board_lane_entered_at" = COALESCE("updated_at", "created_at", NOW())
WHERE "board_lane_entered_at" IS NULL;

ALTER TABLE "tickets"
  ALTER COLUMN "board_lane_entered_at" SET DEFAULT NOW(),
  ALTER COLUMN "board_lane_entered_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "tickets_board_lane_entered_at_status_idx"
  ON "tickets" ("board_lane_entered_at", "status");

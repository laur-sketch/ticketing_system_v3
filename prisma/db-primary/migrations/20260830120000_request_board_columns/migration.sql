-- Customizable Request Board columns + optional ticket lane override.
CREATE TABLE IF NOT EXISTS "request_board_columns" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "mapped_status" "TicketStatus" NOT NULL,
  "accept_statuses" JSONB NOT NULL,
  "allow_drop" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "request_board_columns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "request_board_columns_sort_order_idx" ON "request_board_columns"("sort_order");

ALTER TABLE "tickets"
  ADD COLUMN IF NOT EXISTS "request_board_column_id" TEXT;

CREATE INDEX IF NOT EXISTS "tickets_request_board_column_id_idx" ON "tickets"("request_board_column_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tickets_request_board_column_id_fkey'
  ) THEN
    ALTER TABLE "tickets"
      ADD CONSTRAINT "tickets_request_board_column_id_fkey"
      FOREIGN KEY ("request_board_column_id") REFERENCES "request_board_columns"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Seed default lanes when empty.
INSERT INTO "request_board_columns" (
  "id", "name", "sort_order", "is_default", "mapped_status", "accept_statuses", "allow_drop", "created_at", "updated_at"
)
SELECT
  'rbc_open',
  'Open',
  0,
  true,
  'OPEN',
  '["OPEN"]'::jsonb,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "request_board_columns" LIMIT 1);

INSERT INTO "request_board_columns" (
  "id", "name", "sort_order", "is_default", "mapped_status", "accept_statuses", "allow_drop", "created_at", "updated_at"
)
SELECT
  'rbc_progress',
  'In Progress',
  1,
  true,
  'IN_PROGRESS',
  '["IN_PROGRESS","ESCALATED"]'::jsonb,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "request_board_columns" WHERE "id" = 'rbc_progress')
  AND EXISTS (SELECT 1 FROM "request_board_columns" WHERE "id" = 'rbc_open');

INSERT INTO "request_board_columns" (
  "id", "name", "sort_order", "is_default", "mapped_status", "accept_statuses", "allow_drop", "created_at", "updated_at"
)
SELECT
  'rbc_feedback',
  'For Confirmation',
  2,
  true,
  'FOR_CONFIRMATION',
  '["FOR_CONFIRMATION","PENDING_INFO","RESOLVED"]'::jsonb,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "request_board_columns" WHERE "id" = 'rbc_feedback')
  AND EXISTS (SELECT 1 FROM "request_board_columns" WHERE "id" = 'rbc_open');

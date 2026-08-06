-- Order-level supporting attachments (images + documents) on travel orders

ALTER TABLE "travel_orders"
  ADD COLUMN IF NOT EXISTS "attachments" JSONB NOT NULL DEFAULT '[]'::jsonb;

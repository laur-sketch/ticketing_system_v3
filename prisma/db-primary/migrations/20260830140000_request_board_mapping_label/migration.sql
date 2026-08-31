-- Optional display label for custom board mappings (e.g. "On Delivery").
ALTER TABLE "request_board_columns"
  ADD COLUMN IF NOT EXISTS "mapping_label" TEXT;

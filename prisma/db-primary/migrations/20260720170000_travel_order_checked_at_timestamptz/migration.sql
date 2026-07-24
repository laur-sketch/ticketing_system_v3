-- Use timestamptz so check-in instants are timezone-safe (display as Asia/Taipei / GMT+8).
ALTER TABLE "travel_order_locations"
  ALTER COLUMN "checked_at" TYPE TIMESTAMPTZ(3)
  USING CASE
    WHEN "checked_at" IS NULL THEN NULL
    ELSE ("checked_at" AT TIME ZONE 'UTC')
  END;

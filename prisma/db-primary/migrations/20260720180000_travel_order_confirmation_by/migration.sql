-- AlterTable
ALTER TABLE "travel_orders" ADD COLUMN IF NOT EXISTS "confirmation_by_agent_id" TEXT;

CREATE INDEX IF NOT EXISTS "travel_orders_confirmation_by_agent_id_idx"
  ON "travel_orders"("confirmation_by_agent_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'travel_orders_confirmation_by_agent_id_fkey'
  ) THEN
    ALTER TABLE "travel_orders"
      ADD CONSTRAINT "travel_orders_confirmation_by_agent_id_fkey"
      FOREIGN KEY ("confirmation_by_agent_id") REFERENCES "agents"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

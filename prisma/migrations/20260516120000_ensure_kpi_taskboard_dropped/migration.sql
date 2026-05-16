-- Idempotent: remove legacy taskBoard + unique index if a DB was migrated with 20260514120000 but not reverted.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'KpiMaintenance'
      AND column_name = 'taskBoard'
  ) THEN
    DROP INDEX IF EXISTS "KpiMaintenance_taskBoard_title_key";
    DROP INDEX IF EXISTS "KpiMaintenance_taskBoard_idx";
    ALTER TABLE "KpiMaintenance" DROP COLUMN "taskBoard";
  END IF;
END $$;

-- Revert IT Tasks board: remove IT-only KPI rows and taskBoard column (safe if column was never added).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'KpiMaintenance'
      AND column_name = 'taskBoard'
  ) THEN
    DELETE FROM "KpiMaintenance" WHERE "taskBoard" = 'it';
    DROP INDEX IF EXISTS "KpiMaintenance_taskBoard_title_key";
    DROP INDEX IF EXISTS "KpiMaintenance_taskBoard_idx";
    ALTER TABLE "KpiMaintenance" DROP COLUMN "taskBoard";
  END IF;
END $$;

-- AlterTable
ALTER TABLE "KpiMaintenancePeriodSnapshot" ADD COLUMN IF NOT EXISTS "contributorProgress" JSONB;

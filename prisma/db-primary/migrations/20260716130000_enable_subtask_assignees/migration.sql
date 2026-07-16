-- AlterTable
ALTER TABLE "kpi_maintenance" ADD COLUMN IF NOT EXISTS "enable_subtask_assignees" BOOLEAN NOT NULL DEFAULT true;

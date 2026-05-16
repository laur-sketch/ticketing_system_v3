-- AlterTable
ALTER TABLE "KpiMaintenance" ADD COLUMN "taskBoard" TEXT NOT NULL DEFAULT 'general';

-- CreateIndex
CREATE INDEX "KpiMaintenance_taskBoard_idx" ON "KpiMaintenance"("taskBoard");

-- CreateIndex
CREATE UNIQUE INDEX "KpiMaintenance_taskBoard_title_key" ON "KpiMaintenance"("taskBoard", "title");

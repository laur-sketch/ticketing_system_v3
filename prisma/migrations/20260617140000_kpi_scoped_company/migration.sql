-- AlterTable
ALTER TABLE "KpiMaintenance" ADD COLUMN "scopedCompanyTeamId" TEXT;

-- CreateIndex
CREATE INDEX "KpiMaintenance_scopedCompanyTeamId_idx" ON "KpiMaintenance"("scopedCompanyTeamId");

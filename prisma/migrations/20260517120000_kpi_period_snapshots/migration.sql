-- CreateTable
CREATE TABLE "KpiMaintenancePeriodSnapshot" (
    "id" TEXT NOT NULL,
    "kpiMaintenanceId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "frequency" "KpiFrequency" NOT NULL,
    "timeZone" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "done" INTEGER NOT NULL,
    "missing" INTEGER NOT NULL,
    "percent" INTEGER NOT NULL,
    "fullyComplete" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiMaintenancePeriodSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KpiMaintenancePeriodSnapshot_periodKey_idx" ON "KpiMaintenancePeriodSnapshot"("periodKey");

-- CreateIndex
CREATE INDEX "KpiMaintenancePeriodSnapshot_kpiMaintenanceId_capturedAt_idx" ON "KpiMaintenancePeriodSnapshot"("kpiMaintenanceId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "KpiMaintenancePeriodSnapshot_kpiMaintenanceId_periodKey_key" ON "KpiMaintenancePeriodSnapshot"("kpiMaintenanceId", "periodKey");

-- AddForeignKey
ALTER TABLE "KpiMaintenancePeriodSnapshot" ADD CONSTRAINT "KpiMaintenancePeriodSnapshot_kpiMaintenanceId_fkey" FOREIGN KEY ("kpiMaintenanceId") REFERENCES "KpiMaintenance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

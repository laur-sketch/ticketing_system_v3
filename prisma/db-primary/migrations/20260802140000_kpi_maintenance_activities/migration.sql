-- CreateTable
CREATE TABLE IF NOT EXISTS "kpi_maintenance_activities" (
    "id" TEXT NOT NULL,
    "kpi_maintenance_id" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_maintenance_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "kpi_maintenance_activities_kpi_maintenance_id_created_at_idx"
  ON "kpi_maintenance_activities"("kpi_maintenance_id", "created_at");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kpi_maintenance_activities_kpi_maintenance_id_fkey'
  ) THEN
    ALTER TABLE "kpi_maintenance_activities"
      ADD CONSTRAINT "kpi_maintenance_activities_kpi_maintenance_id_fkey"
      FOREIGN KEY ("kpi_maintenance_id") REFERENCES "kpi_maintenance"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Company logos + department logo columns (HRIS → ticketing)
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "logo_path" TEXT;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "logo_image" TEXT;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "hris_company_id" BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS "teams_hris_company_id_key" ON "teams"("hris_company_id");

ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "hris_department_id" BIGINT;
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "hris_company_id" BIGINT;
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "logo_path" TEXT;
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "company_logo_path" TEXT;
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "logo_image" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "departments_hris_department_id_key" ON "departments"("hris_department_id");
CREATE INDEX IF NOT EXISTS "departments_hris_company_id_idx" ON "departments"("hris_company_id");

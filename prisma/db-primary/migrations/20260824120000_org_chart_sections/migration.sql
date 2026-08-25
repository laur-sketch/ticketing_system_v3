-- Org chart sections (labeled groups) + optional section assignment on nodes.
CREATE TABLE IF NOT EXISTS "org_chart_sections" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "company_team_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_chart_sections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "org_chart_sections_company_team_id_sort_order_idx"
  ON "org_chart_sections"("company_team_id", "sort_order");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'org_chart_sections_company_team_id_fkey'
  ) THEN
    ALTER TABLE "org_chart_sections"
      ADD CONSTRAINT "org_chart_sections_company_team_id_fkey"
      FOREIGN KEY ("company_team_id") REFERENCES "teams"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "org_chart_nodes"
  ADD COLUMN IF NOT EXISTS "section_id" TEXT;

CREATE INDEX IF NOT EXISTS "org_chart_nodes_section_id_idx"
  ON "org_chart_nodes"("section_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'org_chart_nodes_section_id_fkey'
  ) THEN
    ALTER TABLE "org_chart_nodes"
      ADD CONSTRAINT "org_chart_nodes_section_id_fkey"
      FOREIGN KEY ("section_id") REFERENCES "org_chart_sections"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

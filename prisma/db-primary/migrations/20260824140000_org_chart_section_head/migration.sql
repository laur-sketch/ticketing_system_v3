-- Section / subsection head (org-chart member).
ALTER TABLE "org_chart_sections"
  ADD COLUMN IF NOT EXISTS "head_node_id" TEXT;

CREATE INDEX IF NOT EXISTS "org_chart_sections_head_node_id_idx"
  ON "org_chart_sections"("head_node_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'org_chart_sections_head_node_id_fkey'
  ) THEN
    ALTER TABLE "org_chart_sections"
      ADD CONSTRAINT "org_chart_sections_head_node_id_fkey"
      FOREIGN KEY ("head_node_id") REFERENCES "org_chart_nodes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

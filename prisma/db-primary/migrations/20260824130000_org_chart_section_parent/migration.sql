-- Allow one-level subsections under org chart sections.
ALTER TABLE "org_chart_sections"
  ADD COLUMN IF NOT EXISTS "parent_id" TEXT;

CREATE INDEX IF NOT EXISTS "org_chart_sections_parent_id_sort_order_idx"
  ON "org_chart_sections"("parent_id", "sort_order");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'org_chart_sections_parent_id_fkey'
  ) THEN
    ALTER TABLE "org_chart_sections"
      ADD CONSTRAINT "org_chart_sections_parent_id_fkey"
      FOREIGN KEY ("parent_id") REFERENCES "org_chart_sections"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

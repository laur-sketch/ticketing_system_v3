-- Allow children to report to a shared either/or manager pair.
ALTER TABLE "org_chart_nodes"
  ADD COLUMN IF NOT EXISTS "parent_either_or_link_id" TEXT;

CREATE INDEX IF NOT EXISTS "org_chart_nodes_parent_either_or_link_id_idx"
  ON "org_chart_nodes"("parent_either_or_link_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'org_chart_nodes_parent_either_or_link_id_fkey'
  ) THEN
    ALTER TABLE "org_chart_nodes"
      ADD CONSTRAINT "org_chart_nodes_parent_either_or_link_id_fkey"
      FOREIGN KEY ("parent_either_or_link_id") REFERENCES "org_chart_either_or_links"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

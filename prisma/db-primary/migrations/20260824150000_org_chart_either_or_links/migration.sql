-- Either/or approval relation lines between two org-chart nodes.
CREATE TABLE IF NOT EXISTS "org_chart_either_or_links" (
  "id" TEXT NOT NULL,
  "node_a_id" TEXT NOT NULL,
  "node_b_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_chart_either_or_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_chart_either_or_links_node_a_id_node_b_id_key"
  ON "org_chart_either_or_links"("node_a_id", "node_b_id");

CREATE INDEX IF NOT EXISTS "org_chart_either_or_links_node_b_id_idx"
  ON "org_chart_either_or_links"("node_b_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'org_chart_either_or_links_node_a_id_fkey'
  ) THEN
    ALTER TABLE "org_chart_either_or_links"
      ADD CONSTRAINT "org_chart_either_or_links_node_a_id_fkey"
      FOREIGN KEY ("node_a_id") REFERENCES "org_chart_nodes"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'org_chart_either_or_links_node_b_id_fkey'
  ) THEN
    ALTER TABLE "org_chart_either_or_links"
      ADD CONSTRAINT "org_chart_either_or_links_node_b_id_fkey"
      FOREIGN KEY ("node_b_id") REFERENCES "org_chart_nodes"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

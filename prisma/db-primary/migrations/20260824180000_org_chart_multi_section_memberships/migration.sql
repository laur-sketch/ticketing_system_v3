CREATE TABLE "org_chart_node_section_memberships" (
  "id" TEXT NOT NULL,
  "node_id" TEXT NOT NULL,
  "section_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "org_chart_node_section_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_chart_node_section_memberships_node_id_section_id_key"
  ON "org_chart_node_section_memberships"("node_id", "section_id");

CREATE INDEX "org_chart_node_section_memberships_section_id_idx"
  ON "org_chart_node_section_memberships"("section_id");

ALTER TABLE "org_chart_node_section_memberships"
  ADD CONSTRAINT "org_chart_node_section_memberships_node_id_fkey"
  FOREIGN KEY ("node_id") REFERENCES "org_chart_nodes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_chart_node_section_memberships"
  ADD CONSTRAINT "org_chart_node_section_memberships_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "org_chart_sections"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "org_chart_node_section_memberships" ("id", "node_id", "section_id", "created_at")
SELECT
  CONCAT('ocnsm_', substr(md5(n.id || ':' || n.section_id), 1, 24)),
  n."id",
  n."section_id",
  CURRENT_TIMESTAMP
FROM "org_chart_nodes" n
WHERE n."section_id" IS NOT NULL
ON CONFLICT ("node_id", "section_id") DO NOTHING;

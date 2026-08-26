-- Custom org roles per section (beyond singleton section head).
CREATE TABLE IF NOT EXISTS "org_chart_section_roles" (
    "id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_chart_section_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_chart_section_roles_section_id_label_key"
  ON "org_chart_section_roles"("section_id", "label");

CREATE INDEX IF NOT EXISTS "org_chart_section_roles_section_id_sort_order_idx"
  ON "org_chart_section_roles"("section_id", "sort_order");

ALTER TABLE "org_chart_section_roles"
  ADD CONSTRAINT "org_chart_section_roles_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "org_chart_sections"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_chart_node_section_memberships"
  ADD COLUMN IF NOT EXISTS "role_id" TEXT;

CREATE INDEX IF NOT EXISTS "org_chart_node_section_memberships_role_id_idx"
  ON "org_chart_node_section_memberships"("role_id");

ALTER TABLE "org_chart_node_section_memberships"
  ADD CONSTRAINT "org_chart_node_section_memberships_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "org_chart_section_roles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

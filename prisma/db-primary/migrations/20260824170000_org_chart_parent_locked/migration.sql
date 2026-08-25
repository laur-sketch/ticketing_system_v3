-- Lock org-chart members to their current reports-to assignment.
ALTER TABLE "org_chart_nodes"
  ADD COLUMN IF NOT EXISTS "parent_locked" BOOLEAN NOT NULL DEFAULT false;

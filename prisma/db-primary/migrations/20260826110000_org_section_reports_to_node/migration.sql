-- AlterTable
ALTER TABLE "org_chart_sections" ADD COLUMN "reports_to_node_id" TEXT;

-- CreateIndex
CREATE INDEX "org_chart_sections_reports_to_node_id_idx" ON "org_chart_sections"("reports_to_node_id");

-- AddForeignKey
ALTER TABLE "org_chart_sections" ADD CONSTRAINT "org_chart_sections_reports_to_node_id_fkey" FOREIGN KEY ("reports_to_node_id") REFERENCES "org_chart_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

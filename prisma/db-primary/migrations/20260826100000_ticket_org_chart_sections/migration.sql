-- RFP intake: requestor section + send-to section on tickets
ALTER TABLE "tickets" ADD COLUMN "requestor_org_chart_section_id" TEXT;
ALTER TABLE "tickets" ADD COLUMN "org_chart_section_id" TEXT;

CREATE INDEX "tickets_org_chart_section_id_idx" ON "tickets"("org_chart_section_id");
CREATE INDEX "tickets_requestor_org_chart_section_id_idx" ON "tickets"("requestor_org_chart_section_id");

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_requestor_org_chart_section_id_fkey"
  FOREIGN KEY ("requestor_org_chart_section_id") REFERENCES "org_chart_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_org_chart_section_id_fkey"
  FOREIGN KEY ("org_chart_section_id") REFERENCES "org_chart_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

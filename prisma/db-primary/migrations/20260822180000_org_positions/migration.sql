-- Positions, departments, and org-chart user extensions

CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company_team_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level_rank" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "position_assignments" (
    "id" TEXT NOT NULL,
    "position_id" TEXT NOT NULL,
    "merged_source_user_id" TEXT NOT NULL,
    "company_team_id" TEXT,
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "is_acting" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "position_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "departments_company_team_id_name_key" ON "departments"("company_team_id", "name");
CREATE INDEX "departments_company_team_id_is_active_idx" ON "departments"("company_team_id", "is_active");

CREATE UNIQUE INDEX "positions_code_key" ON "positions"("code");
CREATE INDEX "positions_level_rank_is_active_idx" ON "positions"("level_rank", "is_active");

CREATE INDEX "position_assignments_position_id_company_team_id_idx" ON "position_assignments"("position_id", "company_team_id");
CREATE INDEX "position_assignments_merged_source_user_id_idx" ON "position_assignments"("merged_source_user_id");

ALTER TABLE "departments" ADD CONSTRAINT "departments_company_team_id_fkey" FOREIGN KEY ("company_team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "position_assignments" ADD CONSTRAINT "position_assignments_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "position_assignments" ADD CONSTRAINT "position_assignments_company_team_id_fkey" FOREIGN KEY ("company_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "portal_accounts" ADD COLUMN "primary_position_id" TEXT;
ALTER TABLE "portal_accounts" ADD COLUMN "department_id" TEXT;
ALTER TABLE "portal_accounts" ADD COLUMN "reports_to_portal_account_id" TEXT;

ALTER TABLE "org_chart_nodes" ADD COLUMN "primary_position_id" TEXT;

CREATE INDEX "portal_accounts_primary_position_id_idx" ON "portal_accounts"("primary_position_id");
CREATE INDEX "portal_accounts_department_id_idx" ON "portal_accounts"("department_id");
CREATE INDEX "portal_accounts_reports_to_portal_account_id_idx" ON "portal_accounts"("reports_to_portal_account_id");
CREATE INDEX "org_chart_nodes_primary_position_id_idx" ON "org_chart_nodes"("primary_position_id");

ALTER TABLE "portal_accounts" ADD CONSTRAINT "portal_accounts_primary_position_id_fkey" FOREIGN KEY ("primary_position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "portal_accounts" ADD CONSTRAINT "portal_accounts_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "portal_accounts" ADD CONSTRAINT "portal_accounts_reports_to_portal_account_id_fkey" FOREIGN KEY ("reports_to_portal_account_id") REFERENCES "portal_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "org_chart_nodes" ADD CONSTRAINT "org_chart_nodes_primary_position_id_fkey" FOREIGN KEY ("primary_position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default position catalog (ACA RA/AP + RFP procedural roles + finance)
INSERT INTO "positions" ("id", "code", "name", "level_rank", "description", "is_active", "created_at", "updated_at") VALUES
  ('pos_ra_1', 'RA_1', 'RA 1 — Store/Branch Head/Supervisor', 1, 'ACA recommending level 1', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_ra_2', 'RA_2', 'RA 2 — Regional/Area Manager/SBU Head', 2, 'ACA recommending level 2', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_ra_3', 'RA_3', 'RA 3 — General Sales Manager/Department Head', 3, 'ACA recommending level 3', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_ra_4', 'RA_4', 'RA 4 — Any ExeCom', 4, 'ACA recommending level 4', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_ra_ex', 'EXECOM', 'ExeCom (recommending)', 5, 'ACA ExeCom recommending seat', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_ap_1', 'AP_1', 'AP 1 — Store/Branch Head/Supervisor', 1, 'ACA approving path 1', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_ap_2', 'AP_2', 'AP 2 — Regional/Area Manager/SBU Head', 2, 'ACA approving path 2', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_ap_3', 'AP_3', 'AP 3 — General Sales Manager/Department Head', 3, 'ACA approving path 3', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_ap_4', 'AP_4', 'AP 4 — ExeCom', 4, 'ACA approving path 4', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_ap_4x', 'FOUR_EXECOMS', '4 ExeComs', 5, 'ACA four ExeCom approving seats', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_ap_all', 'ALL_EXECOM', 'All ExeCom', 6, 'ACA all ExeCom approving seats', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_fin', 'FINANCE', 'Finance Manager', 3, 'ACA finance validation / finance approver', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_rfp_note', 'RFP_NOTED_BY', 'RFP — Noted By', 2, 'Request for Payment noted-by step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_rfp_appr', 'RFP_APPROVED_BY', 'RFP — Approved By', 3, 'Request for Payment approved-by step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_rfp_acct', 'RFP_BOOKKEEPER', 'RFP — Prepared by Bookkeeper', 3, 'Request for Payment accounting step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_rfp_fin', 'RFP_FINANCE', 'RFP — Approved By Accounting', 4, 'Request for Payment finance step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_rs_canvas', 'RS_CANVASSED_BY', 'RS — Canvassed By', 2, 'Item Requisition Slip canvassed-by step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_rs_appr', 'RS_APPROVED_BY', 'RS — Approved By', 3, 'Item Requisition Slip approved-by step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_ftr_rec', 'FTR_RECOMMENDING', 'FTR — Recommending Approval', 2, 'Fund Transfer recommending-approval step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_ftr_appr', 'FTR_APPROVED_BY', 'FTR — Approved By', 3, 'Fund Transfer approved-by step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_jo_note', 'JO_NOTED_BY', 'JO — Noted By', 2, 'Job Order noted-by step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_jo_appr', 'JO_APPROVED_BY', 'JO — Approved By (1)', 3, 'Job Order first approved-by step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_jo_appr2', 'JO_APPROVED_BY_2', 'JO — Approved By (2)', 4, 'Job Order second approved-by step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_to_l2', 'TRAVEL_APPROVER_L2', 'Travel Order — Layer 2 Approver', 2, 'Default travel-order approval layer', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

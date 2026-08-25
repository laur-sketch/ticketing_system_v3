-- RS / FTR / JO procedural approval positions

INSERT INTO "positions" ("id", "code", "name", "level_rank", "description", "is_active", "created_at", "updated_at") VALUES
  ('pos_rs_canvas', 'RS_CANVASSED_BY', 'RS — Canvassed By', 2, 'Item Requisition Slip canvassed-by step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_rs_appr', 'RS_APPROVED_BY', 'RS — Approved By', 3, 'Item Requisition Slip approved-by step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_ftr_rec', 'FTR_RECOMMENDING', 'FTR — Recommending Approval', 2, 'Fund Transfer recommending-approval step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_ftr_appr', 'FTR_APPROVED_BY', 'FTR — Approved By', 3, 'Fund Transfer approved-by step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_jo_note', 'JO_NOTED_BY', 'JO — Noted By', 2, 'Job Order noted-by step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_jo_appr', 'JO_APPROVED_BY', 'JO — Approved By (1)', 3, 'Job Order first approved-by step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pos_jo_appr2', 'JO_APPROVED_BY_2', 'JO — Approved By (2)', 4, 'Job Order second approved-by step', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

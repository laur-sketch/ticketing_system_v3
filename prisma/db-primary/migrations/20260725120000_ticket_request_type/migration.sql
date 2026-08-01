-- Store intake request type on tickets (ISSUE/CONCERN TICKET, payment, requisition, fund transfer).

ALTER TABLE "tickets"
  ADD COLUMN IF NOT EXISTS "request_type" TEXT NOT NULL DEFAULT 'ISSUE_CONCERN_TICKET';

CREATE INDEX IF NOT EXISTS "tickets_request_type_idx" ON "tickets"("request_type");

-- Helpdesk spreadsheet export rows (Insights task metrics USER SUPPORT / HELPDESK when imported).
CREATE TABLE "HelpdeskCsvTicket" (
    "id" TEXT NOT NULL,
    "sheetRowId" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "statusRaw" TEXT NOT NULL,
    "normalizedBucket" TEXT NOT NULL,
    "userEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpdeskCsvTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HelpdeskCsvTicket_sheetRowId_key" ON "HelpdeskCsvTicket"("sheetRowId");
CREATE INDEX "HelpdeskCsvTicket_reportedAt_idx" ON "HelpdeskCsvTicket"("reportedAt");
CREATE INDEX "HelpdeskCsvTicket_resolvedAt_idx" ON "HelpdeskCsvTicket"("resolvedAt");
CREATE INDEX "HelpdeskCsvTicket_normalizedBucket_reportedAt_idx" ON "HelpdeskCsvTicket"("normalizedBucket", "reportedAt");

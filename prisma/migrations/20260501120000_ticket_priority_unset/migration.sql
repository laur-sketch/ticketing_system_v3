-- Add triage default priority (appended to PostgreSQL enum).
ALTER TYPE "TicketPriority" ADD VALUE IF NOT EXISTS 'UNSET';

-- Default for newly created rows (existing rows keep their current priority).
ALTER TABLE "Ticket" ALTER COLUMN "priority" SET DEFAULT 'UNSET'::"TicketPriority";

-- SLA row for UNSET (aligned with Low until staff sets priority).
INSERT INTO "SlaPolicy" ("id", "priority", "firstResponseHours", "resolutionHours")
VALUES ('cmunsetslapolicy1', 'UNSET'::"TicketPriority", 24::double precision, 72::double precision)
ON CONFLICT ("priority") DO NOTHING;

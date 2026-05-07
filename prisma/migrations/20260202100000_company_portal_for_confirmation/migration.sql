-- New status: awaiting customer confirmation (replaces prior "resolved pending rating" use of RESOLVED in many flows)
ALTER TYPE "TicketStatus" ADD VALUE 'FOR_CONFIRMATION';

-- Portal: customer company + org role (Head / Personnel)
ALTER TABLE "PortalAccount" ADD COLUMN "companyId" TEXT,
ADD COLUMN "customerOrgRole" TEXT;

ALTER TABLE "PortalAccount" ADD CONSTRAINT "PortalAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Move legacy "resolved awaiting customer" rows to the new status
UPDATE "Ticket" SET status = 'FOR_CONFIRMATION' WHERE status = 'RESOLVED';

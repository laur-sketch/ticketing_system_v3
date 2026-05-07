-- Head coordination on portal accounts (replaces legacy Agent.accountRole = HEAD).
ALTER TABLE "PortalAccount" ADD COLUMN IF NOT EXISTS "headPrivileges" BOOLEAN NOT NULL DEFAULT false;

-- Legacy column removed from Prisma schema; safe if already absent.
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "accountRole";

DROP TYPE IF EXISTS "AgentAccountRole";

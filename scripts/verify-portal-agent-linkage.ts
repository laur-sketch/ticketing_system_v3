/**
 * Verify portal accounts resolve to Agent rows (operatorAgentId for Task Board).
 * Usage: npx tsx scripts/verify-portal-agent-linkage.ts
 */
import { PrismaClient } from "@prisma/client";
import { pickCanonicalAgentForPortal } from "../src/lib/admin-roster";
import { isStaffPortalRole } from "../src/lib/staff-role";

const prisma = new PrismaClient();

async function main() {
  const [portals, agents] = await Promise.all([
    prisma.portalAccount.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        role: true,
        accountStatus: true,
        staffDesignatedCompanyId: true,
        staffDesignatedCompany: { select: { name: true } },
      },
    }),
    prisma.agent.findMany({
      include: { team: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  type Row = {
    role: string;
    name: string;
    email: string;
    username: string | null;
    status: string;
    designatedCompany: string | null;
    hasAgentRow: boolean;
    agentId: string | null;
    agentTeam: string | null;
    operatorAgentIdWouldResolve: boolean;
  };

  const rows: Row[] = portals.map((p) => {
    const agent = pickCanonicalAgentForPortal(p, agents);
    return {
      role: p.role,
      name: p.name,
      email: p.email,
      username: p.username,
      status: p.accountStatus,
      designatedCompany: p.staffDesignatedCompany?.name ?? null,
      hasAgentRow: !!agent,
      agentId: agent?.id ?? null,
      agentTeam: agent?.team?.name ?? null,
      operatorAgentIdWouldResolve: !!agent,
    };
  });

  const byRole: Record<string, { total: number; withAgent: number; withoutAgent: number }> = {};
  for (const r of rows) {
    byRole[r.role] ??= { total: 0, withAgent: 0, withoutAgent: 0 };
    byRole[r.role].total += 1;
    if (r.hasAgentRow) byRole[r.role].withAgent += 1;
    else byRole[r.role].withoutAgent += 1;
  }

  console.log("=== Portal account → Agent linkage summary ===");
  console.log(JSON.stringify(byRole, null, 2));

  console.log("\n=== Admin accounts (operatorAgentId / bullet 1) ===");
  const admins = rows.filter((r) => r.role === "Admin");
  if (admins.length === 0) console.log("No Admin portal accounts found.");
  else console.log(JSON.stringify(admins, null, 2));

  console.log("\n=== Staff without Agent row ===");
  const missing = rows.filter((r) => isStaffPortalRole(r.role) && !r.hasAgentRow);
  if (missing.length === 0) console.log("None — all staff portal accounts resolve to an Agent row.");
  else console.log(JSON.stringify(missing, null, 2));

  console.log("\n=== SuperAdmin accounts ===");
  console.log(JSON.stringify(rows.filter((r) => r.role === "SuperAdmin"), null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

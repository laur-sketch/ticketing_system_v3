import { NextResponse } from "next/server";
import { pickCanonicalAgentForPortal, portalStaffHasAgentRow } from "@/lib/admin-roster";
import { requireRole } from "@/lib/access";
import { findPortalByEmailOnly } from "@/lib/portal-account";
import { prisma } from "@/lib/prisma";
import { isStaffPortalRole } from "@/lib/staff-role";

export async function GET() {
  const { unauthorized } = await requireRole(["Admin"]);
  if (unauthorized) return unauthorized;

  const [agents, teams, portalPersonnelRaw] = await Promise.all([
    prisma.agent.findMany({
      include: { team: true },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.portalAccount.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        passwordHash: true,
        accountStatus: true,
        role: true,
        staffDesignatedCompanyId: true,
        staffDesignatedCompany: { select: { id: true, name: true } },
      },
    }),
  ]);
  const portalPersonnel = portalPersonnelRaw.filter((p) => isStaffPortalRole(p.role));

  /** One roster row per staff portal account (avoids duplicate Agent rows for same person). */
  const personnel = portalPersonnel
    .map((p) => {
      const a = pickCanonicalAgentForPortal(p, agents);
      if (!a) return null;
      return {
        ...a,
        email: p.email.trim().toLowerCase(),
        accountStatus: p.accountStatus ?? "ACTIVE",
        portalAccountId: p.id,
        staffRole: p.role,
        designatedCompanyId: p.staffDesignatedCompanyId,
        designatedCompanyName: p.staffDesignatedCompany?.name ?? null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const pendingPersonnel = portalPersonnel.filter((p) => !portalStaffHasAgentRow(p, agents));

  return NextResponse.json({ personnel, teams, pendingPersonnel });
}

export async function POST(req: Request) {
  const { unauthorized } = await requireRole(["Admin"]);
  if (unauthorized) return unauthorized;
  const body = await req.json();
  const email = (body.email as string | undefined)?.trim().toLowerCase();
  const teamId = body.teamId as string | undefined;

  if (!email || !teamId) {
    return NextResponse.json({ error: "email and teamId are required." }, { status: 400 });
  }

  const account = await findPortalByEmailOnly(email);
  if (!account) {
    return NextResponse.json(
      { error: "No registered account found for this email. Ask the person to sign up first." },
      { status: 400 },
    );
  }
  if (!isStaffPortalRole(account.role)) {
    return NextResponse.json(
      { error: "Account exists, but role must be a staff role to add as personnel." },
      { status: 400 },
    );
  }

  try {
    const agent = await prisma.agent.create({
      data: { name: account.name, email: account.email, teamId },
      include: { team: true },
    });
    return NextResponse.json(agent, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
      return NextResponse.json({ error: "This registered account is already in personnel." }, { status: 409 });
    }
    throw e;
  }
}

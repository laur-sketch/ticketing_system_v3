import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ensureAgentRowForPortalStaff, pickCanonicalAgentForPortal } from "@/lib/admin-roster";
import { rosterTeamNameFilter, sortByRosterOrder, COMPANY_ROSTER } from "@/lib/company-roster";
import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import {
  isAdminEligibleStaffRole,
  isStaffPortalRole,
  normalizePortalRole,
  PORTAL_ROLES,
} from "@/lib/staff-role";

const MANAGEABLE_ROLES = new Set<string>(PORTAL_ROLES);

export async function GET() {
  const { unauthorized } = await requireRole(["SuperAdmin"]);
  if (unauthorized) return unauthorized;

  const [portalRows, rosterTeams, agents] = await Promise.all([
    prisma.portalAccount.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        email: true,
        name: true,
        role: true,
        headPrivileges: true,
        accountStatus: true,
        companyId: true,
        customerOrgRole: true,
        staffDesignatedCompanyId: true,
        company: { select: { id: true, name: true } },
        staffDesignatedCompany: { select: { id: true, name: true } },
        createdAt: true,
      },
    }),
    prisma.team.findMany({
      where: rosterTeamNameFilter(),
      select: { id: true, name: true },
    }),
    prisma.agent.findMany({
      include: { team: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const accounts = portalRows.map((row) => {
    const staff = isStaffPortalRole(row.role);
    const canonical = staff ? pickCanonicalAgentForPortal(row, agents) : null;
    return {
      ...row,
      agentId: canonical?.id ?? null,
      queueTeamId: canonical?.teamId ?? null,
      queueTeamName: canonical?.team?.name ?? null,
      onPersonnelRoster: Boolean(staff && canonical),
    };
  });

  return NextResponse.json({
    accounts,
    rosterCompanies: sortByRosterOrder(rosterTeams),
  });
}

export async function PATCH(req: Request) {
  const { unauthorized } = await requireRole(["SuperAdmin"]);
  if (unauthorized) return unauthorized;

  const body = (await req.json()) as {
    id?: string;
    role?: string;
    headPrivileges?: boolean;
    companyId?: string | null;
    customerOrgRole?: string | null;
    staffDesignatedCompanyId?: string | null;
  };
  const id = body.id?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const existing = await prisma.portalAccount.findUnique({
    where: { id },
    select: {
      role: true,
      headPrivileges: true,
      companyId: true,
      customerOrgRole: true,
      staffDesignatedCompanyId: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const data: Prisma.PortalAccountUpdateInput = {};

  if (body.role !== undefined) {
    const role = body.role.trim();
    if (!MANAGEABLE_ROLES.has(role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    data.role = role;
    data.headPrivileges = role === "Admin";
    if (role !== "Customer") {
      data.company = { disconnect: true };
      data.customerOrgRole = null;
    }
  }

  if (body.headPrivileges !== undefined) {
    const nextRoleRaw = (typeof data.role === "string" ? data.role : existing.role) as string;
    if (!isAdminEligibleStaffRole(nextRoleRaw)) {
      return NextResponse.json(
        { error: "Company coordination applies only to Admin staff accounts." },
        { status: 400 },
      );
    }
    data.headPrivileges = Boolean(body.headPrivileges);
  }

  const companyPatchRequested = body.companyId !== undefined || body.customerOrgRole !== undefined;
  if (companyPatchRequested) {
    const effectiveRoleRaw = (typeof data.role === "string" ? data.role : existing.role) as string;
    const effectiveRole = normalizePortalRole(effectiveRoleRaw) ?? effectiveRoleRaw;
    if (effectiveRole !== "Customer") {
      return NextResponse.json(
        { error: "Company and customer org role apply only to Customer portal accounts." },
        { status: 400 },
      );
    }

    if (body.companyId !== undefined) {
      if (body.companyId === null || body.companyId === "") {
        data.company = { disconnect: true };
        data.customerOrgRole = null;
      } else {
        const cid = String(body.companyId).trim();
        const team = await prisma.team.findUnique({ where: { id: cid }, select: { name: true } });
        if (!team || !(COMPANY_ROSTER as readonly string[]).includes(team.name)) {
          return NextResponse.json({ error: "Invalid company queue." }, { status: 400 });
        }
        data.company = { connect: { id: cid } };
        const orgRaw =
          body.customerOrgRole !== undefined ? body.customerOrgRole : existing.customerOrgRole;
        const org = orgRaw === "Head" ? "Admin" : orgRaw;
        if (org !== "Admin" && org !== "Personnel") {
          return NextResponse.json(
            { error: "Customer org role must be Admin or Personnel when a company is set." },
            { status: 400 },
          );
        }
        data.customerOrgRole = org;
      }
    } else if (body.customerOrgRole !== undefined) {
      if (!existing.companyId) {
        return NextResponse.json(
          { error: "Set a company queue before updating customer org role." },
          { status: 400 },
        );
      }
      const orgRaw = body.customerOrgRole;
      const org = orgRaw === "Head" ? "Admin" : orgRaw;
      if (org !== null && org !== "Admin" && org !== "Personnel") {
        return NextResponse.json({ error: "Org role must be Admin or Personnel." }, { status: 400 });
      }
      data.customerOrgRole = org;
    }
  }

  const staffCompanyPatch = body.staffDesignatedCompanyId !== undefined;
  if (staffCompanyPatch) {
    const effectiveRoleRaw = (typeof data.role === "string" ? data.role : existing.role) as string;
    const effective = normalizePortalRole(effectiveRoleRaw);
    if (effective !== "Admin" && effective !== "Personnel" && effective !== "Customer") {
      return NextResponse.json(
        { error: "Designated company applies only to Admin, Personnel, or Customer portal accounts." },
        { status: 400 },
      );
    }
    if (body.staffDesignatedCompanyId === null || body.staffDesignatedCompanyId === "") {
      data.staffDesignatedCompany = { disconnect: true };
    } else {
      const tid = String(body.staffDesignatedCompanyId).trim();
      const team = await prisma.team.findUnique({ where: { id: tid }, select: { name: true } });
      if (!team || !(COMPANY_ROSTER as readonly string[]).includes(team.name)) {
        return NextResponse.json({ error: "Invalid designated company." }, { status: 400 });
      }
      data.staffDesignatedCompany = { connect: { id: tid } };
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Provide role, headPrivileges, company, and/or staff designated company fields." },
      { status: 400 },
    );
  }

  const updated = await prisma.portalAccount.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      headPrivileges: true,
      companyId: true,
      customerOrgRole: true,
      staffDesignatedCompanyId: true,
      company: { select: { id: true, name: true } },
      staffDesignatedCompany: { select: { id: true, name: true } },
      createdAt: true,
    },
  });

  /**
   * Once a SuperAdmin assigns a designated company to a staff portal account,
   * make sure the matching Agent row exists on that team — no separate
   * "awaiting team assignment" step is required.
   */
  if (
    staffCompanyPatch &&
    updated.staffDesignatedCompanyId &&
    isStaffPortalRole(updated.role)
  ) {
    try {
      await ensureAgentRowForPortalStaff(
        { email: updated.email, name: updated.name },
        updated.staffDesignatedCompanyId,
      );
    } catch (e) {
      console.error("ensureAgentRowForPortalStaff failed", e);
    }
  }

  return NextResponse.json({ ok: true, account: updated });
}

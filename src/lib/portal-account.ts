import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizePortalRole } from "@/lib/staff-role";

const SALT_ROUNDS = 12;

export type PortalRow = {
  id: string;
  username: string | null;
  email: string;
  name: string;
  role: string;
  passwordHash: string;
  companyId: string | null;
  customerOrgRole: string | null;
  companyName: string | null;
  staffDesignatedCompanyId: string | null;
  staffDesignatedCompanyName: string | null;
};

/** Match portal row by unique username or unique email (case-insensitive). */
export async function findPortalByLogin(loginId: string): Promise<PortalRow | null> {
  const trimmed = loginId.trim();
  if (!trimmed) return null;
  const row = await prisma.portalAccount.findFirst({
    where: {
      OR: [
        { email: { equals: trimmed, mode: "insensitive" } },
        { username: { equals: trimmed, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      passwordHash: true,
      companyId: true,
      customerOrgRole: true,
      staffDesignatedCompanyId: true,
      company: { select: { name: true } },
      staffDesignatedCompany: { select: { name: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    name: row.name,
    role: row.role,
    passwordHash: row.passwordHash,
    companyId: row.companyId,
    customerOrgRole: row.customerOrgRole,
    companyName: row.company?.name ?? null,
    staffDesignatedCompanyId: row.staffDesignatedCompanyId,
    staffDesignatedCompanyName: row.staffDesignatedCompany?.name ?? null,
  };
}

export async function findPortalByUsername(username: string): Promise<PortalRow | null> {
  const u = username.trim();
  if (!u) return null;
  const row = await prisma.portalAccount.findFirst({
    where: { username: { equals: u, mode: "insensitive" } },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      passwordHash: true,
      companyId: true,
      customerOrgRole: true,
      staffDesignatedCompanyId: true,
      company: { select: { name: true } },
      staffDesignatedCompany: { select: { name: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    name: row.name,
    role: row.role,
    passwordHash: row.passwordHash,
    companyId: row.companyId,
    customerOrgRole: row.customerOrgRole,
    companyName: row.company?.name ?? null,
    staffDesignatedCompanyId: row.staffDesignatedCompanyId,
    staffDesignatedCompanyName: row.staffDesignatedCompany?.name ?? null,
  };
}

export async function findPortalByEmailOnly(email: string): Promise<PortalRow | null> {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const row = await prisma.portalAccount.findFirst({
    where: { email: { equals: e, mode: "insensitive" } },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      passwordHash: true,
      companyId: true,
      customerOrgRole: true,
      staffDesignatedCompanyId: true,
      company: { select: { name: true } },
      staffDesignatedCompany: { select: { name: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    name: row.name,
    role: row.role,
    passwordHash: row.passwordHash,
    companyId: row.companyId,
    customerOrgRole: row.customerOrgRole,
    companyName: row.company?.name ?? null,
    staffDesignatedCompanyId: row.staffDesignatedCompanyId,
    staffDesignatedCompanyName: row.staffDesignatedCompany?.name ?? null,
  };
}

const SIGNUP_ROLES = ["Customer", "Personnel"] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

export function isSignupRole(r: string): r is SignupRole {
  return (SIGNUP_ROLES as readonly string[]).includes(r);
}

export async function createPortalAccount(input: {
  username: string;
  email: string;
  name: string;
  password: string;
  role: SignupRole;
  companyId?: string | null;
  customerOrgRole?: string | null;
}): Promise<{ ok: true } | { ok: false; code: "DUPLICATE" | "ERROR" }> {
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const username = input.username.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  const role = input.role;
  let companyId: string | null = null;
  let customerOrgRole: string | null = null;
  if (role === "Customer") {
    companyId = input.companyId?.trim() ? input.companyId!.trim() : null;
    const org = (input.customerOrgRole ?? "").trim();
    const normalized = org === "Head" ? "Admin" : org;
    customerOrgRole = ["Admin", "Personnel"].includes(normalized) ? normalized : null;
  }
  try {
    await prisma.portalAccount.create({
      data: {
        id,
        username,
        email,
        name: input.name.trim(),
        passwordHash,
        role,
        ...(companyId
          ? { company: { connect: { id: companyId } } }
          : { companyId: null }),
        customerOrgRole,
      },
    });
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const duplicate = msg.includes("Unique") || msg.includes("duplicate");
    return { ok: false, code: duplicate ? "DUPLICATE" : "ERROR" };
  }
}

/**
 * Ensure OAuth users are linked to a portal row by email.
 * Keeps existing company/org-role assignments intact.
 */
export async function upsertPortalOAuthAccount(input: {
  email: string;
  name: string;
  role?: string;
}): Promise<PortalRow | null> {
  const email = input.email.trim().toLowerCase();
  if (!email) return null;
  const parsed = normalizePortalRole(input.role ?? "");
  const role =
    parsed === "Personnel" || parsed === "Customer"
      ? parsed
      : isSignupRole(String(input.role ?? ""))
        ? (String(input.role) as SignupRole)
        : "Customer";
  const name = input.name.trim() || email.split("@")[0] || "User";

  await prisma.portalAccount.upsert({
    where: { email },
    create: {
      id: randomUUID(),
      email,
      name,
      role,
      passwordHash: await bcrypt.hash(randomUUID(), SALT_ROUNDS),
      headPrivileges: false,
    },
    update: {
      name,
    },
  });

  return findPortalByEmailOnly(email);
}

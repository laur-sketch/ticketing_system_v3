import { randomUUID } from "node:crypto";
import { ensureAgentRowForPortalStaff } from "@/lib/admin-roster";
import {
  type CanonicalUserProfile,
  type SyncPortalProfileOptions,
  fallbackEmailFromUsername,
  normalizeCanonicalEmail,
  type SyncSource,
} from "@/lib/auth/canonical-user-profile";
import { mapHrisToPortalRole } from "@/lib/auth/role-mapping";
import { resolveRosterCompanyName } from "@/lib/hris-company-aliases";
import { prismaAuth, prismaPrimary } from "@/lib/prisma";
import { normalizePortalRole, type PortalRole } from "@/lib/staff-role";

export type SyncPortalProfileResult = {
  authUserId: string;
  portalAccountId: string;
  created: boolean;
};

type ExistingPortalRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  headPrivileges: boolean;
  username: string | null;
  companyId: string | null;
  staffDesignatedCompanyId: string | null;
  profileImage: string | null;
  authUserId: string | null;
};

type RoleMappingRow = {
  portalRole: string;
  headPrivileges: boolean;
};

async function loadRoleMapping(hrisRole: string | null | undefined): Promise<RoleMappingRow | null> {
  const key = (hrisRole ?? "").trim().toLowerCase();
  if (!key) return null;
  try {
    return await prismaAuth.roleMapping.findUnique({
      where: { hrisRole: key },
      select: { portalRole: true, headPrivileges: true },
    });
  } catch (e) {
    // Auth DB not migrated yet (missing auth_role_mappings) — fall back to code defaults.
    const code = (e as { code?: string }).code;
    if (code === "P2021" || code === "P2022") return null;
    throw e;
  }
}

async function resolvePortalRole(profile: CanonicalUserProfile): Promise<{
  portalRole: PortalRole;
  headPrivileges: boolean;
}> {
  const dbMapping = await loadRoleMapping(profile.hrisRole);
  const mapped = mapHrisToPortalRole(
    {
      hrisRole: profile.hrisRole ?? profile.portalRole,
      position: profile.position,
      department: profile.department,
    },
    dbMapping
      ? {
          portalRole: normalizePortalRole(dbMapping.portalRole) ?? undefined,
          headPrivileges: dbMapping.headPrivileges,
        }
      : {
          portalRole: profile.portalRole,
          headPrivileges: profile.headPrivileges,
        },
  );
  return mapped;
}

async function upsertAuthCompany(profile: CanonicalUserProfile): Promise<string | null> {
  const name = profile.companyName?.trim();
  if (!name) return null;

  try {
    const company = await prismaAuth.company.upsert({
      where: { name },
      create: {
        name,
        externalId: profile.companyExternalId ?? null,
      },
      update: {
        externalId: profile.companyExternalId ?? undefined,
      },
      select: { id: true },
    });
    return company.id;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "P2021" || code === "P2022") return null;
    throw e;
  }
}

async function resolvePrimaryTeamId(companyName: string | null | undefined): Promise<string | null> {
  const rosterName = resolveRosterCompanyName(companyName);
  if (!rosterName) return null;
  const team = await prismaPrimary.team.findFirst({
    where: { name: rosterName },
    select: { id: true },
  });
  return team?.id ?? null;
}

/**
 * Conflict policy when syncing HRIS/OAuth → Primary portal_accounts:
 * - Profile fields (name, username, image): always refresh from canonical source.
 * - Role: upgrade Customer → staff; never downgrade SuperAdmin/Admin/Personnel automatically.
 * - headPrivileges: set when mapping says Admin head; never clear existing true without manual admin action.
 */
function buildPortalRoleUpdate(
  existing: ExistingPortalRow,
  incoming: { portalRole: PortalRole; headPrivileges: boolean },
  forceRoleRefresh = false,
): { role?: PortalRole; headPrivileges?: boolean } {
  if (forceRoleRefresh) {
    return { role: incoming.portalRole, headPrivileges: incoming.headPrivileges };
  }

  const existingNorm = normalizePortalRole(existing.role) ?? (existing.role as PortalRole);
  const update: { role?: PortalRole; headPrivileges?: boolean } = {};

  if (existingNorm === "SuperAdmin") {
    return update;
  }

  if (existingNorm === "Customer" && incoming.portalRole !== "Customer") {
    update.role = incoming.portalRole;
    update.headPrivileges = incoming.headPrivileges;
  } else if (
    existingNorm === "Personnel" &&
    (incoming.portalRole === "Admin" || incoming.portalRole === "SuperAdmin")
  ) {
    update.role = incoming.portalRole;
    if (incoming.headPrivileges) update.headPrivileges = true;
  } else if (incoming.headPrivileges && !existing.headPrivileges) {
    update.headPrivileges = true;
  }

  return update;
}

async function upsertAuthUser(
  profile: CanonicalUserProfile,
  portalAccountId: string | null,
  companyId: string | null,
  mapped: { portalRole: PortalRole; headPrivileges: boolean },
) {
  const email = normalizeCanonicalEmail(profile.email);
  const username = profile.username?.trim().toLowerCase() || null;

  let authUser = await prismaAuth.user.findUnique({ where: { email } });

  if (!authUser && profile.hrisSourceUserId != null) {
    authUser = await prismaAuth.user.findUnique({
      where: { hrisSourceUserId: profile.hrisSourceUserId },
    });
  }

  const data = {
    email,
    name: profile.name,
    username,
    image: profile.image ?? null,
    emailVerified: profile.emailVerified ? new Date() : undefined,
    portalAccountId: portalAccountId ?? undefined,
    hrisSourceUserId: profile.hrisSourceUserId ?? undefined,
    hrisRole: profile.hrisRole ?? undefined,
    portalRole: mapped.portalRole,
    headPrivileges: mapped.headPrivileges,
    companyId,
    lastSyncedAt: new Date(),
  };

  if (!authUser) {
    authUser = await prismaAuth.user.create({ data });
  } else {
    authUser = await prismaAuth.user.update({
      where: { id: authUser.id },
      data: {
        ...data,
        emailVerified: profile.emailVerified
          ? authUser.emailVerified ?? new Date()
          : authUser.emailVerified,
        portalAccountId: authUser.portalAccountId ?? portalAccountId ?? undefined,
      },
    });
  }

  if (profile.oauth) {
    await prismaAuth.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: profile.oauth.provider,
          providerAccountId: profile.oauth.providerAccountId,
        },
      },
      create: {
        userId: authUser.id,
        type: "oauth",
        provider: profile.oauth.provider,
        providerAccountId: profile.oauth.providerAccountId,
      },
      update: { userId: authUser.id },
    });
  }

  return authUser;
}

function isAuthSchemaError(e: unknown): boolean {
  const code = (e as { code?: string }).code;
  return code === "P2021" || code === "P2022" || code === "P2010";
}

async function findExistingPortal(
  email: string,
  username: string | null,
  hrisSourceUserId?: bigint | null,
): Promise<ExistingPortalRow | null> {
  if (hrisSourceUserId != null) {
    const bySource = await prismaPrimary.portalAccount.findFirst({
      where: { mergedSourceUserId: hrisSourceUserId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        headPrivileges: true,
        username: true,
        companyId: true,
        staffDesignatedCompanyId: true,
        profileImage: true,
        authUserId: true,
      },
    });
    if (bySource) return bySource;
  }

  const byEmail = await prismaPrimary.portalAccount.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      headPrivileges: true,
      username: true,
      companyId: true,
      staffDesignatedCompanyId: true,
      profileImage: true,
      authUserId: true,
    },
  });
  if (byEmail) return byEmail;

  if (username) {
    return prismaPrimary.portalAccount.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        headPrivileges: true,
        username: true,
        companyId: true,
        staffDesignatedCompanyId: true,
        profileImage: true,
        authUserId: true,
      },
    });
  }
  return null;
}

async function upsertPortalAccount(
  profile: CanonicalUserProfile,
  authUserId: string | null,
  mapped: { portalRole: PortalRole; headPrivileges: boolean },
  teamId: string | null,
  forceRoleRefresh = false,
): Promise<{ portal: ExistingPortalRow; created: boolean }> {
  const email = normalizeCanonicalEmail(profile.email);
  const username = profile.username?.trim().toLowerCase() || null;
  const isStaff =
    mapped.portalRole === "Admin" ||
    mapped.portalRole === "Personnel" ||
    mapped.portalRole === "SuperAdmin";

  const existing = await findExistingPortal(email, username, profile.hrisSourceUserId);

  if (existing) {
    const roleUpdate = buildPortalRoleUpdate(existing, mapped, forceRoleRefresh);
    let usernameUpdate: string | undefined = username ?? existing.username ?? undefined;
    if (username && existing.username?.toLowerCase() !== username) {
      const conflict = await prismaPrimary.portalAccount.findFirst({
        where: {
          username: { equals: username, mode: "insensitive" },
          NOT: { id: existing.id },
        },
        select: { id: true },
      });
      if (conflict) usernameUpdate = existing.username ?? undefined;
    }

    await prismaPrimary.portalAccount.update({
      where: { id: existing.id },
      data: {
        name: profile.name,
        username: usernameUpdate,
        authUserId,
        mergedSourceUserId: profile.hrisSourceUserId ?? undefined,
        emailVerifiedAt: profile.emailVerified ? new Date() : undefined,
        profileSyncedAt: new Date(),
        ...(profile.image && !existing.profileImage ? { profileImage: profile.image } : {}),
        ...roleUpdate,
        ...(teamId && isStaff ? { staffDesignatedCompanyId: teamId } : {}),
      },
    });

    const refreshed = await prismaPrimary.portalAccount.findUniqueOrThrow({
      where: { id: existing.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        headPrivileges: true,
        username: true,
        companyId: true,
        staffDesignatedCompanyId: true,
        profileImage: true,
        authUserId: true,
      },
    });
    return { portal: refreshed, created: false };
  }

  const id = randomUUID();
  const created = await prismaPrimary.portalAccount.create({
    data: {
      id,
      email,
      username,
      name: profile.name,
      role: mapped.portalRole,
      headPrivileges: mapped.headPrivileges,
      passwordHash: null,
      authUserId,
      mergedSourceUserId: profile.hrisSourceUserId ?? null,
      emailVerifiedAt: profile.emailVerified ? new Date() : null,
      profileImage: profile.image ?? null,
      profileSyncedAt: new Date(),
      staffDesignatedCompanyId: isStaff && teamId ? teamId : null,
      ...(profile.oauth
        ? {
            oauthProvider: profile.oauth.provider,
            oauthSubject: profile.oauth.providerAccountId,
          }
        : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      headPrivileges: true,
      username: true,
      companyId: true,
      staffDesignatedCompanyId: true,
      profileImage: true,
      authUserId: true,
    },
  });

  return { portal: created, created: true };
}

async function ensureAgentRow(portal: ExistingPortalRow): Promise<void> {
  const role = normalizePortalRole(portal.role);
  const isStaff = role === "Admin" || role === "Personnel" || role === "SuperAdmin";
  if (!isStaff || !portal.staffDesignatedCompanyId) return;

  try {
    await ensureAgentRowForPortalStaff(
      { email: portal.email, name: portal.name },
      portal.staffDesignatedCompanyId,
    );
  } catch (e) {
    console.error("[sync-portal-profile] ensureAgentRowForPortalStaff failed", e);
  }
}

/**
 * Single entry point: Auth DB (source of truth) ↔ Primary portal_accounts (operational profile).
 */
export async function syncPortalProfile(
  profile: CanonicalUserProfile,
  _source: SyncSource = "hris",
  options: SyncPortalProfileOptions = {},
): Promise<SyncPortalProfileResult> {
  const forceRoleRefresh = options.forceRoleRefresh === true;
  const email = normalizeCanonicalEmail(profile.email);
  if (!email) throw new Error("syncPortalProfile: email required");

  const mapped = await resolvePortalRole(profile);
  const authCompanyId = await upsertAuthCompany(profile);
  const teamId = await resolvePrimaryTeamId(profile.companyName);

  const username = profile.username?.trim().toLowerCase() || null;
  const existingPortalRow = await findExistingPortal(email, username, profile.hrisSourceUserId);
  const existingPortal = existingPortalRow
    ? { id: existingPortalRow.id, authUserId: existingPortalRow.authUserId }
    : null;

  let authUserId: string | null = existingPortal?.authUserId ?? null;
  try {
    const authUser = await upsertAuthUser(
      profile,
      existingPortal?.id ?? null,
      authCompanyId,
      mapped,
    );
    authUserId = authUser.id;

    const { portal, created } = await upsertPortalAccount(
      profile,
      authUserId,
      mapped,
      teamId,
      forceRoleRefresh,
    );

    if (authUser.portalAccountId !== portal.id) {
      await prismaAuth.user.update({
        where: { id: authUser.id },
        data: { portalAccountId: portal.id },
      });
    }

    await ensureAgentRow(portal);

    return {
      authUserId: authUser.id,
      portalAccountId: portal.id,
      created,
    };
  } catch (e) {
    if (!isAuthSchemaError(e)) throw e;
    console.warn("[sync-portal-profile] Auth DB unavailable; syncing portal only.", e);

    const { portal, created } = await upsertPortalAccount(
      profile,
      authUserId,
      mapped,
      teamId,
      forceRoleRefresh,
    );
    await ensureAgentRow(portal);

    return {
      authUserId: authUserId ?? "",
      portalAccountId: portal.id,
      created,
    };
  }
}

/** Build canonical profile from merged_users row shape. */
export function canonicalProfileFromMerged(input: {
  sourceUserId: bigint;
  username: string | null;
  name: string;
  email: string | null;
  role: string;
  companyName: string | null;
  companyId?: bigint | null;
  position?: string | null;
  department?: string | null;
}): CanonicalUserProfile {
  const email = input.email?.trim()
    ? normalizeCanonicalEmail(input.email)
    : fallbackEmailFromUsername(input.username);

  const mapped = mapHrisToPortalRole({
    hrisRole: input.role,
    position: input.position,
    department: input.department,
  });

  return {
    email,
    name: input.name.trim() || email.split("@")[0] || "User",
    username: input.username,
    portalRole: mapped.portalRole,
    headPrivileges: mapped.headPrivileges,
    hrisSourceUserId: input.sourceUserId,
    hrisRole: input.role,
    position: input.position ?? null,
    department: input.department ?? null,
    companyName: input.companyName,
    companyExternalId: input.companyId ?? null,
    emailVerified: Boolean(input.email?.trim()),
  };
}

/** Build canonical profile from OAuth sign-in. */
export function canonicalProfileFromOAuth(input: {
  email: string;
  name?: string | null;
  image?: string | null;
  provider: string;
  providerAccountId: string;
  roleHint?: string | null;
}): CanonicalUserProfile {
  const email = normalizeCanonicalEmail(input.email);
  const roleHint = normalizePortalRole(input.roleHint ?? "Customer") ?? "Customer";

  return {
    email,
    name: input.name?.trim() || email.split("@")[0] || "User",
    image: input.image ?? null,
    portalRole: roleHint,
    headPrivileges: roleHint === "Admin",
    emailVerified: true,
    oauth: {
      provider: input.provider,
      providerAccountId: input.providerAccountId,
    },
  };
}

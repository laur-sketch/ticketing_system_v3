import bcrypt from "bcryptjs";
import { prismaSecondary } from "@/lib/prisma";

import type { PortalRole } from "@/lib/staff-role";
import { mapHrisToPortalRole } from "@/lib/auth/role-mapping";

export type MergedAuthUser = {
  sourceUserId: bigint;
  sourceDatabase: string;
  employeeCode: string | null;
  username: string | null;
  passwordHash: string;
  name: string;
  email: string | null;
  role: string;
  companyName: string | null;
  isActive: boolean;
};

type MergedUserRow = {
  source_user_id: bigint;
  source_database: string;
  employee_code: string | null;
  username: string | null;
  password_hash: string | null;
  name: string;
  email: string | null;
  role: string;
  company_name: string | null;
  is_active: number | boolean;
};

function mapRow(row: MergedUserRow): MergedAuthUser | null {
  if (!row.password_hash) return null;
  return {
    sourceUserId: row.source_user_id,
    sourceDatabase: row.source_database,
    employeeCode: row.employee_code,
    username: row.username,
    passwordHash: row.password_hash,
    name: row.name,
    email: row.email,
    role: row.role,
    companyName: row.company_name,
    isActive: Boolean(row.is_active),
  };
}

/** Laravel/Hris bcrypt hashes use $2y$; bcryptjs expects $2a$. */
export function normalizeBcryptHash(hash: string): string {
  if (hash.startsWith("$2y$")) return `$2a$${hash.slice(4)}`;
  return hash;
}

export async function verifyMergedPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  if (!passwordHash || !password) return false;
  try {
    return await bcrypt.compare(password, normalizeBcryptHash(passwordHash));
  } catch {
    return false;
  }
}

/**
 * HRIS merged_users login lookup: username, email, or employee_code (case-insensitive).
 * Uses raw SQL because MySQL Prisma client does not support `mode: "insensitive"`.
 */
export async function findMergedUserByLogin(loginId: string): Promise<MergedAuthUser | null> {
  const trimmed = loginId.trim();
  if (!trimmed) return null;
  const needle = trimmed.toLowerCase();

  const rows = await prismaSecondary.$queryRaw<MergedUserRow[]>`
    SELECT
      source_user_id,
      source_database,
      employee_code,
      username,
      password_hash,
      name,
      email,
      role,
      company_name,
      is_active
    FROM merged_users
    WHERE is_active = 1
      AND (
        LOWER(username) = ${needle}
        OR LOWER(email) = ${needle}
        OR LOWER(employee_code) = ${needle}
      )
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;
  return mapRow(row);
}

export async function findMergedUserByEmail(email: string): Promise<MergedAuthUser | null> {
  const e = email.trim().toLowerCase();
  if (!e) return null;

  const rows = await prismaSecondary.$queryRaw<MergedUserRow[]>`
    SELECT
      source_user_id,
      source_database,
      employee_code,
      username,
      password_hash,
      name,
      email,
      role,
      company_name,
      is_active
    FROM merged_users
    WHERE is_active = 1 AND LOWER(email) = ${e}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;
  return mapRow(row);
}

/** Map hris-dev.users.role → portal role string. */
export function mapMergedHrisRoleToPortal(hrisRole: string): PortalRole {
  return mapHrisToPortalRole({ hrisRole }).portalRole;
}

export function mergedPortalEmail(merged: Pick<MergedAuthUser, "email" | "username">): string {
  const email = merged.email?.trim().toLowerCase();
  if (email) return email;
  const username = merged.username?.trim().toLowerCase();
  if (username) return `${username}@hris.merged`;
  return "unknown@hris.merged";
}

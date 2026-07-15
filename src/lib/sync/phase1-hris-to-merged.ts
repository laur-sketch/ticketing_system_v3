/**
 * Phase 1: HRIS users + attendance → mergedatabase (credential source of truth).
 *
 * - Upserts merged_users (user_id, name, company + auth fields: username, email, password_hash)
 * - Upserts merged_attendance_clock_in
 * - Registers external_user_mappings + merged_username_aliases for legacy login
 */
import { randomUUID } from "node:crypto";
import { PrismaClient as PrismaClientSecondary } from "@prisma/client/secondary";
import {
  ensureMergedConsolidationSchema,
} from "../../../scripts/ensure-merged-consolidation-schema";
import { bootstrapMysqlUrl, parseMysqlDatabaseName } from "../../../scripts/ensure-merged-task-kpi-tables";

const BATCH_SIZE = 500;

export type Phase1HrisMergeResult = {
  dryRun: boolean;
  sourceDb: string;
  targetDb: string;
  sourceTag: string;
  full: boolean;
  source: { users: number; attendance: number };
  synced: {
    users: number;
    attendance: number;
    mappings: number;
    aliases: number;
  };
  conflicts: Array<{ externalUserId: string; message: string }>;
};

function env(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v || fallback;
}

function sqlId(name: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `\`${name}\``;
}

function resolveTargetWriteUrl(targetDb: string): string {
  const explicit = process.env.DATABASE_URL_SECONDARY_SYNC?.trim();
  if (explicit) {
    try {
      const url = new URL(explicit);
      url.pathname = `/${targetDb}`;
      return url.toString();
    } catch {
      return explicit;
    }
  }
  const appUrl = process.env.DATABASE_URL_SECONDARY?.trim();
  if (appUrl) {
    try {
      const url = new URL(appUrl);
      url.pathname = `/${targetDb}`;
      return url.toString();
    } catch {
      return appUrl;
    }
  }
  return `mysql://root@localhost:3306/${targetDb}`;
}

type HrisUserRow = {
  id: bigint;
  employee_code: string | null;
  username: string | null;
  password: string | null;
  name: string;
  email: string | null;
  phone_number: string | null;
  role: string;
  company_id: bigint | null;
  company_name: string | null;
  department: string | null;
  position: string | null;
  employment_status: string;
  is_active: number | boolean;
  hire_date: Date | null;
  created_at: Date | null;
  updated_at: Date | null;
};

type HrisAttendanceRow = {
  id: bigint;
  user_id: bigint;
  employee_code: string | null;
  employee_name: string | null;
  company_name: string | null;
  clock_in_at: Date;
  verified_at: Date | null;
  authentication_method: string | null;
  geofence_status: string | null;
  latitude: unknown;
  longitude: unknown;
  ip_address: string | null;
  created_at: Date | null;
};

async function countSourceUsers(db: PrismaClientSecondary, sourceDb: string): Promise<number> {
  const source = sqlId(sourceDb);
  const rows = await db.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM ${source}.users`,
  );
  return Number(rows[0]?.c ?? 0);
}

async function countSourceAttendance(db: PrismaClientSecondary, sourceDb: string): Promise<number> {
  const source = sqlId(sourceDb);
  const rows = await db.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM ${source}.attendance_logs
     WHERE type = 'clock_in' AND time_in_clicked_at IS NOT NULL`,
  );
  return Number(rows[0]?.c ?? 0);
}

async function fetchAllHrisUsers(db: PrismaClientSecondary, sourceDb: string): Promise<HrisUserRow[]> {
  const source = sqlId(sourceDb);
  return db.$queryRawUnsafe<HrisUserRow[]>(`
    SELECT
      u.id,
      u.employee_code,
      u.username,
      u.password,
      u.name,
      u.email,
      u.phone_number,
      u.role,
      u.company_id,
      c.name AS company_name,
      u.department,
      u.position,
      u.employment_status,
      u.is_active,
      u.hire_date,
      u.created_at,
      u.updated_at
    FROM ${source}.users u
    LEFT JOIN ${source}.companies c ON c.id = u.company_id
    ORDER BY u.id
  `);
}

async function fetchAllHrisAttendance(
  db: PrismaClientSecondary,
  sourceDb: string,
): Promise<HrisAttendanceRow[]> {
  const source = sqlId(sourceDb);
  return db.$queryRawUnsafe<HrisAttendanceRow[]>(`
    SELECT
      al.id,
      al.user_id,
      u.employee_code,
      u.name AS employee_name,
      c.name AS company_name,
      al.time_in_clicked_at AS clock_in_at,
      al.verified_at,
      al.authentication_method,
      al.geofence_status,
      al.latitude,
      al.longitude,
      al.ip_address,
      al.created_at
    FROM ${source}.attendance_logs al
    INNER JOIN ${source}.users u ON u.id = al.user_id
    LEFT JOIN ${source}.companies c ON c.id = u.company_id
    WHERE al.type = 'clock_in'
      AND al.time_in_clicked_at IS NOT NULL
    ORDER BY al.id
  `);
}

async function upsertUsersBatch(
  db: PrismaClientSecondary,
  targetDb: string,
  sourceTag: string,
  users: HrisUserRow[],
): Promise<number> {
  if (users.length === 0) return 0;
  const target = sqlId(targetDb);
  let affected = 0;

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    const values = batch
      .map((u) => {
        const esc = (v: string | null | undefined) =>
          v == null ? "NULL" : `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
        const escDate = (d: Date | null) => (d ? `'${d.toISOString().slice(0, 19).replace("T", " ")}'` : "NULL");
        const escBool = (b: number | boolean) => (b ? 1 : 0);
        return `(
          ${u.id}, '${sourceTag}',
          ${esc(u.employee_code)}, ${esc(u.username)}, ${esc(u.password)},
          ${esc(u.name)}, ${esc(u.email)}, ${esc(u.phone_number)}, ${esc(u.role)},
          ${u.company_id ?? "NULL"}, ${esc(u.company_name)},
          ${esc(u.department)}, ${esc(u.position)}, ${esc(u.employment_status)},
          ${escBool(u.is_active)}, ${escDate(u.hire_date)},
          ${escDate(u.created_at)}, ${escDate(u.updated_at)}
        )`;
      })
      .join(",\n");

    const n = await db.$executeRawUnsafe(`
      INSERT INTO ${target}.merged_users (
        source_user_id, source_database, employee_code, username, password_hash, name, email, phone_number, role,
        company_id, company_name, department, position, employment_status,
        is_active, hire_date, created_at, updated_at
      ) VALUES ${values}
      ON DUPLICATE KEY UPDATE
        employee_code = VALUES(employee_code),
        username = VALUES(username),
        password_hash = COALESCE(VALUES(password_hash), password_hash),
        name = VALUES(name),
        email = VALUES(email),
        phone_number = VALUES(phone_number),
        role = VALUES(role),
        company_id = VALUES(company_id),
        company_name = VALUES(company_name),
        department = VALUES(department),
        position = VALUES(position),
        employment_status = VALUES(employment_status),
        is_active = VALUES(is_active),
        hire_date = VALUES(hire_date),
        updated_at = VALUES(updated_at),
        merged_at = CURRENT_TIMESTAMP
    `);
    affected += Number(n);
  }
  return affected;
}

async function upsertAttendanceBatch(
  db: PrismaClientSecondary,
  targetDb: string,
  sourceTag: string,
  rows: HrisAttendanceRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const target = sqlId(targetDb);
  let affected = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = batch
      .map((r) => {
        const esc = (v: string | null | undefined) =>
          v == null ? "NULL" : `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
        const escDate = (d: Date | null) => (d ? `'${d.toISOString().slice(0, 19).replace("T", " ")}'` : "NULL");
        return `(
          ${r.id}, '${sourceTag}', ${r.user_id},
          ${esc(r.employee_code)}, ${esc(r.employee_name)}, ${esc(r.company_name)},
          ${escDate(r.clock_in_at)}, ${escDate(r.verified_at)},
          ${esc(r.authentication_method)}, ${esc(r.geofence_status)},
          ${r.latitude ?? "NULL"}, ${r.longitude ?? "NULL"},
          ${esc(r.ip_address)}, ${escDate(r.created_at)}
        )`;
      })
      .join(",\n");

    const n = await db.$executeRawUnsafe(`
      INSERT INTO ${target}.merged_attendance_clock_in (
        source_log_id, source_database, source_user_id, employee_code, employee_name, company_name,
        clock_in_at, verified_at, authentication_method, geofence_status,
        latitude, longitude, ip_address, created_at
      ) VALUES ${values}
      ON DUPLICATE KEY UPDATE
        source_user_id = VALUES(source_user_id),
        employee_code = VALUES(employee_code),
        employee_name = VALUES(employee_name),
        company_name = VALUES(company_name),
        clock_in_at = VALUES(clock_in_at),
        verified_at = VALUES(verified_at),
        authentication_method = VALUES(authentication_method),
        geofence_status = VALUES(geofence_status),
        latitude = VALUES(latitude),
        longitude = VALUES(longitude),
        ip_address = VALUES(ip_address),
        merged_at = CURRENT_TIMESTAMP
    `);
    affected += Number(n);
  }
  return affected;
}

async function registerMappingsAndAliases(
  db: PrismaClientSecondary,
  sourceTag: string,
  users: HrisUserRow[],
  dryRun: boolean,
): Promise<{ mappings: number; aliases: number; conflicts: Phase1HrisMergeResult["conflicts"] }> {
  let mappings = 0;
  let aliases = 0;
  const conflicts: Phase1HrisMergeResult["conflicts"] = [];

  for (const user of users) {
    const mergedSourceUserId = user.id;
    const legacyUsername = user.username?.trim().toLowerCase() || null;
    const legacyEmail = user.email?.trim().toLowerCase() || null;

    if (!dryRun) {
      try {
        await db.externalUserMapping.upsert({
          where: {
            externalSource_externalUserId: {
              externalSource: sourceTag,
              externalUserId: mergedSourceUserId,
            },
          },
          create: {
            id: randomUUID(),
            externalSource: sourceTag,
            externalUserId: mergedSourceUserId,
            mergedSourceUserId,
            legacyUsername,
            legacyEmail,
            lastSyncedAt: new Date(),
          },
          update: {
            mergedSourceUserId,
            legacyUsername,
            legacyEmail,
            lastSyncedAt: new Date(),
          },
        });
        mappings++;
      } catch (e) {
        conflicts.push({
          externalUserId: mergedSourceUserId.toString(),
          message: e instanceof Error ? e.message : String(e),
        });
      }
    } else {
      mappings++;
    }

    if (legacyUsername) {
      const existing = dryRun
        ? null
        : await db.mergedUsernameAlias.findFirst({
            where: { username: legacyUsername },
          });
      if (!existing) {
        if (!dryRun) {
          await db.mergedUsernameAlias.create({
            data: {
              id: randomUUID(),
              sourceUserId: mergedSourceUserId,
              username: legacyUsername,
              source: "hris",
            },
          });
        }
        aliases++;
      }
    }
  }

  return { mappings, aliases, conflicts };
}

export async function runPhase1HrisToMerged(options?: {
  dryRun?: boolean;
  full?: boolean;
  sourceDb?: string;
  targetDb?: string;
  sourceTag?: string;
}): Promise<Phase1HrisMergeResult> {
  const dryRun = options?.dryRun ?? false;
  const full = options?.full ?? true;
  const sourceDb = options?.sourceDb ?? env("HRIS_MERGE_SOURCE_DB", "hrisdemo");
  const targetDb = options?.targetDb ?? env("HRIS_MERGE_TARGET_DB", "mergedatabase-demo");
  const sourceTag = options?.sourceTag ?? env("HRIS_MERGE_SOURCE_TAG", sourceDb);

  const writeUrl = resolveTargetWriteUrl(targetDb);
  const bootstrapUrl = bootstrapMysqlUrl(writeUrl);

  const prismaBootstrap = new PrismaClientSecondary({
    datasources: { db: { url: bootstrapUrl } },
  });
  const prismaWrite = new PrismaClientSecondary({
    datasources: { db: { url: writeUrl } },
  });

  const result: Phase1HrisMergeResult = {
    dryRun,
    sourceDb,
    targetDb,
    sourceTag,
    full,
    source: { users: 0, attendance: 0 },
    synced: { users: 0, attendance: 0, mappings: 0, aliases: 0 },
    conflicts: [],
  };

  try {
    await prismaBootstrap.$connect();
    await ensureMergedConsolidationSchema(prismaBootstrap, targetDb, sourceTag);
    await prismaBootstrap.$disconnect();

    await prismaWrite.$connect();

    result.source.users = await countSourceUsers(prismaWrite, sourceDb);
    result.source.attendance = await countSourceAttendance(prismaWrite, sourceDb);

    if (!full) {
      // Incremental path: delegate to existing watermark-based merge via raw SQL (same as merge-hris-incremental).
      // For simplicity, full=true is the default for consolidation migrations.
      console.warn("Phase 1 incremental mode: use npm run db:merge:hris-incremental for watermarked sync.");
    }

    const users = await fetchAllHrisUsers(prismaWrite, sourceDb);
    const attendance = await fetchAllHrisAttendance(prismaWrite, sourceDb);

    if (!dryRun) {
      result.synced.users = await upsertUsersBatch(prismaWrite, targetDb, sourceTag, users);
      result.synced.attendance = await upsertAttendanceBatch(
        prismaWrite,
        targetDb,
        sourceTag,
        attendance,
      );
      const mapResult = await registerMappingsAndAliases(prismaWrite, sourceTag, users, false);
      result.synced.mappings = mapResult.mappings;
      result.synced.aliases = mapResult.aliases;
      result.conflicts = mapResult.conflicts;
    } else {
      result.synced.users = users.length;
      result.synced.attendance = attendance.length;
      const mapResult = await registerMappingsAndAliases(prismaWrite, sourceTag, users, true);
      result.synced.mappings = mapResult.mappings;
      result.synced.aliases = mapResult.aliases;
    }
  } finally {
    await prismaBootstrap.$disconnect().catch(() => undefined);
    await prismaWrite.$disconnect().catch(() => undefined);
  }

  return result;
}

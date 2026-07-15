/**
 * Apply an HRIS phpMyAdmin dump into a staging MySQL DB, then push ONLY:
 *   - merged_users: name + company_id + company_name (preserve email/username/password/role)
 *   - merged_attendance_clock_in: clock_in events
 * into mergedatabase-demo.
 *
 * Usage:
 *   npx tsx scripts/apply-hris-dump-name-company-attendance.ts --apply --sql "C:/Users/.../hris (62).sql"
 *   npx tsx scripts/apply-hris-dump-name-company-attendance.ts --apply --skip-import   # reuse existing stage DB
 */
import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { PrismaClient as PrismaClientSecondary } from "@prisma/client/secondary";

function env(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v || fallback;
}

function sqlId(name: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`Invalid SQL identifier: ${name}`);
  return `\`${name}\``;
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

function resolveMysqlExe(): string {
  const fromEnv = process.env.MYSQL_EXE?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const candidates = [
    "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe",
    "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysql.exe",
    "C:\\xampp\\mysql\\bin\\mysql.exe",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return "mysql";
}

function resolveWriteUrl(dbName: string): string {
  const explicit = process.env.DATABASE_URL_SECONDARY_SYNC?.trim();
  if (explicit) {
    try {
      const url = new URL(explicit);
      url.pathname = `/${dbName}`;
      return url.toString();
    } catch {
      return explicit;
    }
  }
  const appUrl = process.env.DATABASE_URL_SECONDARY?.trim();
  if (appUrl) {
    try {
      const url = new URL(appUrl);
      url.pathname = `/${dbName}`;
      return url.toString();
    } catch {
      return appUrl;
    }
  }
  return `mysql://root@localhost:3306/${dbName}`;
}

function mysqlCliArgsFromUrl(urlStr: string): string[] {
  const url = new URL(urlStr);
  const args = [`-h`, url.hostname || "localhost"];
  if (url.port) args.push("-P", url.port);
  if (url.username) args.push("-u", decodeURIComponent(url.username));
  if (url.password) args.push(`-p${decodeURIComponent(url.password)}`);
  const db = url.pathname.replace(/^\//, "");
  if (db) args.push(db);
  return args;
}

async function importDump(mysqlExe: string, stageDb: string, sqlPath: string) {
  const bootstrap = resolveWriteUrl("mysql");
  const adminArgs = mysqlCliArgsFromUrl(bootstrap).filter((a) => a !== "mysql");
  const recreate = spawnSync(
    mysqlExe,
    [
      ...adminArgs,
      "-e",
      `DROP DATABASE IF EXISTS ${sqlId(stageDb)}; CREATE DATABASE ${sqlId(stageDb)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (recreate.status !== 0) {
    throw new Error(`Failed to recreate ${stageDb}: ${recreate.stderr || recreate.stdout}`);
  }

  console.log(`Importing dump into ${stageDb} (this can take several minutes)...`);
  const importArgs = [...mysqlCliArgsFromUrl(resolveWriteUrl(stageDb))];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(mysqlExe, importArgs, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`mysql import failed (exit ${code}): ${stderr.trim() || "(no stderr)"}`));
    });
    createReadStream(sqlPath).pipe(child.stdin!);
  });

  console.log(`Import complete into ${stageDb}.`);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const skipImport = process.argv.includes("--skip-import");
  const sqlPath =
    argValue("--sql") ||
    process.env.HRIS_DUMP_SQL?.trim() ||
    "C:\\Users\\tkdemo\\Downloads\\hris (62).sql";
  const stageDb = env("HRIS_MERGE_STAGE_DB", env("HRIS_MERGE_SOURCE_DB", "hrisdemo"));
  const targetDb = env("HRIS_MERGE_TARGET_DB", "mergedatabase-demo");
  const sourceTag = env("HRIS_MERGE_SOURCE_TAG", "hrisdemo");
  const mysqlExe = resolveMysqlExe();

  console.log(
    JSON.stringify(
      { apply, skipImport, sqlPath, stageDb, targetDb, sourceTag, mysqlExe },
      null,
      2,
    ),
  );

  if (!skipImport) {
    if (!existsSync(sqlPath)) throw new Error(`SQL dump not found: ${sqlPath}`);
    if (!apply) {
      console.log("Dry-run: would import dump then upsert name/company + clock-in attendance.");
      return;
    }
    await importDump(mysqlExe, stageDb, sqlPath);
  }

  const prisma = new PrismaClientSecondary({
    datasources: { db: { url: resolveWriteUrl(targetDb) } },
  });

  const source = sqlId(stageDb);
  const target = sqlId(targetDb);

  try {
    await prisma.$connect();

    const [srcUsers, srcClockIns, beforeUsers, beforeAtt] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ c: bigint }>>(`SELECT COUNT(*) AS c FROM ${source}.users`),
      prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT COUNT(*) AS c FROM ${source}.attendance_logs
         WHERE type = 'clock_in' AND time_in_clicked_at IS NOT NULL`,
      ),
      prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT COUNT(*) AS c FROM ${target}.merged_users WHERE source_database = '${sourceTag}'`,
      ),
      prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT COUNT(*) AS c FROM ${target}.merged_attendance_clock_in WHERE source_database = '${sourceTag}'`,
      ),
    ]);

    const preview = {
      sourceUsers: Number(srcUsers[0]?.c ?? 0),
      sourceClockIns: Number(srcClockIns[0]?.c ?? 0),
      mergedUsersBefore: Number(beforeUsers[0]?.c ?? 0),
      mergedAttendanceBefore: Number(beforeAtt[0]?.c ?? 0),
    };
    console.log("Before:", JSON.stringify(preview, null, 2));

    if (!apply) {
      console.log("Dry-run only. Re-run with --apply to write.");
      return;
    }

    // Insert new users fully; for existing users only refresh name + company.
    const usersAffected = await prisma.$executeRawUnsafe(`
      INSERT INTO ${target}.merged_users (
        source_user_id, source_database, employee_code, username, password_hash, name, email, phone_number, role,
        company_id, company_name, department, position, employment_status,
        is_active, hire_date, created_at, updated_at
      )
      SELECT
        u.id,
        '${sourceTag}',
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
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        company_id = VALUES(company_id),
        company_name = VALUES(company_name),
        updated_at = VALUES(updated_at),
        merged_at = CURRENT_TIMESTAMP
    `);

    const attendanceAffected = await prisma.$executeRawUnsafe(`
      INSERT INTO ${target}.merged_attendance_clock_in (
        source_log_id, source_database, source_user_id, employee_code, employee_name, company_name,
        clock_in_at, verified_at, authentication_method, geofence_status,
        latitude, longitude, ip_address, created_at
      )
      SELECT
        al.id,
        '${sourceTag}',
        al.user_id,
        u.employee_code,
        u.name,
        c.name,
        al.time_in_clicked_at,
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

    const [afterUsers, afterAtt, sample] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT COUNT(*) AS c FROM ${target}.merged_users WHERE source_database = '${sourceTag}'`,
      ),
      prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT COUNT(*) AS c FROM ${target}.merged_attendance_clock_in WHERE source_database = '${sourceTag}'`,
      ),
      prisma.$queryRawUnsafe<
        Array<{ source_user_id: bigint; name: string; company_name: string | null }>
      >(
        `SELECT source_user_id, name, company_name
         FROM ${target}.merged_users
         WHERE source_database = '${sourceTag}'
         ORDER BY updated_at DESC
         LIMIT 5`,
      ),
    ]);

    console.log(
      JSON.stringify(
        {
          usersAffected: Number(usersAffected),
          attendanceAffected: Number(attendanceAffected),
          mergedUsersAfter: Number(afterUsers[0]?.c ?? 0),
          mergedAttendanceAfter: Number(afterAtt[0]?.c ?? 0),
          sampleNames: sample.map((r) => ({
            id: r.source_user_id.toString(),
            name: r.name,
            company: r.company_name,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

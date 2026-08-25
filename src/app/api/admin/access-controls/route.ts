import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import {
  ACCESS_CONTROL_SETTING_KEY,
  defaultAccessControlConfig,
  mergeAccessControlConfig,
  type AccessControlConfig,
} from "@/lib/access-controls";
import { prisma } from "@/lib/prisma";

async function guardSuperAdmin() {
  const session = await requireSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

async function ensurePlatformSettingsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function loadConfig(maxLayer: number): Promise<AccessControlConfig> {
  await ensurePlatformSettingsTable();
  const rows = await prisma.$queryRaw<Array<{ value: unknown }>>`
    SELECT value FROM platform_settings WHERE key = ${ACCESS_CONTROL_SETTING_KEY} LIMIT 1
  `;
  return mergeAccessControlConfig(rows[0]?.value, maxLayer);
}

export async function GET(req: Request) {
  const denied = await guardSuperAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const maxLayer = Math.max(1, Math.min(20, Number(searchParams.get("maxLayer") || 5) || 5));
  const config = await loadConfig(maxLayer);
  return NextResponse.json({ config });
}

export async function PUT(req: Request) {
  const denied = await guardSuperAdmin();
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as {
    config?: unknown;
    maxLayer?: number;
  };
  const maxLayer = Math.max(1, Math.min(20, Number(body.maxLayer || 5) || 5));
  const config = mergeAccessControlConfig(body.config, maxLayer);

  await ensurePlatformSettingsTable();
  const json = JSON.stringify(config);
  await prisma.$executeRaw`
    INSERT INTO platform_settings (key, value, updated_at, created_at)
    VALUES (
      ${ACCESS_CONTROL_SETTING_KEY},
      ${json}::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = NOW()
  `;

  return NextResponse.json({ config });
}

export async function POST(req: Request) {
  /** Reset to defaults. */
  const denied = await guardSuperAdmin();
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { maxLayer?: number };
  const maxLayer = Math.max(1, Math.min(20, Number(body.maxLayer || 5) || 5));
  const config = defaultAccessControlConfig(maxLayer);

  await ensurePlatformSettingsTable();
  const json = JSON.stringify(config);
  await prisma.$executeRaw`
    INSERT INTO platform_settings (key, value, updated_at, created_at)
    VALUES (
      ${ACCESS_CONTROL_SETTING_KEY},
      ${json}::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = NOW()
  `;

  return NextResponse.json({ config });
}

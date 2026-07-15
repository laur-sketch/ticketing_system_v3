import { PrismaClient as PrismaClientPrimary } from "@prisma/client/primary";
import { PrismaClient as PrismaClientSecondary } from "@prisma/client/secondary";
import { PrismaClient as PrismaClientAuth } from "@prisma/client/auth";

const globalForPrisma = globalThis as unknown as {
  prismaPrimary: PrismaClientPrimary | undefined;
  prismaSecondary: PrismaClientSecondary | undefined;
  prismaAuth: PrismaClientAuth | undefined;
};

const logLevels: ("error" | "warn")[] =
  process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];

/** Cap Prisma pools so three clients (primary/secondary/auth) cannot exhaust Postgres. */
function withPoolLimit(url: string | undefined, limit: number): string | undefined {
  if (!url?.trim()) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("connection_limit")) {
      u.searchParams.set("connection_limit", String(limit));
    }
    if (!u.searchParams.has("pool_timeout")) {
      u.searchParams.set("pool_timeout", "10");
    }
    return u.toString();
  } catch {
    return url;
  }
}

export const prismaPrimary =
  globalForPrisma.prismaPrimary ??
  new PrismaClientPrimary({
    log: logLevels,
    datasources: {
      db: { url: withPoolLimit(process.env.DATABASE_URL_PRIMARY, 10) },
    },
  });

/** Secondary (MySQL mergedatabase): HRIS + attendance + task activities + user efficiencies. */
export const prismaSecondary =
  globalForPrisma.prismaSecondary ??
  new PrismaClientSecondary({
    log: logLevels,
    datasources: {
      db: { url: withPoolLimit(process.env.DATABASE_URL_SECONDARY, 10) },
    },
  });

/** Auth DB (PostgreSQL): OAuth identities linked to portal profiles. */
export const prismaAuth =
  globalForPrisma.prismaAuth ??
  new PrismaClientAuth({
    log: logLevels,
    datasources: {
      db: { url: withPoolLimit(process.env.DATABASE_URL_AUTH, 5) },
    },
  });

// Always reuse clients across HMR / workers to avoid "too many clients already".
globalForPrisma.prismaPrimary = prismaPrimary;
globalForPrisma.prismaSecondary = prismaSecondary;
globalForPrisma.prismaAuth = prismaAuth;

/** Backward-compatible alias so existing imports of `prisma` still work. */
export const prisma = prismaPrimary;

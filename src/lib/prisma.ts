import { PrismaClient as PrismaClientPrimary } from "@prisma/client/primary";
import { PrismaClient as PrismaClientSecondary } from "@prisma/client/secondary";
import { PrismaClient as PrismaClientAuth } from "@prisma/client/auth";

const globalForPrisma = globalThis as unknown as {
  prismaPrimary: PrismaClientPrimary | undefined;
  prismaSecondary: PrismaClientSecondary | undefined;
  prismaAuth: PrismaClientAuth | undefined;
};

const logLevels =
  process.env.NODE_ENV === "development"
    ? (["error", "warn"] as const)
    : (["error"] as const);

export const prismaPrimary =
  globalForPrisma.prismaPrimary ??
  new PrismaClientPrimary({ log: logLevels });

/** Secondary (MySQL mergeddatabase-dev): HRIS + attendance + ticketing KPI/task ETL read model. */
export const prismaSecondary =
  globalForPrisma.prismaSecondary ??
  new PrismaClientSecondary({ log: logLevels });

/** Auth DB (PostgreSQL): OAuth identities linked to portal profiles. */
export const prismaAuth =
  globalForPrisma.prismaAuth ??
  new PrismaClientAuth({ log: logLevels });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaPrimary = prismaPrimary;
  globalForPrisma.prismaSecondary = prismaSecondary;
  globalForPrisma.prismaAuth = prismaAuth;
}

/** Backward-compatible alias so existing imports of `prisma` still work. */
export const prisma = prismaPrimary;

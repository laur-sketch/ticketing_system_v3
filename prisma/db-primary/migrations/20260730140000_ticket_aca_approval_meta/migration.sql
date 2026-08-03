-- AlterTable
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "aca_approval_meta" JSONB;

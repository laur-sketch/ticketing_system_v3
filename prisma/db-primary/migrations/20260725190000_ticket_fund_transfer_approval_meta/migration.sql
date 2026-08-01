-- AlterTable
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "fund_transfer_approval_meta" JSONB;

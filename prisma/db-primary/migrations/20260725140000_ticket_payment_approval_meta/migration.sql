-- AlterTable
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "payment_approval_meta" JSONB;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "job_order_approval_meta" JSONB;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "item_requisition_approval_meta" JSONB;

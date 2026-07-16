-- AlterTable: TaskItem lifecycle + delay penalty fields
ALTER TABLE "task_items" ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMP(3);
ALTER TABLE "task_items" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);
ALTER TABLE "task_items" ADD COLUMN IF NOT EXISTS "delay_penalty_amount" INTEGER;
ALTER TABLE "task_items" ADD COLUMN IF NOT EXISTS "delay_penalty_accrued" INTEGER NOT NULL DEFAULT 0;

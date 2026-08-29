-- Default new tickets to LOW instead of UNSET
ALTER TABLE "tickets" ALTER COLUMN "priority" SET DEFAULT 'LOW';

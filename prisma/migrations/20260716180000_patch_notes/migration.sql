-- Mirror of db-primary patch notes migration for legacy migrate path.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "PatchNote" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    version TEXT NOT NULL,
    title TEXT NOT NULL,
    content JSONB NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "UserPatchNoteView" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL,
    "patchNoteId" TEXT NOT NULL REFERENCES "PatchNote"(id) ON DELETE CASCADE,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("userId", "patchNoteId")
);

CREATE INDEX IF NOT EXISTS "PatchNote_releasedAt_idx" ON "PatchNote"("releasedAt");
CREATE INDEX IF NOT EXISTS "UserPatchNoteView_userId_idx" ON "UserPatchNoteView"("userId");

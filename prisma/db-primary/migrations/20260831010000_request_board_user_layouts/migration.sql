-- Per-user Request Board layouts (columns/mappings do not affect other accounts).
CREATE TABLE IF NOT EXISTS "request_board_user_layouts" (
  "id" TEXT NOT NULL,
  "owner_key" TEXT NOT NULL,
  "columns" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "request_board_user_layouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "request_board_user_layouts_owner_key_key"
  ON "request_board_user_layouts" ("owner_key");

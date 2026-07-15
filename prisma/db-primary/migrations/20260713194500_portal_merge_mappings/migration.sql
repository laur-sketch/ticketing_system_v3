-- PortalAccount credential sync: username aliases + merge mapping table.

CREATE TABLE IF NOT EXISTS portal_username_aliases (
  id TEXT NOT NULL,
  portal_account_id TEXT NOT NULL,
  username TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'legacy',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT portal_username_aliases_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_username_aliases_username_key
  ON portal_username_aliases (username);

CREATE INDEX IF NOT EXISTS idx_portal_username_aliases_portal
  ON portal_username_aliases (portal_account_id);

ALTER TABLE portal_username_aliases
  DROP CONSTRAINT IF EXISTS portal_username_aliases_portal_account_id_fkey;

ALTER TABLE portal_username_aliases
  ADD CONSTRAINT portal_username_aliases_portal_account_id_fkey
  FOREIGN KEY (portal_account_id) REFERENCES portal_accounts(id) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS portal_merge_mappings (
  portal_account_id TEXT NOT NULL,
  merged_source_user_id BIGINT NOT NULL,
  legacy_portal_email TEXT,
  legacy_username TEXT,
  last_synced_at TIMESTAMP(3),
  CONSTRAINT portal_merge_mappings_pkey PRIMARY KEY (portal_account_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_merge_mappings_merged_source_user_id_key
  ON portal_merge_mappings (merged_source_user_id);

CREATE INDEX IF NOT EXISTS idx_portal_merge_mappings_merged_id
  ON portal_merge_mappings (merged_source_user_id);

ALTER TABLE portal_merge_mappings
  DROP CONSTRAINT IF EXISTS portal_merge_mappings_portal_account_id_fkey;

ALTER TABLE portal_merge_mappings
  ADD CONSTRAINT portal_merge_mappings_portal_account_id_fkey
  FOREIGN KEY (portal_account_id) REFERENCES portal_accounts(id) ON DELETE CASCADE ON UPDATE CASCADE;

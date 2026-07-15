-- HRIS-linked accounts authenticate via merged_users; portal password is optional/legacy.
ALTER TABLE portal_accounts ALTER COLUMN password_hash DROP NOT NULL;

-- Add columns required by current Prisma schema (post PascalCase rename).
ALTER TABLE portal_accounts ADD COLUMN IF NOT EXISTS auth_user_id TEXT;
ALTER TABLE portal_accounts ADD COLUMN IF NOT EXISTS oauth_provider TEXT;
ALTER TABLE portal_accounts ADD COLUMN IF NOT EXISTS oauth_subject TEXT;
ALTER TABLE portal_accounts ADD COLUMN IF NOT EXISTS merged_source_user_id BIGINT;
ALTER TABLE portal_accounts ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP(3);
ALTER TABLE portal_accounts ADD COLUMN IF NOT EXISTS profile_synced_at TIMESTAMP(3);

ALTER TABLE kpi_maintenance ADD COLUMN IF NOT EXISTS main_task TEXT;

-- Partial unique indexes (nullable columns).
CREATE UNIQUE INDEX IF NOT EXISTS portal_accounts_auth_user_id_key
  ON portal_accounts (auth_user_id) WHERE auth_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS portal_accounts_merged_source_user_id_key
  ON portal_accounts (merged_source_user_id) WHERE merged_source_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS kpi_maintenance_title_main_task_key
  ON kpi_maintenance (title, main_task);

-- Common query indexes from Prisma schema (idempotent).
CREATE INDEX IF NOT EXISTS tickets_status_updated_at_idx ON tickets (status, updated_at);
CREATE INDEX IF NOT EXISTS tickets_status_created_at_idx ON tickets (status, created_at);
CREATE INDEX IF NOT EXISTS tickets_contact_email_updated_at_idx ON tickets (contact_email, updated_at);
CREATE INDEX IF NOT EXISTS tickets_assigned_agent_id_status_idx ON tickets (assigned_agent_id, status);
CREATE INDEX IF NOT EXISTS ticket_activities_ticket_id_created_at_idx ON ticket_activities (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS kpi_maintenance_assigned_agent_id_frequency_idx ON kpi_maintenance (assigned_agent_id, frequency);
CREATE INDEX IF NOT EXISTS kpi_maintenance_period_snapshots_kpi_maintenance_id_captured_at_idx
  ON kpi_maintenance_period_snapshots (kpi_maintenance_id, captured_at);

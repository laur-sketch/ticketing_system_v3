-- Persistent Task KPI overall-efficiency breakdowns (PostgreSQL primary).
-- Companion to MySQL merged_user_efficiency_breakdowns / merged_user_efficiency_task_details.

CREATE TABLE IF NOT EXISTS user_efficiency_breakdowns (
  id TEXT NOT NULL,
  source_user_id BIGINT NOT NULL,
  portal_account_id TEXT,
  display_name TEXT NOT NULL,
  period_key TEXT NOT NULL,
  frequency TEXT NOT NULL,
  period_start_at TIMESTAMP(3) NOT NULL,
  period_end_at TIMESTAMP(3) NOT NULL,
  overall_efficiency DECIMAL(6,2) NOT NULL,
  task_efficiency DECIMAL(6,2),
  ticket_efficiency DECIMAL(6,2),
  total_tasks INTEGER NOT NULL DEFAULT 0,
  completed_tasks INTEGER NOT NULL DEFAULT 0,
  delayed_tasks INTEGER NOT NULL DEFAULT 0,
  on_time_completion_rate DECIMAL(6,2),
  average_task_completion_hours DECIMAL(10,2),
  efficiency_score DECIMAL(8,2),
  source_database TEXT NOT NULL DEFAULT 'ticketing_system',
  computed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_efficiency_breakdowns_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_eff_breakdown_period
  ON user_efficiency_breakdowns (source_user_id, period_key, frequency);

CREATE INDEX IF NOT EXISTS idx_user_eff_breakdown_user
  ON user_efficiency_breakdowns (source_user_id);

CREATE INDEX IF NOT EXISTS idx_user_eff_breakdown_period
  ON user_efficiency_breakdowns (period_key);

CREATE INDEX IF NOT EXISTS idx_user_eff_breakdown_freq
  ON user_efficiency_breakdowns (frequency);

CREATE INDEX IF NOT EXISTS idx_user_eff_breakdown_overall
  ON user_efficiency_breakdowns (overall_efficiency);

CREATE INDEX IF NOT EXISTS idx_user_eff_breakdown_portal
  ON user_efficiency_breakdowns (portal_account_id);

ALTER TABLE user_efficiency_breakdowns
  DROP CONSTRAINT IF EXISTS user_efficiency_breakdowns_portal_account_id_fkey;

ALTER TABLE user_efficiency_breakdowns
  ADD CONSTRAINT user_efficiency_breakdowns_portal_account_id_fkey
  FOREIGN KEY (portal_account_id) REFERENCES portal_accounts(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS user_efficiency_task_details (
  id TEXT NOT NULL,
  breakdown_id TEXT NOT NULL,
  task_id TEXT,
  task_source TEXT NOT NULL DEFAULT 'TASK_ITEM',
  task_title TEXT NOT NULL,
  status TEXT NOT NULL,
  due_at TIMESTAMP(3),
  completed_at TIMESTAMP(3),
  efficiency_contribution DECIMAL(8,2),
  notes TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_efficiency_task_details_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_user_eff_task_breakdown
  ON user_efficiency_task_details (breakdown_id);

CREATE INDEX IF NOT EXISTS idx_user_eff_task_task
  ON user_efficiency_task_details (task_id);

ALTER TABLE user_efficiency_task_details
  DROP CONSTRAINT IF EXISTS user_efficiency_task_details_breakdown_id_fkey;

ALTER TABLE user_efficiency_task_details
  ADD CONSTRAINT user_efficiency_task_details_breakdown_id_fkey
  FOREIGN KEY (breakdown_id) REFERENCES user_efficiency_breakdowns(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

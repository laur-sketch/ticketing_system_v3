-- mergeddatabase-dev: ticketing_system Task & KPI tables (MySQL target schema)
USE `mergeddatabase-dev`;

CREATE TABLE IF NOT EXISTS merged_kpi_maintenance (
  source_id                 VARCHAR(191) NOT NULL,
  title                     TEXT NOT NULL,
  main_task                 TEXT NULL,
  is_recurring              TINYINT(1) NOT NULL DEFAULT 1,
  non_recurring_start_at    DATETIME(3) NULL,
  non_recurring_end_at      DATETIME(3) NULL,
  frequency                 VARCHAR(20) NOT NULL,
  sub_kpis                  JSON NOT NULL,
  assigned_agent_id         VARCHAR(191) NULL,
  assigned_role             VARCHAR(255) NULL,
  recurrence_weekday        INT NULL,
  recurrence_month_day      INT NULL,
  period_cycle_start_at     DATETIME(3) NULL,
  last_full_completion_at   DATETIME(3) NULL,
  period_key                VARCHAR(255) NULL,
  rolled_over_incomplete    TINYINT(1) NOT NULL DEFAULT 0,
  it_project_name           VARCHAR(255) NULL,
  it_project_phase          VARCHAR(255) NULL,
  scoped_company_team_id    VARCHAR(191) NULL,
  created_by                VARCHAR(191) NOT NULL,
  created_by_role           VARCHAR(255) NOT NULL,
  created_at                DATETIME(3) NOT NULL,
  updated_at                DATETIME(3) NOT NULL,
  source_database           VARCHAR(64) NOT NULL DEFAULT 'ticketing_system',
  merged_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_id),
  KEY idx_merged_kpi_freq (frequency),
  KEY idx_merged_kpi_agent (assigned_agent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS merged_kpi_period_snapshots (
  source_id                 VARCHAR(191) NOT NULL,
  kpi_maintenance_id        VARCHAR(191) NOT NULL,
  period_key                VARCHAR(255) NOT NULL,
  frequency                 VARCHAR(20) NOT NULL,
  time_zone                 VARCHAR(100) NOT NULL,
  total                     INT NOT NULL,
  done                      INT NOT NULL,
  missing                   INT NOT NULL,
  percent                   INT NOT NULL,
  fully_complete            TINYINT(1) NOT NULL DEFAULT 0,
  contributor_progress      JSON NULL,
  captured_at               DATETIME(3) NOT NULL,
  source_database           VARCHAR(64) NOT NULL DEFAULT 'ticketing_system',
  merged_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_id),
  KEY idx_merged_kpi_snap_kpi (kpi_maintenance_id),
  KEY idx_merged_kpi_snap_period (period_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS merged_task_items (
  source_id                 VARCHAR(191) NOT NULL,
  title                     TEXT NOT NULL,
  description               TEXT NULL,
  status                    VARCHAR(20) NOT NULL,
  assigned_agent_id         VARCHAR(191) NULL,
  priority                  VARCHAR(50) NULL,
  due_at                    DATETIME(3) NULL,
  created_by                VARCHAR(191) NOT NULL,
  created_by_role           VARCHAR(255) NOT NULL,
  created_at                DATETIME(3) NOT NULL,
  updated_at                DATETIME(3) NOT NULL,
  source_database           VARCHAR(64) NOT NULL DEFAULT 'ticketing_system',
  merged_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_id),
  KEY idx_merged_task_status (status),
  KEY idx_merged_task_agent (assigned_agent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS merged_task_activities (
  source_id                 VARCHAR(191) NOT NULL,
  task_id                   VARCHAR(191) NOT NULL,
  author                    VARCHAR(255) NOT NULL,
  action                    VARCHAR(255) NOT NULL,
  detail                    TEXT NULL,
  created_at                DATETIME(3) NOT NULL,
  source_database           VARCHAR(64) NOT NULL DEFAULT 'ticketing_system',
  merged_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_id),
  KEY idx_merged_task_act_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

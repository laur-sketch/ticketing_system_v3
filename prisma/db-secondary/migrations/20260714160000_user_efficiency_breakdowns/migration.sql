-- Persistent Task KPI overall-efficiency breakdowns (mergedatabase).
-- Apply via ensureUserEfficiencyBreakdownTables or:
--   mysql -u root mergedatabase-demo < prisma/db-secondary/migrations/20260714160000_user_efficiency_breakdowns/migration.sql

CREATE TABLE IF NOT EXISTS `merged_user_efficiency_breakdowns` (
  `id`                              VARCHAR(191) NOT NULL,
  `source_user_id`                  BIGINT UNSIGNED NOT NULL,
  `portal_account_id`               VARCHAR(191) NULL,
  `display_name`                    VARCHAR(255) NOT NULL,
  `period_key`                      VARCHAR(32) NOT NULL,
  `frequency`                       VARCHAR(20) NOT NULL,
  `period_start_at`                 DATETIME(3) NOT NULL,
  `period_end_at`                   DATETIME(3) NOT NULL,
  `overall_efficiency`              DECIMAL(6,2) NOT NULL,
  `task_efficiency`                 DECIMAL(6,2) NULL,
  `ticket_efficiency`               DECIMAL(6,2) NULL,
  `total_tasks`                     INT NOT NULL DEFAULT 0,
  `completed_tasks`                 INT NOT NULL DEFAULT 0,
  `delayed_tasks`                   INT NOT NULL DEFAULT 0,
  `on_time_completion_rate`         DECIMAL(6,2) NULL,
  `average_task_completion_hours`   DECIMAL(10,2) NULL,
  `efficiency_score`                DECIMAL(8,2) NULL,
  `source_database`                 VARCHAR(64) NOT NULL DEFAULT 'ticketing_system',
  `computed_at`                     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`                      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_eff_breakdown_period` (`source_user_id`, `period_key`, `frequency`),
  KEY `idx_user_eff_breakdown_user` (`source_user_id`),
  KEY `idx_user_eff_breakdown_period` (`period_key`),
  KEY `idx_user_eff_breakdown_freq` (`frequency`),
  KEY `idx_user_eff_breakdown_overall` (`overall_efficiency`),
  CONSTRAINT `fk_user_eff_breakdown_user`
    FOREIGN KEY (`source_user_id`) REFERENCES `merged_users` (`source_user_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `merged_user_efficiency_task_details` (
  `id`                          VARCHAR(191) NOT NULL,
  `breakdown_id`                VARCHAR(191) NOT NULL,
  `task_id`                     VARCHAR(191) NULL,
  `task_source`                 VARCHAR(32) NOT NULL DEFAULT 'TASK_ITEM',
  `task_title`                  VARCHAR(512) NOT NULL,
  `status`                      VARCHAR(20) NOT NULL,
  `due_at`                      DATETIME(3) NULL,
  `completed_at`                DATETIME(3) NULL,
  `efficiency_contribution`     DECIMAL(8,2) NULL,
  `notes`                       TEXT NULL,
  `created_at`                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_user_eff_task_breakdown` (`breakdown_id`),
  KEY `idx_user_eff_task_task` (`task_id`),
  CONSTRAINT `fk_user_eff_task_breakdown`
    FOREIGN KEY (`breakdown_id`) REFERENCES `merged_user_efficiency_breakdowns` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

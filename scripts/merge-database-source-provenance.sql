-- Add source_database provenance to HRIS merged tables (idempotent).
-- source_user_id / source_log_id = primary key from source_database.
USE `mergeddatabase-dev`;

SET @has_mu_source_db := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'mergeddatabase-dev' AND TABLE_NAME = 'merged_users' AND COLUMN_NAME = 'source_database'
);

SET @sql_mu := IF(
  @has_mu_source_db = 0,
  'ALTER TABLE merged_users ADD COLUMN source_database VARCHAR(64) NOT NULL DEFAULT ''hris-dev'' AFTER source_user_id, ADD KEY idx_merged_users_source_db (source_database)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_mu;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE merged_users SET source_database = 'hris-dev' WHERE source_database IS NULL OR source_database = '';

SET @has_att_source_db := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'mergeddatabase-dev' AND TABLE_NAME = 'merged_attendance_clock_in' AND COLUMN_NAME = 'source_database'
);

SET @sql_att := IF(
  @has_att_source_db = 0,
  'ALTER TABLE merged_attendance_clock_in ADD COLUMN source_database VARCHAR(64) NOT NULL DEFAULT ''hris-dev'' AFTER source_log_id, ADD KEY idx_merged_attendance_source_db (source_database)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_att;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE merged_attendance_clock_in SET source_database = 'hris-dev' WHERE source_database IS NULL OR source_database = '';

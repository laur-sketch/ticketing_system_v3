-- Add HRIS auth columns to merged_users (idempotent for existing mergeddatabase-dev).
USE `mergeddatabase-dev`;

SET @has_username := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'mergeddatabase-dev' AND TABLE_NAME = 'merged_users' AND COLUMN_NAME = 'username'
);

SET @sql_username := IF(
  @has_username = 0,
  'ALTER TABLE merged_users ADD COLUMN username VARCHAR(255) NULL AFTER employee_code, ADD KEY idx_merged_users_username (username)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_username;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_password := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'mergeddatabase-dev' AND TABLE_NAME = 'merged_users' AND COLUMN_NAME = 'password_hash'
);

SET @sql_password := IF(
  @has_password = 0,
  'ALTER TABLE merged_users ADD COLUMN password_hash VARCHAR(255) NULL AFTER username',
  'SELECT 1'
);
PREPARE stmt FROM @sql_password;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE merged_users mu
INNER JOIN `hris-dev`.users u ON u.id = mu.source_user_id
SET
  mu.username = u.username,
  mu.password_hash = u.password
WHERE mu.username IS NULL OR mu.password_hash IS NULL;

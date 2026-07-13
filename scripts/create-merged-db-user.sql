-- Create a least-privilege MySQL user for DATABASE_URL_SECONDARY (mergeddatabase-dev).
-- Run once as root/admin:
--   mysql -u root -p < scripts/create-merged-db-user.sql
--
-- Replace the password placeholder before running in non-dev environments.

CREATE DATABASE IF NOT EXISTS `mergeddatabase-dev`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'merge_app'@'localhost' IDENTIFIED BY 'CHANGE_ME_merge_app_password';
CREATE USER IF NOT EXISTS 'merge_app'@'127.0.0.1' IDENTIFIED BY 'CHANGE_ME_merge_app_password';

-- Read-only for the ETL-populated reporting database.
GRANT SELECT ON `mergeddatabase-dev`.* TO 'merge_app'@'localhost';
GRANT SELECT ON `mergeddatabase-dev`.* TO 'merge_app'@'127.0.0.1';

-- Optional: allow the merge ETL script (run as merge_etl) to refresh data.
-- CREATE USER IF NOT EXISTS 'merge_etl'@'localhost' IDENTIFIED BY 'CHANGE_ME_merge_etl_password';
-- GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, INDEX, ALTER ON `mergeddatabase-dev`.* TO 'merge_etl'@'localhost';

FLUSH PRIVILEGES;

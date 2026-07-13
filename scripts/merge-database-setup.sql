-- mergeddatabase-dev setup: HRIS users + attendance + ticketing_system KPI/tasks
-- Run against MySQL (MariaDB-compatible)

CREATE DATABASE IF NOT EXISTS `mergeddatabase-dev`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `mergeddatabase-dev`;

-- ── HRIS: Employees with designated company ──────────────────────────────────
DROP TABLE IF EXISTS merged_attendance_clock_in;
DROP TABLE IF EXISTS merged_task_activities;
DROP TABLE IF EXISTS merged_task_items;
DROP TABLE IF EXISTS merged_kpi_period_snapshots;
DROP TABLE IF EXISTS merged_kpi_maintenance;
DROP TABLE IF EXISTS merged_users;

CREATE TABLE merged_users (
  source_user_id       BIGINT UNSIGNED NOT NULL,
  source_database      VARCHAR(64) NOT NULL DEFAULT 'hris-dev',
  employee_code        VARCHAR(255) NULL,
  username             VARCHAR(255) NULL,
  password_hash        VARCHAR(255) NULL,
  name                 VARCHAR(255) NOT NULL,
  email                VARCHAR(255) NULL,
  phone_number         VARCHAR(20) NULL,
  role                 VARCHAR(20) NOT NULL,
  company_id           BIGINT UNSIGNED NULL,
  company_name         VARCHAR(255) NULL,
  department           VARCHAR(255) NULL,
  position             VARCHAR(255) NULL,
  employment_status    VARCHAR(255) NOT NULL,
  is_active            TINYINT(1) NOT NULL DEFAULT 1,
  hire_date            DATE NULL,
  created_at           TIMESTAMP NULL,
  updated_at           TIMESTAMP NULL,
  merged_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_user_id),
  KEY idx_merged_users_source_db (source_database),
  KEY idx_merged_users_company (company_id),
  KEY idx_merged_users_email (email),
  KEY idx_merged_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO merged_users (
  source_user_id, source_database, employee_code, username, password_hash, name, email, phone_number, role,
  company_id, company_name, department, position, employment_status,
  is_active, hire_date, created_at, updated_at
)
SELECT
  u.id,
  'hris-dev',
  u.employee_code,
  u.username,
  u.password,
  u.name,
  u.email,
  u.phone_number,
  u.role,
  u.company_id,
  c.name AS company_name,
  u.department,
  u.position,
  u.employment_status,
  u.is_active,
  u.hire_date,
  u.created_at,
  u.updated_at
FROM `hris-dev`.users u
LEFT JOIN `hris-dev`.companies c ON c.id = u.company_id;

-- ── HRIS: Clock-in attendance (present-time events only) ───────────────────
CREATE TABLE merged_attendance_clock_in (
  source_log_id          BIGINT UNSIGNED NOT NULL,
  source_database        VARCHAR(64) NOT NULL DEFAULT 'hris-dev',
  source_user_id         BIGINT UNSIGNED NOT NULL,
  employee_code          VARCHAR(255) NULL,
  employee_name          VARCHAR(255) NULL,
  company_name           VARCHAR(255) NULL,
  clock_in_at            DATETIME NOT NULL,
  verified_at            DATETIME NULL,
  authentication_method  VARCHAR(50) NULL,
  geofence_status        VARCHAR(32) NULL,
  latitude               DECIMAL(10,8) NULL,
  longitude              DECIMAL(11,8) NULL,
  ip_address             VARCHAR(45) NULL,
  created_at             DATETIME NULL,
  merged_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_log_id),
  KEY idx_merged_attendance_source_db (source_database),
  KEY idx_merged_attendance_user (source_user_id),
  KEY idx_merged_attendance_clock_in (clock_in_at),
  KEY idx_merged_attendance_company (company_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO merged_attendance_clock_in (
  source_log_id, source_database, source_user_id, employee_code, employee_name, company_name,
  clock_in_at, verified_at, authentication_method, geofence_status,
  latitude, longitude, ip_address, created_at
)
SELECT
  al.id,
  'hris-dev',
  al.user_id,
  u.employee_code,
  u.name,
  c.name,
  al.time_in_clicked_at,
  al.verified_at,
  al.authentication_method,
  al.geofence_status,
  al.latitude,
  al.longitude,
  al.ip_address,
  al.created_at
FROM `hris-dev`.attendance_logs al
INNER JOIN `hris-dev`.users u ON u.id = al.user_id
LEFT JOIN `hris-dev`.companies c ON c.id = u.company_id
WHERE al.type = 'clock_in'
  AND al.time_in_clicked_at IS NOT NULL;

-- Efficiency breakdowns live in MySQL mergedatabase, not PostgreSQL.
-- Tickets / ticket activity / ticket metrics remain in this primary DB.

DROP TABLE IF EXISTS user_efficiency_task_details;
DROP TABLE IF EXISTS user_efficiency_breakdowns;

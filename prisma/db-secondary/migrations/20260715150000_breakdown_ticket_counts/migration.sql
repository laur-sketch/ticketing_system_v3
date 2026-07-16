-- Ticket counts backing ticket_efficiency (closed ÷ closed+pending),
-- so UI cards can show Closed / Pending from the merged database.
ALTER TABLE `merged_user_efficiency_breakdowns`
  ADD COLUMN `tickets_closed` INT NOT NULL DEFAULT 0 AFTER `delayed_tasks`,
  ADD COLUMN `tickets_pending` INT NOT NULL DEFAULT 0 AFTER `tickets_closed`;

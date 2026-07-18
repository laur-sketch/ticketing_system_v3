ALTER TABLE `merged_user_efficiency_breakdowns`
  ADD COLUMN `delay_penalty_total` INT NOT NULL DEFAULT 0 AFTER `tickets_pending`,
  ADD COLUMN `task_efficiency_before_penalty` DECIMAL(6,2) NULL AFTER `delay_penalty_total`;

ALTER TABLE `merged_user_efficiency_task_details`
  ADD COLUMN `delay_penalty_accrued` INT NOT NULL DEFAULT 0 AFTER `efficiency_contribution`;

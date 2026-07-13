INSERT INTO merged_kpi_maintenance (
      source_id, title, main_task, is_recurring, non_recurring_start_at, non_recurring_end_at,
      frequency, sub_kpis, assigned_agent_id, assigned_role, recurrence_weekday, recurrence_month_day,
      period_cycle_start_at, last_full_completion_at, period_key, rolled_over_incomplete,
      it_project_name, it_project_phase, scoped_company_team_id, created_by, created_by_role,
      created_at, updated_at
    ) VALUES (
      'seed_kpi_daily_ops', 'Daily Operations KPI', 'Service desk throughput', 1,
      NULL, NULL,
      'DAILY', '[{"name":"Tickets resolved","target":50},{"name":"SLA compliance %","target":95}]', 'cmoqrlj76000i66vw97yqydij', 'Agent',
      NULL, NULL,
      NULL, NULL,
      '2026-W27', 0,
      NULL, NULL, NULL,
      'seed-script', 'Admin',
      '2026-07-11T13:17:20.978', '2026-07-11T13:17:20.978'
    );
INSERT INTO merged_kpi_maintenance (
      source_id, title, main_task, is_recurring, non_recurring_start_at, non_recurring_end_at,
      frequency, sub_kpis, assigned_agent_id, assigned_role, recurrence_weekday, recurrence_month_day,
      period_cycle_start_at, last_full_completion_at, period_key, rolled_over_incomplete,
      it_project_name, it_project_phase, scoped_company_team_id, created_by, created_by_role,
      created_at, updated_at
    ) VALUES (
      'seed_kpi_it_project', 'IT Project Tracker', 'Portal modernization', 1,
      NULL, NULL,
      'MONTHLY', '[{"name":"Milestone completion","target":100},{"name":"Open defects","target":0}]', 'cmoqrlj5y000g66vwkqzc0flr', NULL,
      NULL, NULL,
      NULL, NULL,
      NULL, 0,
      'Ticketing System v3', 'UAT', NULL,
      'seed-script', 'Admin',
      '2026-07-11T13:17:20.987', '2026-07-11T13:17:20.987'
    );
INSERT INTO merged_kpi_period_snapshots (
      source_id, kpi_maintenance_id, period_key, frequency, time_zone, total, done, missing,
      percent, fully_complete, contributor_progress, captured_at
    ) VALUES (
      'seed_snap_kpi1_w27', 'seed_kpi_daily_ops', '2026-W27', 'DAILY',
      'Asia/Manila', 10, 8, 2, 80,
      0, NULL, '2026-07-11T13:17:20.989'
    );
INSERT INTO merged_kpi_period_snapshots (
      source_id, kpi_maintenance_id, period_key, frequency, time_zone, total, done, missing,
      percent, fully_complete, contributor_progress, captured_at
    ) VALUES (
      'seed_snap_kpi2_q3', 'seed_kpi_it_project', '2026-Q3', 'QUARTERLY',
      'Asia/Manila', 12, 9, 3, 75,
      0, NULL, '2026-07-11T13:17:20.992'
    );
INSERT INTO merged_task_items (
      source_id, title, description, status, assigned_agent_id, priority, due_at,
      created_by, created_by_role, created_at, updated_at
    ) VALUES (
      'seed_task_network_audit', 'Network access audit', 'Review firewall rules for branch offices', 'CURRENT',
      'cmoqrlj76000i66vw97yqydij', 'HIGH', '2026-07-18T13:17:20.995',
      'seed-script', 'Admin', '2026-07-11T13:17:20.995', '2026-07-11T13:17:20.995'
    );
INSERT INTO merged_task_items (
      source_id, title, description, status, assigned_agent_id, priority, due_at,
      created_by, created_by_role, created_at, updated_at
    ) VALUES (
      'seed_task_kpi_review', 'Weekly KPI review', 'Validate KPI snapshots against helpdesk CSV', 'DELAYED',
      'cmoqrlj5y000g66vwkqzc0flr', 'MEDIUM', '2026-07-14T13:17:20.997',
      'seed-script', 'Admin', '2026-07-11T13:17:20.997', '2026-07-11T13:17:20.997'
    );
INSERT INTO merged_task_items (
      source_id, title, description, status, assigned_agent_id, priority, due_at,
      created_by, created_by_role, created_at, updated_at
    ) VALUES (
      'seed_task_helpdesk_sync', 'MergeDatabase sync verification', 'Confirm task/KPI ETL into MySQL', 'DONE',
      'cmoqrlj76000i66vw97yqydij', 'LOW', NULL,
      'seed-script', 'Admin', '2026-07-11T13:17:20.998', '2026-07-11T13:17:20.998'
    );
INSERT INTO merged_task_activities (
      source_id, task_id, author, action, detail, created_at
    ) VALUES (
      'seed_act_1', 'seed_task_network_audit', 'seed-script', 'created',
      'Task opened from seed script', '2026-07-11T13:17:21'
    );
INSERT INTO merged_task_activities (
      source_id, task_id, author, action, detail, created_at
    ) VALUES (
      'seed_act_2', 'seed_task_network_audit', 'seed-script', 'comment',
      'Waiting for branch inventory list', '2026-07-11T13:17:21.002'
    );
INSERT INTO merged_task_activities (
      source_id, task_id, author, action, detail, created_at
    ) VALUES (
      'seed_act_3', 'seed_task_kpi_review', 'seed-script', 'status_change',
      'Marked as DELAYED pending CSV export', '2026-07-11T13:17:21.003'
    );
INSERT INTO merged_task_activities (
      source_id, task_id, author, action, detail, created_at
    ) VALUES (
      'seed_act_4', 'seed_task_kpi_review', 'seed-script', 'assigned',
      'Assigned to agent cmoqrlj5y000g66vwkqzc0flr', '2026-07-11T13:17:21.004'
    );
INSERT INTO merged_task_activities (
      source_id, task_id, author, action, detail, created_at
    ) VALUES (
      'seed_act_5', 'seed_task_helpdesk_sync', 'seed-script', 'completed',
      'Sync script verified successfully', '2026-07-11T13:17:21.005'
    );
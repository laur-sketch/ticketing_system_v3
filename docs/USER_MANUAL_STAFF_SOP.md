# Ticket System v3 Staff SOP Manual

## Purpose

This SOP is for Personnel/Agent, Admin, and SuperAdmin users who operate tickets, board flows, and KPI work.

## 1) Daily startup checklist

1. Sign in at `/signin`.
2. Open `/agent` (Board) and check current assignments.
3. Open `/insights` to review metrics and risk indicators.
4. Prioritize overdue and high-priority tickets first.

## 2) Ticket handling SOP

### Intake

1. Review new/unassigned tickets.
2. Validate ticket completeness (title, impact, repro steps).
3. Request missing details immediately if needed.

### Assignment

1. Assign ticket to appropriate personnel/owner queue.
2. Confirm ownership is visible on board/dashboard.

### Work-in-progress

1. Move ticket status according to actual progress.
2. Add timeline updates for major actions/decisions.
3. Keep user-facing comments clear and actionable.

### Resolution and closure

1. Verify acceptance criteria are met.
2. Mark resolved with concise resolution note.
3. Close when user confirms or according to policy.

## 3) Board operations (`/agent`)

### Standard practice

- Use drag-and-drop status updates where enabled.
- Keep work-in-progress load realistic.
- Avoid stale cards by updating status same day.

### KPI kanban operations

- KPI workflow is managed in `/agent`.
- KPI cards can include flat or segmented sub-KPI checklists.
- Only assigned personnel can edit checklist completion items.
- Admin can assign/reassign KPI workload where permissions allow.

### Delayed completed items

- If completed after due period, item still moves to Done with delayed label.
- Use delayed indicators in daily review to improve planning.

## 4) KPI recurrence SOP

- Daily KPIs reset by calendar date.
- Weekly KPIs reset using configured start weekday.
- Monthly KPIs reset using configured day of month.
- On period rollover, sub-KPI checklist states reset.

Operational note: verify correct timezone behavior during weekly/monthly transitions.

## 5) Role-based controls

### Personnel/Agent

- Work assigned tickets/KPIs.
- Edit only own task/checklist in restricted flows.

### Admin/SuperAdmin

- Configure assignment and personnel setup.
- Monitor escalations and SLA compliance.
- Set and assign KPI workload.

## 6) Escalation and SLA SOP

1. Review SLA risk signals on dashboard/insights.
2. Trigger or validate escalations as configured.
3. Ensure escalated tickets include clear activity logs.
4. Coordinate handoff when queue ownership changes.

## 7) Account and security SOP

Open `/admin/account` > `Security`:

- Change username (requires current password)
- Change email (requires current password)
- Change password
- Submit account suspension/deletion request

Security rule: credential changes force sign-out; re-authenticate immediately.

## 8) Shift-end checklist

1. Ensure all active tickets have updated status.
2. Leave handoff notes for unresolved high-priority work.
3. Verify KPI checklist updates are complete for your assignments.
4. Sign out of shared devices.

## 9) Incident troubleshooting quick guide

### Cannot update checklist/task

- Confirm item is assigned to current user in restricted flow.

### Page/action missing

- Verify role permissions with Admin/SuperAdmin.

### Build/deploy discrepancy (admin ops)

- Confirm current deployed process status in PM2.
- Rebuild/restart according to deployment procedure.


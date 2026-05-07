# Ticket System v3 User Manual

## 1) Overview

Ticket System v3 is a service desk platform for:

- submitting and tracking support tickets
- managing assigned work through board-based workflows
- monitoring KPI and operational metrics
- handling account security and profile settings

This manual is written for daily users (Customer, Personnel/Agent, Admin, SuperAdmin).

## 2) Access and Sign-in

### Sign-in methods

- Go to `/signin`
- Sign in using:
  - local credentials (username/email + password), or
  - configured SSO provider (if enabled by your organization)

### First-time access

- New users can register through `/signup` when enabled.
- If your account is created by Admin, use the credentials provided to you.

### Sign-out

- Use the sign-out action in the UI (for example in My Account).
- For security-sensitive updates (email/username/password), the system signs you out after success.

## 3) Roles and What They Can See

### Customer

- Home dashboard
- Create ticket (`/tickets/new`)
- View own tickets and conversations
- Verify/confirm ticket resolution
- Submit rating/feedback (when available)

### Personnel / Agent

- Board (`/agent`) for assigned operational work
- Personal metrics view in `/insights`
- My Account (`/admin/account`)

### Admin / SuperAdmin

- Ticket Dashboard (`/`)
- Personnel management (`/admin/personnel`)
- Board (`/agent`)
- Metrics & Reports (`/insights`)
- Escalation Triggers (`/admin/escalation-triggers`)
- My Account (`/admin/account`)

## 4) Core Navigation

- `/` - main dashboard (role-aware landing)
- `/agent` - orchestration board and KPI kanban operations
- `/insights` - metrics and reports (KPI/task visibility depends on role)
- `/admin/personnel` - personnel and assignment controls
- `/admin/account` - profile, security, billing tabs
- `/tickets/new` - create ticket
- `/my-tickets` - ticket list for customer flow

## 5) Customer Guide

### Submit a ticket

1. Open `/tickets/new`.
2. Fill title, description, category/priority (if shown).
3. Submit.
4. Save the ticket ID for tracking.

### Track and reply

1. Open your ticket from `/my-tickets` (or direct ticket link).
2. Review status and timeline updates.
3. Add replies/attachments as needed.

### Resolution verification and rating

- When a ticket is marked resolved, verify outcome in the ticket page.
- Submit confirmation and rating if the flow is enabled for your ticket state.

## 6) Personnel / Agent Guide

### A) Board (`/agent`)

- Use the board to manage work items and progress.
- Drag-and-drop is used where enabled for status transitions.
- KPI kanban flow is handled here as the main operational area.

### B) KPI checklist behavior

- KPIs can include flat or segmented sub-KPI checklists.
- Only the assigned personnel can edit their own checklist completion.
- If a KPI/task is completed after due time, it can still appear in Done with delayed indicator.

### C) Metrics (`/insights`)

- Personnel users see personal metric views.
- Some management controls are hidden for personnel-only roles by design.

## 7) Admin / SuperAdmin Guide

### A) Ticket Dashboard

- Monitor queue health and ticket distribution.
- Review statuses, SLA risk, and escalations.

### B) Personnel Management

- Create/manage personnel records.
- Control assignment readiness and workforce setup.

### C) Board and KPI assignment

- Assign and organize KPI workload.
- Admin can set and assign KPI work.
- Checklist completion rights remain with the assigned person.

### D) Escalation Triggers

- Configure escalation behavior for SLA and process controls.

## 8) KPI and Task Behavior Notes

- KPI operations are centered on the board flow.
- Recurrence supports daily, weekly (configurable weekday), and monthly (configurable month day) cycles.
- Sub-KPI checklists reset when a new KPI period starts.
- Delayed-but-completed items are marked accordingly in Done state.

## 9) My Account and Security

Open `/admin/account` then use the **Security** tab.

### Change username

1. Enter new username.
2. Enter current password.
3. Click **Update username**.
4. System signs you out; sign in again with the new username.

Rules:

- 3-32 characters
- allowed: letters, numbers, `.`, `_`, `-`
- must be unique

### Change email

1. Enter new email.
2. Enter current password.
3. Click **Update email**.
4. System signs you out; sign in again using the new email.

### Change password

1. Enter current password.
2. Enter new password and confirm.
3. Click **Update password**.
4. System signs you out; sign in again with the new password.

### Account suspension/deletion request

- Submit a request in Security tab.
- Admin/SuperAdmin reviews request history and status.

## 10) Troubleshooting

### Cannot sign in

- Verify username/email and password.
- Confirm account is active.
- If using SSO, confirm identity provider availability.

### "Unauthorized" or missing page/section

- Your role may not have access to that function.
- Contact Admin for role/access updates.

### KPI/task cannot be edited

- Only assignee can edit checklist/task status in restricted flows.
- Confirm the item is assigned to your account.

### Username/email update fails

- Re-check current password.
- Ensure new username/email is not already used.
- Ensure username matches format requirements.

## 11) Best Practices

- Keep account credentials private; rotate passwords regularly.
- Use clear, complete ticket descriptions to reduce back-and-forth.
- Update work item statuses in real time.
- Review delayed labels to improve planning and SLA performance.

## 12) Quick Reference

- Sign in: `/signin`
- Create ticket: `/tickets/new`
- Board: `/agent`
- Metrics: `/insights`
- My Account: `/admin/account`


# Ticket System v3 — User Manual

## 1) Overview

Ticket System v3 is a service desk platform for:

- submitting and tracking support tickets
- managing assigned work through **ticket** and **task** boards
- monitoring KPI and operational metrics in **Metrics & Reports**
- handling account security and profile settings

This manual covers daily use for **Customer**, **Personnel**, **Admin**, and **SuperAdmin** roles.

## 2) Access and sign-in

### Sign-in methods

- Go to **`/signin`**
- Sign in with:
  - local credentials (username or email + password), or
  - **Google OAuth**, when configured

### First-time access

- Self-registration: **`/signup`** when enabled
- Admin-provisioned accounts: use credentials provided by your administrator

### Sign-out

- Use **Sign out** in the header (or My Account).
- Username, email, and password changes sign you out automatically after success.

## 3) Roles and navigation

Navigation is **role-based** (sidebar on large screens; menu button on mobile).

### Customer

| Item | Path |
|------|------|
| Dashboard | `/` |
| Active Tickets | `/my-tickets` |
| Knowledge Base | `/tickets/knowledge` |
| Create ticket | `/tickets/new` |
| My Account | `/admin/account` |

Customers are redirected away from `/agent` and `/insights`.

### Personnel

| Item | Path |
|------|------|
| Ticket Dashboard | `/my-requests` |
| Board → Ticket Board | `/agent` or `/agent?board=ticket` |
| Board → Task Board | `/agent?board=kpi` |
| Metrics & Reports | `/insights` |
| My Account | `/admin/account` |

Personnel landing: **`/agent`** (home redirects here).

Optional (when granted **assignment-board** permission):

- **Assignment Board** — `/admin/manual-assignment`
- **Task Management** tab on **`/insights`** (KPI definitions for coordinators)

### Admin / SuperAdmin

| Item | Path |
|------|------|
| Ticket Dashboard | `/` |
| Create requests | `/admin/ticket-requests` |
| Personnel | `/admin/personnel` |
| Board | `/agent` (see board tabs below) |
| Metrics & Reports | `/insights` |
| Priority alerts | `/admin/escalation-triggers` |
| My Account | `/admin/account` |

On **`/agent`**, admins also use sub-tabs:

- **Assignment Board** — `/admin/manual-assignment`
- **Company Board** — `/agent?board=company`
- **Ticket Board** — `/agent?board=ticket`
- **Task Board** — `/agent?board=kpi` (KPI kanban + task definitions)

Header utilities (staff): ticket search, notifications, **Process** (`/process`).

## 4) Customer guide

### Submit a ticket

1. Open **`/tickets/new`**.
2. Complete title, description, department/business unit, and contact fields.
3. Attach screenshots if helpful (limits apply).
4. Submit; save the **ticket number**.

**Intake lock:** If a resolved ticket still needs verification/rating, new tickets may be blocked until that flow is finished.

### Track and reply

1. Use **`/my-tickets`** or the dashboard kanban at **`/`**.
2. Review status, timeline, and conversation.
3. Reply when support requests more information.

### Verification and rating

- Resolved tickets: complete **`/tickets/[id]/verification`** and rating when prompted.
- Ratings of **3 stars or below** require written feedback before the ticket can close.
- Email links may also point to verification actions.

## 5) Personnel guide

### Ticket Dashboard (`/my-requests`)

- Personal view of tickets you submitted or own per policy.
- Same intake-lock rules as customers when you are the requestor.

### Ticket Board (`/agent?board=ticket`)

- Kanban/table views for operational ticket work.
- Set **priority** above **Set Priority Level (UNSET)** before moving to **In progress** (policy enforced).
- Drag-and-drop status updates where enabled.

### Task Board (`/agent?board=kpi`)

- **Task kanban** columns: **Current**, **Done**, **Delayed** (see KPI section).
- Complete **sub-KPI checklists** only on tasks assigned to you (when restricted).
- Coordinators with assignment permission may use **Task Management** on **`/insights`**.

### Metrics & Reports (`/insights`)

Tabs (role-dependent):

- **Ticket metrics** — volume, SLA, CSAT, charts (date range filter).
- **Task metrics** / **My task metrics** — helpdesk and checklist pillar metrics.
- **Task Management** (Personnel coordinators only) — define recurring tasks when permitted.

## 6) Admin / SuperAdmin guide

### Ticket Dashboard (`/`)

- Queue health, on-duty roster, recent activity, priority stack.

### Create requests (`/admin/ticket-requests`)

- Admin intake for tickets on behalf of users; links to assignment and board views.

### Personnel (`/admin/personnel`)

- Personnel registry, portal accounts, assignment readiness, account-request review.

### Boards

| Board | Purpose |
|-------|---------|
| Assignment | Drag tickets to assign owners (`/admin/manual-assignment`) |
| Company | Cross-team company-line view |
| Ticket | Main operational ticket kanban |
| Task | KPI/task kanban + **Task Definition** console (admins) |

### Priority alerts (`/admin/escalation-triggers`)

- Configure priority-linked escalation behavior.

### Metrics & Reports (`/insights`)

- Full ticket and task metrics; reporting window and cadence controls.
- Admins define tasks on **Task Board**, not the Insights Task Management tab.

### Other admin paths

- **`/admin/account-management`** — portal account administration (when deployed)
- **`/reports`** — reporting views as implemented
- **`POST /api/sla/sweep`** — SLA breach scan (secured; admin automation)

## 7) KPI and task behavior

### Recurring tasks

- Frequencies: **Daily**, **Weekly** (configurable weekday), **Monthly** (configurable day of month).
- Sub-KPI checklists can be **flat** or **segmented** (grouped sections).
- On period rollover, checklist completion resets for the new cycle.
- Timezone: browser/reporting zone is sent to the API for period boundaries.

### IT Project Implementation

Special non-recurring pillar:

- Organized by **project name** and **phases**; each sub-task has its own **due date**.
- Dates are entered/displayed as **MM/DD/YYYY**; stored as calendar days.
- Assignees record an **actual date** when marking a sub-task complete.
- **Delayed** column applies **only** to this pillar when a sub-task is past due or completed after due date.
- Fully complete but late work stays in **Delayed**, not **Done**.

### Other recurring tasks

- Completed after the due period may still appear in **Done** with a delayed indicator (recurring KPIs).
- Only the **assignee** can edit checklist items in restricted flows.

## 8) My Account and security

Open **`/admin/account`** → **Security** tab (available to Customer, Personnel, and Admin roles).

### Change username

1. New username + current password → **Update username**.
2. Sign in again with the new username.

Rules: 3–32 characters; letters, numbers, `.`, `_`, `-`; unique.

### Change email / password

Same pattern: current password required; automatic sign-out on success.

### Account requests

Submit suspension or deletion requests; Admin/SuperAdmin reviews in Personnel or account workflows.

## 9) Troubleshooting

| Issue | What to try |
|-------|-------------|
| Cannot sign in | Verify credentials; check Google sign-in if used; confirm account active |
| Unauthorized / missing menu | Role may not include that feature — contact Admin |
| Cannot create ticket | Complete pending resolved verification/rating |
| Cannot move to In progress | Set priority above **UNSET** |
| Cannot edit checklist | Confirm you are the assignee |
| KPI dates look wrong | Confirm timezone around weekly/monthly rollover |

## 10) Quick reference

| Path | Description |
|------|-------------|
| `/signin` | Sign in |
| `/signup` | Self-registration |
| `/` | Home (customer dashboard or admin ticket dashboard) |
| `/my-tickets` | Customer ticket list |
| `/my-requests` | Personnel ticket dashboard |
| `/tickets/new` | New ticket |
| `/agent` | Staff boards (use `?board=` tabs) |
| `/admin/manual-assignment` | Assignment board |
| `/insights` | Metrics & reports |
| `/process` | Process / lifecycle reference |
| `/admin/personnel` | Personnel admin |
| `/admin/escalation-triggers` | Priority alerts |
| `/admin/account` | My Account |

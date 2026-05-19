# Ticket System v3  

## Complete manual — project rundown & user guide  

**Document version:** 1.0 · **Product:** Ticket System v3 · **Audience:** operators, staff, customers, and administrators · **May 2026**

---

## Table of contents  

1. [Project rundown (technical)](#1-project-rundown-technical)  
2. [Architecture & data](#2-architecture--data)  
3. [Authentication & roles](#3-authentication--roles)  
4. [Deployment & operations](#4-deployment--operations)  
5. [Customer user guide](#5-customer-user-guide)  
6. [Staff & personnel guide](#6-staff--personnel-guide)  
7. [Admin & SuperAdmin guide](#7-admin--superadmin-guide)  
8. [Account security (My Account)](#8-account-security-my-account)  
9. [Troubleshooting](#9-troubleshooting)  
10. [Quick reference — URLs](#10-quick-reference--urls)  

---

## 1) Project rundown (technical)  

### 1.1 Purpose  

Ticket System v3 is a full-stack **service desk / ticketing** application for submitting requests, assigning work to teams and personnel, tracking **SLA** targets, escalating breached items, managing **KPI** maintenance tasks, and collecting **customer verification and feedback** after resolution.  

### 1.2 Technology stack  

| Layer | Technology |
|--------|------------|
| Application | **Next.js** (App Router), **React**, **Tailwind CSS** |
| API | **Next.js Route Handlers** (`src/app/api/**`) |
| Database | **PostgreSQL** with **Prisma ORM** |
| Authentication | **NextAuth.js** — credentials, optional **Google OAuth**, optional **corporate OIDC (OpenID Connect)** |
| Email | **SMTP** (e.g. Brevo) for resolution and verification flows |

### 1.3 Repository layout (high level)  

- **`src/app/`** — Pages and API routes (App Router).  
- **`src/components/`** — Shared UI (navigation, portal shell, dashboards).  
- **`src/lib/`** — Business logic: auth, SLA, email, ticket actions, portal accounts.  
- **`prisma/`** — Schema, migrations, seed.  
- **`ecosystem.config.cjs`** — **PM2** process definition for production on Node hosts.  

### 1.4 Core concepts  

- **Ticket** — Single customer issue with status (Open → In progress → Resolved → Closed, plus Pending info / Escalated as needed).  
- **Priority** — Includes a **“Set Priority Level” (UNSET)** default until staff sets **Low / Medium / High / Urgent**; work typically cannot move to **In progress** until priority is set (policy enforced in API/board).  
- **SLA** — First-response and resolution due times derive from **SlaPolicy** per priority; automated sweep can escalate breached unresolved tickets (Admin-triggered API).  
- **Teams & agents** — Tickets route to teams; **Personnel** work assigned queues from **`/agent`**.  

---

## 2) Architecture & data  

### 2.1 Request flow (simplified)  

1. User authenticates → session carries **role** and **email**.  
2. Customer submits ticket → **`POST /api/tickets`** creates row, SLA timestamps, activity log.  
3. Staff manage lifecycle → **`PATCH /api/tickets/[id]`** (status, priority, escalation, resolution).  
4. On **Resolved**, system may email the **requestor inbox** (SMTP); customer **verifies** and submits **rating** where configured.  

### 2.2 Notification email routing  

- **Google sign-in:** notification and verification emails target the **Google account email** (`authProvider: google`).  
- **Portal / credentials:** **`requestorEmail`** on the ticket aligns with the **portal account work email** stored in the database (with safeguards); synthetic portal identities may require an explicit notification email on intake.  

### 2.3 Pending resolution confirmation (customers)  

If a customer has a **resolved** ticket that still needs **verification and mandatory rating** (no feedback record yet), **new ticket creation may be blocked** until that flow is completed. The UI surfaces a **notification** and links to the **verification** path (e.g. `/tickets/[id]/verification`).  

---

## 3) Authentication & roles  

### 3.1 Sign-in  

- **URL:** `/signin`  
- Methods: **local credentials** (username or email + password), **Google** (if configured), **corporate SSO** (if OIDC env vars are set).  

### 3.2 Role resolution (typical)  

1. Claims from IdP profile (`role`, `roles`, `groups`) when present.  
2. Env lists **`ADMIN_EMAILS`** / **`AGENT_EMAILS`** for bootstrap mapping.  
3. Default **Customer** where no other rule applies.  

### 3.3 Role summary  

| Role | Typical access |
|------|----------------|
| **Customer** | Home, **Create ticket**, **My tickets**, ticket detail, verification/rating, customer profile. |
| **Personnel** | Own **assignment queue** (`/agent`), ticket workspace for assigned items, insights as configured. |
| **Agent** | Broader operational queue/board patterns (org-dependent). |
| **Admin / SuperAdmin** | Dashboard, personnel, escalation triggers, assignment oversight, SLA sweep, reports as configured. |

**Head / privileged portal flags** may grant coordination powers (e.g. escalation) per implementation.  

---

## 4) Deployment & operations  

### 4.1 Environment  

Copy **`.env.example`** to **`.env`**. Key groups: `DATABASE_URL`, **NextAuth** secret and URL, **OIDC / Google** client settings, **SMTP (Brevo)** for mail, **`APP_BASE_URL` / `NEXTAUTH_URL`** for correct email links, optional admin email lists.  

### 4.2 Database  

- **Prisma:** `npx prisma migrate deploy` *or* `npx prisma db push` (depending on how the environment was baselined).  
- **Helpdesk Google Form CSV (Insights task metrics):** after deploy, upload the sheet export once per environment — `npm run db:apply-helpdesk-csv path/to/"IT SALF - HELPDESK.csv"` (spreadsheet **Completed** is counted as **For confirmation** alongside **Closed**).  
- **Seed (optional):** `npm run db:seed` for demo data.  
- One-off: `npx tsx scripts/ensure-unset-priority-data.ts` if using **UNSET** priority and SLA rows need ensuring after `db push`.  

### 4.3 Production (Node + PM2)  

- Build: `npm run build`  
- Start: `pm2 start ecosystem.config.cjs` (or `npm run pm2:start`)  
- Reload after deploy: `npm run deploy:pm2` or `pm2 restart ticket_system_v3 --update-env`  
- See repository **`DEPLOY_NGINX.md`**, **`DEPLOY_NGINX_WINDOWS.md`**, or **`DEPLOY_CPANEL.md`** for host-specific steps.  

---

## 5) Customer user guide  

### 5.1 First steps  

1. Open **`/signin`** (or **`/signup`** if self-registration is enabled).  
2. Use the account your organization provided, or register per policy.  

### 5.2 Submit a ticket  

1. Go to **`/tickets/new`**.  
2. Complete **department / business unit**, **name**, and **issue** description.  
3. If you use **Google**, emails for resolution/verification go to your **Google address**. If you use a **portal** account, notification email follows your **registered work email** (optional override only when it matches your portal email).  
4. Submit; track from **`/my-tickets`**.  

### 5.3 Track and participate  

- Open a ticket from the list or a shared link.  
- Read the **activity timeline** and **conversation** thread.  
- If **new requests are blocked** because a **resolved** ticket awaits your **confirmation and rating**, open the **notification** or the linked **verification** page and complete the steps.  

### 5.4 Resolution, verification, and rating  

1. When staff marks the ticket **Resolved**, you may receive email with verify / reject links.  
2. In the portal, complete **verification** and **star rating / feedback** when prompted.  
3. Until mandatory steps are done, **creating another ticket** may be disabled **policy**.  

### 5.5 Ticket statuses (customer view)  

| Status | Meaning (plain language) |
|--------|---------------------------|
| Open | Received; queued / triaged. |
| In progress | Actively worked. |
| Pending info | Waiting on information (implementation may vary). |
| Escalated | Elevated for leadership or specialized handling. |
| Resolved | Solution delivered; you should verify and rate. |
| Closed | Closed after confirmation / feedback per policy. |

### 5.6 My account  

From **`/customer/profile`** or account entry points, update profile where allowed. **Security** changes (username, email, password) may sign you out and require a fresh sign-in.  

---

## 6) Staff & personnel guide  

### 6.1 Daily routine  

1. Sign in at **`/signin`**.  
2. Open **`/agent`** — orchestration board, kanban, and assigned ticket access.  
3. Review **`/insights`** for personal or team KPI visibility as granted.  

### 6.2 Working a ticket  

1. Confirm assignment and priority (**set priority** if still **UNSET** — otherwise board/API may block **In progress**).  
2. Update status honestly (drag-and-drop where enabled).  
3. Use **request more information** per policy (may log activity **without** forcing “pending info” status depending on configuration).  
4. Resolve with clear **resolution notes**; customer receives email to **verify**.  

### 6.3 KPI / task hygiene  

- Complete checklist items only where you are the assignee (when restricted).  
- Respect recurrence boundaries (daily / weekly / monthly cycles).  

---

## 7) Admin & SuperAdmin guide  

### 7.1 Oversight  

- **`/`** — Operational dashboard (role-dependent).  
- **`/admin/personnel`** — Personnel registry and assignment readiness.  
- **`/admin/manual-assignment`** — Assignment board where configured.  
- **`/admin/escalation-triggers`** — Priority-linked escalation behavior.  
- **`/reports`** — Reporting views as implemented.  

### 7.2 SLA sweep  

- **`POST /api/sla/sweep`** (secured; Admin context) — scans for SLA breaches and escalates/logs per policy.  

### 7.3 Accounts  

- **`/admin/account-management`** — Portal account administration where deployed.  

---

## 8) Account security (My Account)  

Staff typically use **`/admin/account`**.  

### Change username  

1. Security tab → new username, current password → **Update username**.  
2. You are signed out; sign in with the new username.  
3. Rules: length and character constraints shown in UI.  

### Change email / password  

Similar pattern: confirm current password; after success, **sign in again** with new credentials.  

### Account requests  

Suspension or deletion requests may be submitted for admin review.  

---

## 9) Troubleshooting  

| Symptom | What to try |
|---------|-------------|
| Cannot sign in | Verify credentials, caps lock; try SSO status; confirm account active. |
| “Forbidden” or missing menu | Your **role** may not include that feature — contact Admin. |
| Cannot create new ticket | Complete **pending resolved** verification/rating on existing ticket. |
| Email link expired / invalid | Request staff to re-send resolution flow or open ticket in portal. |
| Cannot move ticket to In progress | Set **priority** above **Set Priority Level (UNSET)**. |
| Database / deploy errors | Check **`DATABASE_URL`**, run Prisma migrate or push, rebuild, restart PM2. |

---

## 10) Quick reference — URLs  

| Path | Description |
|------|-------------|
| `/signin` | Sign in |
| `/signup` | Self-registration (if enabled) |
| `/` | Role-aware home |
| `/tickets/new` | New ticket |
| `/my-tickets` | Customer ticket list |
| `/tickets/[id]` | Ticket detail |
| `/tickets/[id]/verification` | Resolution verification |
| `/tickets/[id]/rate` | Rating / feedback |
| `/agent` | Staff board / queue |
| `/agent/tickets/[id]` | Staff ticket workspace |
| `/insights` | KPI / insights |
| `/process` | Process / lifecycle info |
| `/reports` | Reports |
| `/admin/personnel` | Personnel admin |
| `/admin/account` | Account & security |

---

*End of document.*  

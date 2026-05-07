# Ticket System v3

General-purpose ticketing system with:

- Frontend: ReactJS + Tailwind CSS (Next.js App Router)
- Backend: Node.js (Next.js Route Handlers)
- Database: PostgreSQL + Prisma
- Auth: SSO-ready OIDC login with role-based access control

## Roles

- `Admin`: full access, including KPI and SLA sweep endpoints
- `Agent`: queue handling, assignment, lifecycle transitions
- `Customer`: create/view own tickets, reply, validate resolution, leave feedback

## SSO Integration

Authentication is implemented with NextAuth and supports:

- Corporate OIDC SSO via `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`
- Local credentials login for development fallback (`/signin`)

Role resolution order:

1. Role claims from SSO profile (`role`, `roles`, `groups`)
2. Email mapping from `ADMIN_EMAILS` / `AGENT_EMAILS`
3. Default role: `Customer`

## SLA Logic

- SLA due timestamps are assigned at ticket creation based on priority policies.
- KPI API calculates SLA compliance metrics.
- Automated SLA sweep endpoint escalates breached unresolved tickets:
  - `POST /api/sla/sweep` (Admin only)
  - Escalation type set to `HIERARCHICAL`
  - Activity logged to the ticket timeline

## Setup

1. Copy `.env.example` to `.env`
2. Fill in the values
3. Start PostgreSQL
4. Apply schema + seed
5. Start app

```bash
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Production Deploy (cPanel)

For cPanel deployment (Node.js App), use the dedicated guide:

- `DEPLOY_CPANEL.md`

## Production Deploy (Nginx + PM2)

For VPS/cloud deployment with Nginx reverse proxy:

- `DEPLOY_NGINX.md`
- `DEPLOY_NGINX_WINDOWS.md` (Windows Server)

## Diagrams & flowcharts

- **`docs/flowcharts/`** — main system flowchart (**`.svg` / `.png`** downloadable; **`.mmd`** Mermaid source). Regenerate: `npm run docs:flowchart`. See **`docs/flowcharts/README-LUCIDCHART.md`** for using the chart in **Lucidchart**.

## User Documentation

- **`docs/Ticket_System_v3_Manual.pdf`** — downloadable project rundown + user manual (regenerate: `npm run docs:pdf`)
- `docs/TICKET_SYSTEM_V3_COMPLETE_MANUAL.md` — source for the PDF
- `docs/USER_MANUAL.md`
- `docs/USER_MANUAL_CLIENT.md`
- `docs/USER_MANUAL_STAFF_SOP.md`

## Useful Routes

- `/signin` - login
- `/tickets/new` - submit ticket
- `/tickets/[id]` - customer ticket view
- `/agent` - agent queue
- `/insights` - KPI cockpit
- `/process` - lifecycle and flowchart

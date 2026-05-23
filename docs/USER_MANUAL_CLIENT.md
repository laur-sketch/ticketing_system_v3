# Ticket System v3 — Client User Guide

This guide is for **Customer** users who submit and track support requests.

## Welcome

After sign-in, you land on your **Dashboard** (`/`) with a kanban-style view of your tickets. The current customer portal is branded as **AGCTek Help Desk** and includes **Dashboard**, **Active Tickets**, **Knowledge Base**, and **Settings**.

## 1) Sign in

1. Open **`/signin`** (legacy URLs `/customer/signin` and `/customer/signup` redirect here).
2. Enter your username or email and password, or use **Google** if your organization enables it.
3. Self-registration is available at **`/signup`** when enabled by your administrator.

## 2) Portal navigation

| Area | Path | Purpose |
|------|------|---------|
| Dashboard | `/` | Home overview and ticket kanban |
| Active Tickets | `/my-tickets` | Full list of your requests |
| Knowledge Base | `/tickets/knowledge` | Help articles (expanding) |
| Settings | `/tickets/knowledge#settings` | Customer portal settings area |

Use dashboard actions or open **`/tickets/new`** directly to create a request. Use the **bell** icon for notifications (status changes, verification reminders). Use the **theme** toggle for light/dark mode.

## 3) Create a support ticket

1. Go to **`/tickets/new`** (or use the dashboard create-request action).
2. Complete the form: title, description, department/business unit, and contact details as shown.
3. Attach screenshots if useful. You can upload, paste, or drag image files; up to **15 screenshots**, **5MB each**.
4. Submit the ticket and note the **ticket number** for follow-up.

**Tips for faster resolution**

- Include steps to reproduce, expected vs actual result, and screenshots.
- Use a specific title (for example, “VPN fails after Windows update” instead of “IT issue”).

### When you cannot create a new ticket

If you have a **resolved** ticket that still needs **verification and rating**, new requests may be blocked until you finish that flow. The dashboard and notification panel link you to **`/tickets/[id]/verification`** (or the rating page). Complete verification first, then create new tickets.

## 4) Track ticket progress

1. Open **Active Tickets** (`/my-tickets`) or select a card on the dashboard.
2. Review **status**, assignee, and the **activity timeline**.
3. Reply in the ticket thread when support asks for more information.

Customer-facing columns on the dashboard group work roughly as:

- **Open** — Received and queued.
- **In progress** — Actively worked.
- **For confirmation** — Resolved; waiting for you to verify and rate.

## 5) Status meanings

| Status | Meaning |
|--------|---------|
| **Open** | Ticket received; not yet in active work. |
| **In progress** | Support is working on it. |
| **Pending info** | Waiting on information (from you or a third party). |
| **Transfer pending** | Support requested transfer or higher-level handling and is waiting for Admin/SuperAdmin approval. |
| **Resolved** | Solution delivered; verify and rate when prompted. |
| **Closed** | Closed after confirmation per policy. |

Staff may set **priority** (including **Set Priority Level** until triaged). You do not need to manage priority yourself.

## 6) Verify resolution and rate

When a ticket is **Resolved**:

1. Test the fix.
2. Open the **verification** page from email, notification, or the ticket (`/tickets/[id]/verification`).
3. Confirm outcome and submit a **star rating** (`/tickets/[id]/rate`).
4. If you rate **3 stars or below**, written feedback is required before the ticket can close.

Until mandatory verification is complete, **creating another ticket may be disabled**.

## 7) My account and security

Open **My Account** at **`/admin/account`**. Use **Profile** for your profile image and quick account details; use **Security** for credential and request workflows.

You can:

- Upload a **PNG/JPG/WEBP** profile image up to **10MB** and adjust its framing
- Change your **username** (requires current password)
- Change your **email** (requires current password)
- Change your **password**
- Submit **account suspension, deletion, or password reset** requests for admin review

**Important:** After username, email, or password changes, you are signed out and must sign in again.

Username rules (shown in the UI): typically 3–32 characters; letters, numbers, `.`, `_`, `-`; must be unique.

## 8) Common issues

### I cannot sign in

- Check username/email and password; ensure Caps Lock is off.
- If using Google sign-in, confirm Google authentication is available.
- Contact your administrator if the account is inactive.

### I do not see my ticket

- Refresh and check **Active Tickets** (`/my-tickets`).
- Confirm you are signed in with the same account used to submit the ticket.

### I cannot create a ticket

- Complete **verification and rating** on any resolved ticket that is still pending (see notification or dashboard banner).

### I cannot access staff pages

- Routes such as `/agent`, `/insights`, and most `/admin/*` pages are for **Personnel** and **Admin** roles only.

## 9) Best practices

- Use specific ticket titles and complete details in the first message.
- Respond quickly to support follow-up questions.
- Complete verification promptly so work can be closed and you can submit new requests.
- Keep profile and security settings up to date.

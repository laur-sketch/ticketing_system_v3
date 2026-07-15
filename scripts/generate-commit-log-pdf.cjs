/**
 * Build docs/Commit_History.pdf from git log (plain-language summaries).
 * Usage: node scripts/generate-commit-log-pdf.cjs
 */
const { execSync } = require("node:child_process");
const path = require("node:path");

/** Plain-language summary keyed by exact git subject line. */
const LAYMAN_BY_SUBJECT = {
  "Fix requestor intake lock scoping and pending confirmation modal lint.":
    "Fixed a bug where users could be blocked from submitting tickets because of someone else's open ticket. Also cleaned up the login confirmation popup code.",
  "Restore Task Board checkboxes for assigned sub-task operators.":
    "Brought back checkboxes on the task board so staff assigned to sub-tasks can mark work complete.",
  "Resolve duplicate agent rows for Task Board permissions.":
    "Fixed duplicate staff records that were breaking task board permissions.",
  "Show confirmation popup after login for pending tickets.":
    "After login, users see a popup if they have tickets waiting for their confirmation.",
  "Merge origin/main into dev.":
    "Merged the latest main-branch updates into the development branch.",
  "Resolve npm audit issues, fix ESLint failures, and hide non-actionable task board checkboxes.":
    "Fixed security warnings in software packages, code quality checks, and hid task board checkboxes that users could not use.",
  "Fix signup company loader lint rule.":
    "Fixed a code-quality issue on the sign-up page when loading company names.",
  "Merge branch 'dev' of https://github.com/laur-sketch/ticketing_system_v3 into dev":
    "Synced local development work with the shared development branch on GitHub.",
  "Merge local main commits into dev.":
    "Moved local main-branch work into the development branch.",
  "Block new tickets while an assigned ticket is still open.":
    "Users cannot submit a new request while they still have an open or in-progress ticket.",
  "Improve Windows deployment and resolve npm audit vulnerabilities.":
    "Made deployment easier on Windows and fixed known security issues in dependencies.",
  "Refine ticket detail light mode styling.":
    "Improved how ticket detail pages look in light (non-dark) mode.",
  "Format dashboard average response as hours and minutes.":
    "Dashboard now shows average response time as hours and minutes (for example, 2h 15m).",
  "Refine task metric pillar labels.":
    "Clarified the labels on task metrics and KPI charts.",
  "Point landing CTAs to sign in.":
    "Homepage buttons now send visitors to the sign-in page.",
  "Use dropdown for personnel request company.":
    "Staff submitting tickets now pick the target company from a dropdown.",
  "Add branded public landing page with theme support.":
    "Added a branded welcome page with light and dark theme support.",
  "Scope admin reporting and refine board tabs.":
    "Limited admin reports to the right companies and improved board tab navigation.",
  "Refine shared UI interactions and lint cleanup.":
    "Smoother clicks, menus, and interactions across the app, plus general code cleanup.",
  "Refine staff metrics and portal navigation.":
    "Improved how staff view their metrics and navigate the portal.",
  "Tighten customer portal layout with collapsible sidebar.":
    "Customer pages use space better; the sidebar can collapse on smaller screens.",
  "Redesign customer portal with AGCTEK branding and theme support.":
    "Refreshed the customer portal with AGCTEK branding and light/dark modes.",
  "Update insights tracker charts":
    "Updated the charts on the Insights and metrics page.",
  "Auto-close task details when a task is fully completed":
    "The task detail panel closes automatically when all sub-items are marked done.",
  "Improve mobile ticket detail layouts":
    "Ticket detail pages work better on phones and tablets.",
  "Add confirmation reminder sweep":
    "The system can send reminder emails for tickets still waiting on customer confirmation.",
  "Add board pagination and widen tracker title column":
    "Ticket boards show results in pages; the tracker table has more room for titles.",
  "Improve account security and task metrics workflows":
    "Stronger account security options and smoother task-metrics workflows.",
  "Refactor assignment boards to company dropdowns with role grouping.":
    "Assignment boards now use company dropdowns grouped by staff role.",
  "Use designated company assignments instead of agent teams on the task board.":
    "Task board assignments follow each person's designated company, not generic team membership.",
  "Hide HR and Gen Services from task assignment company groups.":
    "HR and Gen Services no longer appear in task assignment company lists.",
  "Add company drag dropdowns for task assignment on the task board.":
    "Added a drag-and-drop company picker when assigning tasks.",
  "Improve mobile ticket board layout and make ticket moves easier.":
    "Easier to move tickets between columns on mobile devices.",
  "Show assignee profile photos on ticket board cards when available.":
    "Ticket cards show the assigned person's profile photo when available.",
  "Flatten task board layout and reduce nested containers for more space.":
    "Task board uses a flatter layout with more room for content.",
  "Improve task board UX with compact cards, drawer subtasks, and detail modal.":
    "Task board got smaller cards, slide-out subtasks, and a popup detail view.",
  "Archive recurring task screenshots on rollover and improve mobile layout.":
    "Old screenshots from recurring tasks are archived when a new period starts; mobile layout improved.",
  "Improve notification polling and add API runcheck":
    "Notifications update more reliably; added a health check for the API.",
  "Add monitoring-specific CSV extended view and hide ticket CSV previews.":
    "Added an extended CSV view for monitoring metrics; hid raw CSV previews on tickets.",
  "Keep uptime and safe donuts for network and cybersecurity pillars.":
    "Network and cybersecurity charts keep uptime and safety donut charts visible.",
  "Switch User Support to average star ratings and refine extended metrics view.":
    "User Support metrics now use average star ratings; improved the extended metrics screen.",
  "Improve transfers, task metrics CSV view, and pillar incident display.":
    "Better ticket transfers, CSV export for task metrics, and incident charts by category.",
  "Improve task board workflows, ticket table ratings, and daily KPI cadence.":
    "Smoother task board workflows, ratings visible in ticket tables, and daily KPI tracking.",
  "Add quarterly cadence, preventive maintenance pillar, and task board improvements.":
    "Added quarterly KPI schedule, preventive maintenance category, and task board updates.",
  "Restore checkbox completion for task sub-items.":
    "Checkboxes for marking sub-task items complete work again.",
  "Add monitoring pillar and refine recurring task fields.":
    "Added a monitoring category for KPIs and improved recurring task form fields.",
  "Update task details and company board pagination.":
    "Updated task detail screens and added paging to the company board.",
  "Add task board sub-KPI assignment and before/after screenshots.":
    "Sub-KPIs can be assigned on the task board; staff can attach before/after screenshots.",
  "Remove OIDC SSO, require low-rating feedback, and refresh docs.":
    "Removed OIDC single sign-on; low ratings now require a comment; documentation updated.",
  "Import helpdesk CSV for Insights task metrics.":
    "Can import helpdesk spreadsheet data into Insights task metrics.",
  "Simplify company board layout and read-only ticket view.":
    "Cleaner company board layout; some users get a read-only ticket view.",
  "Add KPI daily imports, task metrics UX, transfer workflow, and personnel filters.":
    "Daily KPI imports, better task metrics screens, ticket transfer flow, and staff filters.",
  "Fix cyber/network task metrics and add KPI sheet import.":
    "Fixed cybersecurity and network metrics; can import KPI data from spreadsheets.",
  "Ship StoicOps UI, insights task metrics with KPI snapshots, IT project kanban.":
    "Launched the main operations UI with task metrics, KPI history snapshots, and an IT project board.",
  "fix(pm2): use string split for env file lines in ecosystem.config.cjs":
    "Fixed how the server reads environment settings when starting with PM2.",
  "Orchestration UI: company board full width; KPI task assignment lanes paginated (6/page); personnel/roles updates":
    "Company board uses full screen width; KPI assignments show six per page; staff role updates.",
  "Company board: pagination (5 per page) and five-column row layout":
    "Company board shows five tickets per page in a five-column layout.",
  "Mobile responsive shell, customer nav drawer, pointer-based Kanban drag":
    "App works on mobile; customers get a slide-out menu; drag tickets with mouse or touch.",
  "Personnel registry pagination, assignment board lanes pagination, saturated assignment colors":
    "Staff list and assignment lanes are paginated; brighter color tags for assignees.",
  "feat: intake lock for customers and personnel, staff assignment colors, Vitest":
    "Customers and staff cannot open duplicate tickets while one is active; colored staff tags; added automated tests.",
  "Insights tabs, metrics charts, KPI board filters, NextAuth env bootstrap":
    "New Insights tabs and charts, KPI filters, and improved login configuration.",
  "Staff roster sync, SuperAdmin staff creation, and roster backfill":
    "Staff list stays in sync; SuperAdmins can create staff accounts; filled in missing roster data.",
  "Allow password sign-in for self-signup customer accounts":
    "Customers who registered with a username and password can sign in that way, not only with Google.",
  "Manual assignment: Apply/Clear SBU filter and strict personnel by designation":
    "Ticket assignment can filter by company; only staff designated for that company appear.",
  "Personnel dashboard, admin company board scoping, signin reset request":
    "Staff dashboard, admins see only their company's board, and password reset requests on sign-in.",
  "Stop tracking cloudflared.exe; vendored download (>50MB)":
    "Removed a large tunnel program from version control because it was too big for GitHub.",
  "Initial commit: Stoic Ticket System v3":
    "First version of the Ticket System v3 project.",
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toLaymanTerms(subject) {
  const exact = LAYMAN_BY_SUBJECT[subject.trim()];
  if (exact) return exact;

  let text = subject.trim();
  text = text.replace(/^feat:\s*/i, "");
  text = text.replace(/^fix\([^)]+\):\s*/i, "");
  text = text.replace(/^fix:\s*/i, "");

  const replacements = [
    [/\bmerge\b/gi, "combined branches"],
    [/\brefactor\b/gi, "reorganized"],
    [/\bUI\b/g, "user interface"],
    [/\bUX\b/g, "user experience"],
    [/\bKPI\b/g, "performance metric"],
    [/\bKPIs\b/g, "performance metrics"],
    [/\bCSV\b/g, "spreadsheet"],
    [/\bSSO\b/g, "single sign-on"],
    [/\bOIDC\b/g, "OpenID Connect login"],
    [/\bPM2\b/g, "server process manager"],
    [/\bESLint\b/g, "code quality checker"],
    [/\bnpm audit\b/gi, "security package scan"],
    [/\bKanban\b/gi, "board"],
    [/\bpagination\b/gi, "page-by-page browsing"],
    [/\bintake lock\b/gi, "rule that blocks duplicate ticket submissions"],
    [/\blint\b/gi, "code quality"],
    [/\bVitest\b/g, "automated tests"],
    [/\bNextAuth\b/g, "login system"],
    [/\bSBU\b/g, "company unit"],
  ];
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  if (!/[.!?]$/.test(text)) text += ".";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function loadCommits() {
  const raw = execSync(
    'git log --format="%H|%h|%an|%ae|%ad|%D|%s" --date=format:"%Y-%m-%d %H:%M" --all',
    { encoding: "utf8", cwd: path.join(__dirname, "..") },
  );
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, short, author, email, date, refs, ...subjectParts] = line.split("|");
      const subject = subjectParts.join("|");
      return {
        hash,
        short,
        author,
        email,
        date,
        refs: refs.trim(),
        subject,
        layman: toLaymanTerms(subject),
      };
    });
}

function branchSummary() {
  const raw = execSync("git branch -a -v", {
    encoding: "utf8",
    cwd: path.join(__dirname, ".."),
  });
  return raw.trim();
}

function buildHtml(commits) {
  const generatedAt = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const rows = commits
    .map(
      (c, index) => `
      <tr>
        <td class="num">${index + 1}</td>
        <td class="mono">${escapeHtml(c.short)}</td>
        <td>${escapeHtml(c.date)}</td>
        <td>${escapeHtml(c.author)}</td>
        <td class="subject">${escapeHtml(c.layman)}</td>
        <td class="refs">${escapeHtml(c.refs || "—")}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Ticket System v3 — Commit History</title>
    <style>
      @page { size: A4 landscape; margin: 14mm 12mm; }
      body {
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
        font-size: 9.5pt;
        line-height: 1.4;
        color: #111827;
        margin: 0;
      }
      h1 {
        font-size: 20pt;
        margin: 0 0 0.15em;
        color: #0f172a;
      }
      .meta {
        color: #475569;
        font-size: 9pt;
        margin-bottom: 1em;
      }
      .meta strong { color: #0f172a; }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      th, td {
        border: 1px solid #cbd5e1;
        padding: 5px 6px;
        vertical-align: top;
        word-wrap: break-word;
      }
      th {
        background: #f1f5f9;
        font-size: 8.5pt;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #334155;
      }
      tr:nth-child(even) td { background: #f8fafc; }
      .num { width: 3%; text-align: right; color: #64748b; }
      .mono { width: 7%; font-family: Consolas, "Courier New", monospace; font-size: 8.5pt; }
      .subject { width: 46%; }
      .refs { width: 18%; font-size: 8pt; color: #475569; }
      .branches {
        margin-top: 1.25em;
        padding: 10px 12px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-family: Consolas, "Courier New", monospace;
        font-size: 8pt;
        white-space: pre-wrap;
      }
      h2 {
        font-size: 11pt;
        margin: 1.25em 0 0.4em;
        color: #0f172a;
      }
    </style>
  </head>
  <body>
    <h1>Ticket System v3 — Commit History</h1>
    <p class="meta">
      Repository: <strong>laur-sketch/ticketing_system_v3</strong><br>
      Generated: <strong>${escapeHtml(generatedAt)}</strong><br>
      Total commits: <strong>${commits.length}</strong> (all branches, newest first)<br>
      Summaries are written in plain language for non-technical readers.
    </p>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Hash</th>
          <th>Date</th>
          <th>Author</th>
          <th>What changed (plain language)</th>
          <th>Refs</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <h2>Branch tips</h2>
    <div class="branches">${escapeHtml(branchSummary())}</div>
  </body>
</html>`;
}

async function main() {
  const puppeteer = await import("puppeteer");
  const root = path.join(__dirname, "..");
  const pdfPath = path.join(root, "docs", "Commit_History.pdf");
  const commits = loadCommits();
  const html = buildHtml(commits);

  const browser = await puppeteer.default.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      landscape: true,
      margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }

  console.log(`Wrote ${commits.length} commits to: ${pdfPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

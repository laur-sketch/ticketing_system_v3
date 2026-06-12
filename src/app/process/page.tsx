const flow = `
[Start]
   ↓
[Submit Ticket]
   ↓
[Log Ticket & Generate ID]
   ↓
[Categorize & Prioritize]
   ↓
[Assign Ticket]
   ↓
[Agent Reviews]
   ↓
[Need More Info?] ── Yes ──> [Request Info] ──┐
        │                                     │
        No                                    │
        ↓                                     │
[Work on Issue] <──────────────────────────────┘
   ↓
[Escalation Needed?] ── Yes ──> [Escalate]
        │
        No
        ↓
[Resolve Ticket]
   ↓
[User Confirms?] ── No ──> [Reopen Ticket]
        │
        Yes
        ↓
[Close Ticket]
   ↓
[End]
`.trim();

const lifecycle = [
  "Ticket creation with title, description, category, priority, and contact details.",
  "Automatic logging: Ticket ID, OPEN status, timestamps, SLA targets from priority policy.",
  "Categorization routes to IT, HR, Finance, Operations, or General queues with matching teams.",
  "Priorities Low → Urgent map to seeded first-response and resolution hour budgets.",
  "Assignment supports auto-routing to the lightest-loaded agent on the mapped team plus manual overrides.",
  "Acknowledgment surfaces SLA due dates on the customer ticket page immediately after creation.",
  "Investigation uses threaded USER/AGENT messages and a full activity trail for diagnosis.",
  "Resolution captures notes and moves the ticket to For confirmation pending customer validation.",
  "Escalation captures functional vs hierarchical reasons when complexity or SLA risk spikes.",
  "User validation can close the ticket or reopen it, incrementing reopen analytics.",
  "Closure locks the record, then optional CSAT, NPS, and CES feedback feeds the KPI layer.",
];

export default function ProcessPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-10 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">Process & flow</h1>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">End-to-end lifecycle</h2>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
          {lifecycle.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Flowchart</h2>
        <pre className="overflow-x-auto rounded-2xl border border-zinc-200 bg-zinc-950 p-4 text-xs leading-relaxed text-orange-100 shadow-inner dark:border-zinc-800">
          {flow}
        </pre>
      </section>
    </main>
  );
}

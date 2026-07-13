"use client";

import type { EscalationTrigger, TicketPriority } from "@prisma/client/primary";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BRAND_TITLE } from "@/lib/brand";

type Trigger = Pick<
  EscalationTrigger,
  "id" | "priority" | "enabled" | "notifyAdmin" | "notifyTarget"
>;
type NotifyTarget = "NONE" | "ADMIN" | "SUPERADMIN" | "ADMIN_AND_SUPERADMIN";
const notifyOptions: Array<{ value: NotifyTarget; label: string }> = [
  { value: "NONE", label: "No Notification" },
  { value: "ADMIN", label: "Admin" },
  { value: "SUPERADMIN", label: "SuperAdmin" },
  { value: "ADMIN_AND_SUPERADMIN", label: "Admin + SuperAdmin" },
];

export function EscalationTriggersClient({
  initialTriggers,
}: {
  initialTriggers: Trigger[];
}) {
  const [triggers, setTriggers] = useState<Trigger[]>(initialTriggers);
  const [status, setStatus] = useState<string | null>(null);
  const [view, setView] = useState<"cards" | "table">("table");

  async function load() {
    const res = await fetch("/api/admin/triggers");
    if (!res.ok) return;
    setTriggers(await res.json());
  }

  async function save(priority: TicketPriority, patch: Partial<Trigger>) {
    const current = triggers.find((t) => t.priority === priority);
    if (!current) return;
    const payload = {
      priority,
      enabled: patch.enabled ?? current.enabled,
      notifyTarget: patch.notifyTarget ?? current.notifyTarget ?? (current.notifyAdmin ? "ADMIN" : "NONE"),
    };
    const res = await fetch("/api/admin/triggers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setStatus("Could not save trigger settings.");
      return;
    }
    setStatus("Trigger settings updated.");
    await load();
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-10">
      <header className="panel p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400/95">
              {BRAND_TITLE} · Priority alerts
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">Priority alerts</h1>
          </div>
          <div className="hidden items-center justify-end sm:flex">
            <Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
              <TabsList className="rounded-full border border-zinc-300 bg-zinc-100 p-1 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                <TabsTrigger value="cards" className="rounded-full px-3 py-1.5 text-xs data-[state=active]:bg-zinc-900 data-[state=active]:text-white dark:data-[state=active]:bg-white dark:data-[state=active]:text-zinc-900">
                  Cards
                </TabsTrigger>
                <TabsTrigger value="table" className="rounded-full px-3 py-1.5 text-xs data-[state=active]:bg-zinc-900 data-[state=active]:text-white dark:data-[state=active]:bg-white dark:data-[state=active]:text-zinc-900">
                  Table
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </header>

      <section className={`${view === "table" ? "sm:hidden" : ""} grid gap-4 sm:grid-cols-2 xl:grid-cols-4`}>
        {triggers.map((t) => (
          <article key={t.id} className="rounded-2xl border border-zinc-200/80 bg-white/95 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t.priority}</p>
            <div className="mt-3 grid gap-2">
              <Button
                className="h-9 rounded-full"
                variant={t.enabled ? "primary" : "outline"}
                onClick={() => void save(t.priority, { enabled: !t.enabled })}
              >
                {t.enabled ? "Enabled" : "Disabled"}
              </Button>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">Notify on</span>
                <select
                  value={(t.notifyTarget ?? (t.notifyAdmin ? "ADMIN" : "NONE")) as NotifyTarget}
                  disabled={!t.enabled}
                  onChange={(e) => void save(t.priority, { notifyTarget: e.target.value as NotifyTarget })}
                  className="h-9 rounded-full border border-zinc-300 bg-zinc-50 px-3 text-xs font-medium text-zinc-900 outline-none transition focus:border-orange-500/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  {notifyOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </article>
        ))}
      </section>

      <section
        className={`${view === "cards" ? "hidden sm:hidden" : "hidden sm:block"} w-full overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 shadow-sm dark:border-zinc-800 dark:bg-zinc-900`}
      >
        <table className="w-full table-fixed divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead className="bg-zinc-100 text-left text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Trigger Enabled</th>
              <th className="px-4 py-3">Notify on</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {triggers.map((t) => (
              <tr key={t.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/40">
                <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">{t.priority}</td>
                <td className="px-4 py-3">
                  <Button
                    className="min-w-[84px]"
                    variant={t.enabled ? "primary" : "outline"}
                    onClick={() => void save(t.priority, { enabled: !t.enabled })}
                  >
                    {t.enabled ? "Enabled" : "Disabled"}
                  </Button>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={(t.notifyTarget ?? (t.notifyAdmin ? "ADMIN" : "NONE")) as NotifyTarget}
                    disabled={!t.enabled}
                    onChange={(e) => void save(t.priority, { notifyTarget: e.target.value as NotifyTarget })}
                    className="w-[220px] max-w-full rounded-full border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-900 outline-none transition focus:border-orange-500/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    {notifyOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {status ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-100">
          {status}
        </p>
      ) : null}
      <p className="text-xs text-zinc-600 dark:text-zinc-500">
        Suggested policy: keep URGENT enabled and set Notify on to Admin + SuperAdmin for highest-priority visibility.
      </p>
    </main>
  );
}

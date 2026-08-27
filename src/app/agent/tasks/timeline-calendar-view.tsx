"use client";

import { useState } from "react";
import { CalendarDays, PartyPopper } from "lucide-react";
import { cn } from "@/lib/cn";
import { EventManager } from "@/components/ui/event-manager";
import { KpiTimelineCalendar } from "./kpi-timeline-calendar";

type CalendarSection = "tasks" | "events";

const DEFAULT_EVENT_STORAGE_KEY = "agent-task-calendar:events:v1";

export function TimelineCalendarView({
  companyFilterTeamId = null,
  assignedAgentFilterId = null,
  searchQuery = "",
  categoryFilter = "all",
  frequencyFilter = "all",
  eventStorageKey,
}: {
  companyFilterTeamId?: string | null;
  assignedAgentFilterId?: string | null;
  /** Free-text search (matched against task title). */
  searchQuery?: string;
  /** Task Board category filter: all | task | project | field. */
  categoryFilter?: string;
  /** Frequency filter: all or a TASK_FREQUENCY_DONUT_KEYS value (ONE-OFF, DAILY, ...). */
  frequencyFilter?: string;
  /** localStorage key for the Events section; scope per user when possible. */
  eventStorageKey?: string;
} = {}) {
  const [section, setSection] = useState<CalendarSection>("tasks");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Timeline calendar sections"
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white p-1 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-900"
        >
          <button
            type="button"
            role="tab"
            aria-selected={section === "tasks"}
            onClick={() => setSection("tasks")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors",
              section === "tasks"
                ? "bg-orange-600 text-white shadow-sm"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
            )}
          >
            <CalendarDays className="size-3.5" aria-hidden />
            Task Calendar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === "events"}
            onClick={() => setSection("events")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors",
              section === "events"
                ? "bg-orange-600 text-white shadow-sm"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
            )}
          >
            <PartyPopper className="size-3.5" aria-hidden />
            Events
          </button>
        </div>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
          {section === "tasks"
            ? "KPI tasks placed on their target date."
            : "Personal events are saved per user in this browser."}
        </p>
      </div>

      {section === "tasks" ? (
        <KpiTimelineCalendar
          companyFilterTeamId={companyFilterTeamId}
          assignedAgentFilterId={assignedAgentFilterId}
          searchQuery={searchQuery}
          categoryFilter={categoryFilter}
          frequencyFilter={frequencyFilter}
        />
      ) : (
        <EventManager
          storageKey={eventStorageKey ?? DEFAULT_EVENT_STORAGE_KEY}
          className="rounded-xl border border-zinc-200 bg-white p-3 shadow-[0_8px_28px_rgba(0,0,0,0.06)] sm:p-5 dark:border-zinc-800 dark:bg-surface dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
        />
      )}
    </div>
  );
}

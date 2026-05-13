import { cn } from "@/lib/cn";
import { personnelAssignmentCssVars } from "@/lib/personnel-assignment-colors";

function initialsFromAgentName(name: string | null): string {
  const t = name?.trim();
  if (!t) return "—";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

type Props = {
  agentName: string | null;
  assigneeColorKey?: string | null;
  className?: string;
};

/**
 * Compact assignee chip for ticket cards — uses registry color on the circle when set.
 * Colors follow saturated assignment tokens via CSS variables in `globals.css`.
 */
export function AssigneeInitialsBadge({ agentName, assigneeColorKey, className }: Props) {
  const vars = personnelAssignmentCssVars(assigneeColorKey);
  const text = initialsFromAgentName(agentName);
  return (
    <div
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-1 ring-inset ring-black/15 dark:ring-white/15",
        !vars && "bg-zinc-800 text-zinc-300",
        className,
      )}
      style={
        vars
          ? {
              backgroundColor: vars.bg,
              color: vars.fg,
            }
          : undefined
      }
      title={agentName?.trim() || "Unassigned"}
    >
      {text}
    </div>
  );
}

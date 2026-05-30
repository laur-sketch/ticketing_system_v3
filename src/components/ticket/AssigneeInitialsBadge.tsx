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
  profileImage?: string | null;
  profileImageZoom?: number | null;
  profileImagePosX?: number | null;
  profileImagePosY?: number | null;
  className?: string;
};

/**
 * Compact assignee chip for ticket cards — uses registry color on the circle when set.
 * Colors follow saturated assignment tokens via CSS variables in `globals.css`.
 */
export function AssigneeInitialsBadge({
  agentName,
  assigneeColorKey,
  profileImage,
  profileImageZoom,
  profileImagePosX,
  profileImagePosY,
  className,
}: Props) {
  const vars = personnelAssignmentCssVars(assigneeColorKey);
  const text = initialsFromAgentName(agentName);
  const title = agentName?.trim() || "Unassigned";
  if (profileImage) {
    return (
      <div
        className={cn(
          "size-6 shrink-0 overflow-hidden rounded-full bg-zinc-200 ring-1 ring-inset ring-black/15 dark:bg-zinc-800 dark:ring-white/15",
          className,
        )}
        title={title}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={profileImage}
          alt={title}
          className="h-full w-full object-cover"
          style={{
            objectPosition: `${profileImagePosX ?? 50}% ${profileImagePosY ?? 50}%`,
            transform: `scale(${profileImageZoom ?? 1})`,
            transformOrigin: "center",
          }}
        />
      </div>
    );
  }
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
      title={title}
    >
      {text}
    </div>
  );
}

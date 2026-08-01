import type { ReactNode } from "react";
import { personnelAssigneeHighlightStyleFromKey } from "@/lib/personnel-assignment-colors";

type Props = {
  /** Stored color: hex (`#rrggbb`) or legacy named key (RED, BLUE, …). */
  assigneeColorKey?: string | null;
  className?: string;
  children: ReactNode;
};

/**
 * Wash + inner frame when the assigned staff member has a registry color tag.
 * Tint follows saturated assignment colors via CSS variables.
 */
export function AssigneeColorHighlight({ assigneeColorKey, className, children }: Props) {
  return (
    <div className={className} style={personnelAssigneeHighlightStyleFromKey(assigneeColorKey)}>
      {children}
    </div>
  );
}

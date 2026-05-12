"use client";

import type { ReactNode } from "react";
import {
  personnelAssigneeHighlightStyle,
  personnelAssignmentHex,
} from "@/lib/personnel-assignment-colors";

type Props = {
  /** Stored key e.g. RED, BLUE — from portal `staffAssignmentColor`. */
  assigneeColorKey?: string | null;
  className?: string;
  children: ReactNode;
};

/**
 * Wash + inner frame when the assigned staff member has a registry color tag.
 */
export function AssigneeColorHighlight({ assigneeColorKey, className, children }: Props) {
  const hex = personnelAssignmentHex(assigneeColorKey);
  return (
    <div className={className} style={personnelAssigneeHighlightStyle(hex)}>
      {children}
    </div>
  );
}

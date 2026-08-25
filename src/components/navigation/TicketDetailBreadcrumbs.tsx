"use client";

import { SetBreadcrumbs } from "@/components/navigation/BreadcrumbProvider";
import type { BreadcrumbSegment } from "@/lib/breadcrumbs";

export function TicketDetailBreadcrumbs({
  ticketNumber,
  title,
  ticketId,
  context = "assignment",
}: {
  ticketNumber: string;
  title?: string | null;
  ticketId: string;
  context?: "assignment" | "approval";
}) {
  const segments: BreadcrumbSegment[] =
    context === "approval"
      ? [
          { label: "Home", href: "/" },
          { label: "My Work", href: "/agent" },
          { label: "Needs My Approval", href: "/agent/approvals" },
          { label: ticketNumber || title || ticketId },
        ]
      : [
          { label: "Home", href: "/" },
          { label: "My Work", href: "/agent" },
          { label: "Assignment Board", href: "/agent" },
          { label: ticketNumber || title || ticketId },
        ];

  return <SetBreadcrumbs segments={segments} />;
}

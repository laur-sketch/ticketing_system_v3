"use client";

import { SetBreadcrumbs } from "@/components/navigation/BreadcrumbProvider";
import type { BreadcrumbSegment } from "@/lib/breadcrumbs";

export function TicketDetailBreadcrumbs({
  ticketNumber,
  title,
  ticketId,
}: {
  ticketNumber: string;
  title?: string | null;
  ticketId: string;
}) {
  const segments: BreadcrumbSegment[] = [
    { label: "Home", href: "/" },
    { label: "My Work", href: "/agent" },
    { label: "My Assigned", href: "/agent" },
    { label: ticketNumber || title || ticketId },
  ];

  return <SetBreadcrumbs segments={segments} />;
}

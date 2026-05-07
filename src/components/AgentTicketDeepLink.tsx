"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

type Props = {
  ticketId: string;
  className?: string;
  children: ReactNode;
  onNavigate?: () => void;
};

/** Preserves current path in ?returnTo so ticket view can close back to notifications (etc.), not always the board. */
export function AgentTicketDeepLink({ ticketId, className, children, onNavigate }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const returnTo = encodeURIComponent(pathname + (qs ? `?${qs}` : ""));
  return (
    <Link
      href={`/agent/tickets/${ticketId}?returnTo=${returnTo}`}
      className={className}
      onClick={onNavigate}
    >
      {children}
    </Link>
  );
}

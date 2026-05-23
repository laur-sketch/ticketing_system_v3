"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

type Props = {
  ticketId: string;
  className?: string;
  children: ReactNode;
  onNavigate?: () => void;
};

/** Preserves current path in ?returnTo so ticket view can close back to notifications (etc.), not always the board. */
export function AgentTicketDeepLink({ ticketId, className, children, onNavigate }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const returnTo = encodeURIComponent(pathname + (qs ? `?${qs}` : ""));
  const href = `/agent/tickets/${ticketId}?returnTo=${returnTo}`;
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onNavigate?.();
        router.push(href);
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  );
}

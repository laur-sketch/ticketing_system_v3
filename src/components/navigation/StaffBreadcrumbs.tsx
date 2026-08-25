"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { buildStaffBreadcrumbs } from "@/lib/breadcrumbs";
import { useBreadcrumbContext } from "@/components/navigation/BreadcrumbProvider";
import { cn } from "@/lib/cn";

function StaffBreadcrumbsInner({ className }: { className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { override } = useBreadcrumbContext();

  const segments = useMemo(() => {
    if (override?.length) return override;
    return buildStaffBreadcrumbs(pathname, searchParams);
  }, [override, pathname, searchParams]);

  if (pathname === "/" || segments.length <= 1) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex min-w-0 items-center gap-1 overflow-x-auto border-b border-zinc-200 bg-white/80 px-3 py-2 text-xs backdrop-blur-sm sm:px-4 dark:border-zinc-800 dark:bg-zinc-950/80",
        className,
      )}
    >
      <ol className="flex min-w-0 items-center gap-1 whitespace-nowrap">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          return (
            <li key={`${segment.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 ? (
                <ChevronRight className="size-3 shrink-0 text-zinc-400" aria-hidden />
              ) : null}
              {segment.href && !isLast ? (
                <Link
                  href={segment.href}
                  className="truncate font-medium text-zinc-600 transition hover:text-orange-700 dark:text-zinc-400 dark:hover:text-orange-300"
                >
                  {segment.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    "truncate font-semibold",
                    isLast ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400",
                  )}
                  aria-current={isLast ? "page" : undefined}
                >
                  {segment.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StaffBreadcrumbs(props: { className?: string }) {
  return (
    <Suspense fallback={null}>
      <StaffBreadcrumbsInner {...props} />
    </Suspense>
  );
}

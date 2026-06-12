import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import {
  BRAND_TAGLINE_CUSTOMER,
  BRAND_TAGLINE_CUSTOMER_SUB,
  BRAND_TAGLINE_STAFF,
  BRAND_TITLE,
} from "@/lib/brand";

export type BrandLockupVariant =
  | "staff-sidebar-expanded"
  | "staff-sidebar-collapsed"
  | "customer-sidebar"
  /** Customer portal top bar — logo + title */
  | "customer-topnav"
  /** Landing marketing header */
  | "landing-header"
  /** Auth desktop header */
  | "auth-header"
  /** Auth mobile hero block */
  | "auth-mobile"
  /** Staff app top bar — compact mark beside search */
  | "staff-header-compact";

type Props = {
  variant: BrandLockupVariant;
  /** When set, entire lockup links here (usually `/` or `/signin`) */
  href?: string;
  className?: string;
};

export function BrandLockup({ variant, href, className }: Props) {
  const inner = lockupInner(variant);
  const wrapClass = `min-w-0 ${className ?? ""}`.trim();

  if (href) {
    return (
      <Link href={href} className={`inline-flex ${wrapClass}`}>
        {inner}
      </Link>
    );
  }

  return <div className={`inline-flex ${wrapClass}`}>{inner}</div>;
}

function lockupInner(variant: BrandLockupVariant) {
  switch (variant) {
    case "staff-sidebar-collapsed":
      return <BrandLogo className="mx-auto size-16 object-contain" compact />;
    case "staff-sidebar-expanded":
      return (
        <div className="flex gap-3">
          <BrandLogo className="size-[5.25rem] shrink-0 object-contain object-left" />
          <div className="min-w-0 flex-1 pt-1">
            <p className="text-[13px] font-bold leading-snug tracking-[0.02em] text-zinc-900 dark:text-zinc-100">{BRAND_TITLE}</p>
            <p className="mt-1.5 text-[10px] font-semibold uppercase leading-tight tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
              {BRAND_TAGLINE_STAFF}
            </p>
          </div>
        </div>
      );
    case "customer-sidebar":
      return (
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandLogo className="h-8 w-auto max-w-[5.5rem] shrink-0 object-contain object-left" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-bold leading-snug tracking-[0.01em] text-zinc-100">{BRAND_TITLE}</p>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-orange-400/95">
              {BRAND_TAGLINE_CUSTOMER}
            </p>
            <p className="text-[9px] font-medium leading-tight text-zinc-400">{BRAND_TAGLINE_CUSTOMER_SUB}</p>
          </div>
        </div>
      );
    case "customer-topnav":
      return (
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <BrandLogo className="h-9 w-auto max-w-[min(160px,55vw)] shrink-0 object-contain object-left sm:h-10" />
          <span className="min-w-0 truncate text-xs font-bold tracking-[0.04em] text-zinc-900 sm:text-sm dark:text-zinc-100">
            {BRAND_TITLE}
          </span>
        </div>
      );
    case "landing-header":
      return (
        <div className="flex items-center gap-3 md:gap-4">
          <BrandLogo className="h-14 w-auto max-w-[240px]" />
          <span className="text-sm font-bold tracking-[0.05em] text-zinc-900 dark:text-zinc-100 md:text-base">{BRAND_TITLE}</span>
        </div>
      );
    case "auth-header":
      return (
        <div className="inline-flex items-center gap-3">
          <BrandLogo className="h-14 w-auto max-w-[220px]" />
          <span className="hidden text-xs font-semibold tracking-[0.08em] text-zinc-900 dark:text-zinc-100 sm:inline sm:text-sm">
            {BRAND_TITLE}
          </span>
        </div>
      );
    case "auth-mobile":
      return (
        <div className="flex items-center gap-3">
          <BrandLogo className="h-[3.75rem] w-auto max-w-[240px]" />
          <span className="text-xs font-semibold tracking-[0.08em] text-zinc-900 dark:text-zinc-100">{BRAND_TITLE}</span>
        </div>
      );
    case "staff-header-compact":
      return (
        <div className="flex items-center gap-2.5">
          <BrandLogo className="h-11 w-auto max-w-[200px] shrink-0 object-contain object-left" />
          <span className="hidden max-w-[14rem] truncate text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-700 dark:text-zinc-400 lg:inline">
            {BRAND_TITLE}
          </span>
        </div>
      );
  }
}

import Image from "next/image";
import { cn } from "@/lib/cn";
import { BRAND_TITLE } from "@/lib/brand";

type BrandLogoProps = {
  className?: string;
  compact?: boolean;
};

export function BrandLogo({ className, compact = false }: BrandLogoProps) {
  return (
    <Image
      src="/api/brand/logo"
      alt={BRAND_TITLE}
      width={320}
      height={96}
      unoptimized
      className={cn("brightness-[0.96] contrast-[1.18] dark:brightness-100 dark:contrast-100", className)}
      style={{ objectFit: "contain" }}
      data-compact={compact ? "true" : "false"}
      sizes="(max-width: 768px) 60vw, 280px"
      priority={false}
    />
  );
}

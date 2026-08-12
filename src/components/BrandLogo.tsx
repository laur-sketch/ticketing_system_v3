import Image from "next/image";
import { cn } from "@/lib/cn";
import { BRAND_TITLE } from "@/lib/brand";

type BrandLogoProps = {
  className?: string;
  compact?: boolean;
  /** Constrains width; height follows native aspect ratio. */
  width?: string | number;
  height?: string | number;
};

/** Dark UI: light-gray + orange mark. */
const LOGO_SRC_DARK = "/brand/wpd-logo.png";
/** Light UI: charcoal + orange mark. */
const LOGO_SRC_LIGHT = "/brand/wpd-logo-light.png";
/** Native cropped asset ratio (~480×443). */
const INTRINSIC_W = 480;
const INTRINSIC_H = 443;

/** Workforce Productivity Dashboard brand mark — swaps for light/dark theme. */
export function BrandLogo({
  className,
  compact = false,
  width,
  height,
}: BrandLogoProps) {
  const style: React.CSSProperties = {
    width: width ?? undefined,
    height: height ?? undefined,
    maxWidth: "100%",
  };

  const imgClass = cn("block h-auto w-auto max-w-full shrink-0 object-contain", className);

  return (
    <span className="relative inline-flex shrink-0 leading-none" data-compact={compact ? "true" : "false"}>
      <Image
        src={LOGO_SRC_LIGHT}
        alt={BRAND_TITLE}
        width={INTRINSIC_W}
        height={INTRINSIC_H}
        unoptimized
        priority={false}
        sizes="(max-width: 768px) 120px, 160px"
        className={cn(imgClass, "dark:hidden")}
        style={style}
      />
      <Image
        src={LOGO_SRC_DARK}
        alt=""
        aria-hidden
        width={INTRINSIC_W}
        height={INTRINSIC_H}
        unoptimized
        priority={false}
        sizes="(max-width: 768px) 120px, 160px"
        className={cn(imgClass, "hidden dark:block")}
        style={style}
      />
    </span>
  );
}

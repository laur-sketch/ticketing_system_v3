import Image from "next/image";
import { cn } from "@/lib/cn";

type Props = {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  aspectClassName?: string;
  priority?: boolean;
  overlay?: "bottom" | "full" | "none";
};

export function LandingPhoto({
  src,
  alt,
  caption,
  className,
  aspectClassName = "aspect-[4/3] sm:aspect-[16/10]",
  priority = false,
  overlay = "bottom",
}: Props) {
  return (
    <figure
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-stoic-lg)] border border-border bg-surface shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className={cn("relative w-full", aspectClassName)}>
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 560px"
        />
        {overlay === "bottom" ? (
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/90 via-background/25 to-transparent"
            aria-hidden
          />
        ) : null}
        {overlay === "full" ? (
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background/50 via-background/10 to-background/70"
            aria-hidden
          />
        ) : null}
      </div>
      {caption ? (
        <figcaption className="absolute inset-x-0 bottom-0 px-4 pb-3 pt-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground">{caption}</p>
        </figcaption>
      ) : null}
    </figure>
  );
}

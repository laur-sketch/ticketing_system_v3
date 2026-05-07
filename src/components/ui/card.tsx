import type { ElementType, HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Props = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
};

export function Card({ as: Component = "section", className, ...props }: Props) {
  return (
    <Component
      className={cn(
        "rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
        className,
      )}
      {...props}
    />
  );
}

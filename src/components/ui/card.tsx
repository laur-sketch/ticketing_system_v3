import type { ElementType, HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Props = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
};

export function Card({ as: Component = "section", className, ...props }: Props) {
  return (
    <Component
      className={cn(
        "stoic-card p-6",
        className,
      )}
      {...props}
    />
  );
}

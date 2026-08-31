"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

type BoardTableToggleProps = {
  value: "board" | "table";
  boardHref: string;
  tableHref: string;
  className?: string;
};

export function BoardTableToggle({
  value,
  boardHref,
  tableHref,
  className,
}: BoardTableToggleProps) {
  const [active, setActive] = useState(value);

  useEffect(() => {
    setActive(value);
  }, [value]);

  const options = [
    { id: "board" as const, label: "Board", href: boardHref },
    { id: "table" as const, label: "Table", href: tableHref },
  ];

  return (
    <div
      role="tablist"
      aria-label="Board or table view"
      className={cn(
        "relative inline-flex w-full rounded-lg border border-orange-300/80 bg-orange-100 p-0.5 text-xs font-semibold sm:w-auto dark:border-orange-500/35 dark:bg-orange-950/40",
        className,
      )}
    >
      {options.map((option) => {
        const selected = active === option.id;
        return (
          <Link
            key={option.id}
            href={option.href}
            role="tab"
            aria-selected={selected}
            onClick={() => setActive(option.id)}
            className={cn(
              "relative z-10 flex-1 rounded-md px-2.5 py-1.5 text-center transition-colors sm:flex-none sm:px-3",
              selected
                ? "text-white"
                : "text-orange-950/70 hover:text-orange-950 dark:text-orange-100/75 dark:hover:text-orange-50",
            )}
          >
            {selected ? (
              <motion.span
                layoutId="agent-board-table-toggle-pill"
                className="absolute inset-0 -z-10 rounded-md bg-orange-600 shadow-sm"
                transition={{ type: "spring", stiffness: 460, damping: 34, mass: 0.7 }}
              />
            ) : null}
            <span className="relative">{option.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

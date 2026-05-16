"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { useTheme } from "./ThemeProvider";

type Props = { className?: string };

export function ThemeToggle({ className }: Props) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-sm transition hover:bg-surface-muted",
        className,
      )}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? <Sun className="size-4" strokeWidth={2.25} /> : <Moon className="size-4" strokeWidth={2.25} />}
    </button>
  );
}

"use client";

import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle";

type Props = { className?: string };

export function ThemeToggle({ className }: Props) {
  return <AnimatedThemeToggle className={className} />;
}

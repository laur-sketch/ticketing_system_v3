"use client";

import { useState } from "react";
import { FaqModal } from "@/components/faq/FaqModal";
import { cn } from "@/lib/cn";

export function FaqLaunchControl({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={cn(className)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        FAQ
      </button>
      <FaqModal open={open} onOpenChange={setOpen} />
    </>
  );
}

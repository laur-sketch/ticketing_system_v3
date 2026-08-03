"use client";

import type { FormHTMLAttributes } from "react";

type AutoSubmitFormProps = FormHTMLAttributes<HTMLFormElement>;

function isTypingField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  const type = (target.type || "text").toLowerCase();
  return (
    type === "text" ||
    type === "search" ||
    type === "email" ||
    type === "url" ||
    type === "tel" ||
    type === "password" ||
    type === "number"
  );
}

/**
 * Auto-submits on select/checkbox/radio changes.
 * Search/text inputs submit on Enter (native) or blur so typing a request number
 * is not interrupted by navigation on every keystroke.
 */
export function AutoSubmitForm({ onChange, onBlur, children, ...props }: AutoSubmitFormProps) {
  return (
    <form
      {...props}
      onChange={(event) => {
        onChange?.(event);
        if (event.defaultPrevented) return;
        if (isTypingField(event.target)) return;
        event.currentTarget.requestSubmit();
      }}
      onBlur={(event) => {
        onBlur?.(event);
        if (event.defaultPrevented) return;
        const target = event.target;
        if (!isTypingField(target)) return;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
        const form = event.currentTarget;
        if (!(form instanceof HTMLFormElement)) return;
        const name = target.name;
        if (!name) return;
        const params = new URLSearchParams(
          typeof window !== "undefined" ? window.location.search : "",
        );
        const current = (params.get(name) ?? "").trim();
        const next = target.value.trim();
        if (current === next) return;
        form.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}

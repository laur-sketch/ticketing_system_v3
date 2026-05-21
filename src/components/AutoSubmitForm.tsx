"use client";

import type { FormHTMLAttributes } from "react";

type AutoSubmitFormProps = FormHTMLAttributes<HTMLFormElement>;

export function AutoSubmitForm({ onChange, children, ...props }: AutoSubmitFormProps) {
  return (
    <form
      {...props}
      onChange={(event) => {
        onChange?.(event);
        if (event.defaultPrevented) return;
        event.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}

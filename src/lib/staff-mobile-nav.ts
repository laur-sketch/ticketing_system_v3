/** Tiny bridge so the staff header can open the mobile navigation drawer. */

type Listener = (open: boolean) => void;

const listeners = new Set<Listener>();

export function subscribeStaffMobileNav(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openStaffMobileNav() {
  for (const listener of listeners) listener(true);
}

export function closeStaffMobileNav() {
  for (const listener of listeners) listener(false);
}

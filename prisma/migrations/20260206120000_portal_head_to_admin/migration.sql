-- Replace deprecated staff portal role Head with Admin (company-scoped coordinators).
UPDATE "PortalAccount"
SET role = 'Admin'
WHERE LOWER(TRIM(role)) IN (
  'head',
  'operations head',
  'finance head',
  'hr head',
  'it support head'
);

Patch v76 - Mobile hamburger menu portal fix

- Overwrite components/AppShell.tsx.
- Menu drawer is rendered through React portal to document.body.
- Backdrop no longer applies blur.
- Drawer is fixed above dashboard cards with high z-index.
- No database, scoring, CAPASKA, Corporate, or Vaccination logic changes.

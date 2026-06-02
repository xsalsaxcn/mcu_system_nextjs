Mobile menu portrait/fullscreen fix v75.

Changed:
- components/AppShell.tsx only.
- Menu drawer is now fixed fullscreen on mobile and fixed dropdown on desktop.
- Backdrop is behind drawer; drawer z-index is higher than cards/header.
- Body scroll is locked while drawer is open.

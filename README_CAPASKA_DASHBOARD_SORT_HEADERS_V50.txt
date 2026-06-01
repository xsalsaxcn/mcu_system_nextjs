Patch v50 - Dashboard table sortable headers

Files changed:
- app/dashboard/page.tsx

Changes:
- Adds sort arrow icons to dashboard table headers.
- Header columns are clickable and toggle ascending/descending order.
- Applies to MCU CAPASKA table and vaccination table, without changing backend, scoring, export, or database.
- Corporate MCU flow is not modified beyond the shared dashboard table UI.

Install by extracting this patch over the existing project folder.

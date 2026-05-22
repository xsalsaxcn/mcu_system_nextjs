Patch v35b - Fix Build Error rowsToShow

Masalah:
Vercel build gagal karena rowsToShow ikut terpakai di CompactTable.
CompactTable berada di luar Dashboard(), jadi tidak punya akses ke rowsToShow.

Error:
Cannot find name 'rowsToShow'

Perbaikan:
- CompactTable dikembalikan pakai rows.map(...)
- CompactTable empty state dikembalikan pakai !rows.length
- Search/sort rowsToShow tetap aktif di tabel Daftar Peserta utama.

File yang perlu upload/replace:
1. app/dashboard/page.tsx
2. components/AppShell.tsx
3. app/api/dashboard/export/route.ts

Tidak perlu SQL.

Cara pasang:
1. Upload/replace 3 file di atas.
2. Commit changes.
3. Tunggu Vercel build.
4. Logout-login.
5. Ctrl + Shift + R.

Tanda aktif:
Dashboard v35b · search sort · compact toolbar

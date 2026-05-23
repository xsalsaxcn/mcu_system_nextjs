Patch v36 - Dashboard Pagination / Page Rows

Masalah:
Tabel Daftar Peserta terlalu panjang karena semua row ditampilkan sekaligus.

Perubahan:
- Tambah Rows per page:
  25 rows
  50 rows
  100 rows
  150 rows
  Semua rows

- Tambah pagination:
  First
  Prev
  Page x / y
  Next
  Last

- Search dan Sort tetap berjalan sebelum pagination.
- Saat search/sort/filter/source berubah, halaman otomatis balik ke page 1.

File yang perlu upload/replace:
1. app/dashboard/page.tsx
2. components/AppShell.tsx
3. app/api/dashboard/export/route.ts

Tidak perlu SQL.

Cara pasang:
1. Upload/replace 3 file di atas.
2. Commit changes.
3. Tunggu Vercel Ready + Current.
4. Logout-login admin/supervisor.
5. Ctrl + Shift + R.

Tanda aktif:
Dashboard v36 · pagination rows

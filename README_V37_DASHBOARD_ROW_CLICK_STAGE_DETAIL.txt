Patch v37 - Dashboard Row Click Stage Detail

Masalah:
Row peserta sudah bisa diklik, tapi detail stage muncul terlalu jauh di bawah sehingga terlihat seperti tidak muncul.

Perubahan:
- Saat row peserta diklik, detail progress stage muncul langsung di bawah row tersebut.
- Ada icon + / - di kolom nama.
- Row aktif diberi highlight biru.
- Detail berisi:
  No MCU
  Score
  Kelulusan
  Range kelulusan
  StageProgress detail
- Detail lama yang muncul jauh di bawah dihapus.

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
Dashboard v37 · row click stage detail

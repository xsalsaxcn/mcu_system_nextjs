Patch v35 - Toolbar Hamburger + Search/Sort Dashboard + Total Score di Hasil Wide

Perubahan:
1. Toolbar dibuat compact:
   - Toolbar utama hanya Dashboard dan Registrasi Ulang.
   - Menu lain masuk ke tombol ☰ Menu.

2. Dashboard daftar peserta:
   - Search by Nama / No MCU / NIK.
   - Sort Alphabet A-Z / Z-A.
   - Sort Progress tertinggi / terendah.
   - Sort Score tertinggi / terendah.

3. Export Excel:
   - Sheet Hasil Wide Selesai sekarang menambahkan kolom:
     Status Progress
     Kelulusan
     Total Score
     Progress %

File yang perlu upload/replace:
1. components/AppShell.tsx
2. app/dashboard/page.tsx
3. app/api/dashboard/export/route.ts

Tidak perlu SQL.

Cara pasang:
1. Upload/replace 3 file di atas.
2. Commit changes.
3. Tunggu Vercel Ready + Current.
4. Logout-login admin/supervisor.
5. Ctrl + Shift + R.
6. Export ulang "Export Semua Hasil".

Tanda aktif:
Dashboard v35 · search sort · compact toolbar

Patch v38 - Registrasi Ulang Progress Fix + Auto Close Retrieve

Masalah yang diperbaiki:
1. Stage "Registrasi CAPASKA" tidak perlu tampil di detail progress/dashboard.
2. Stage "Registrasi Ulang" tidak boleh default Done.
   Harus Done hanya setelah tim registrasi klik Save di menu Registrasi Ulang.
3. Setelah pilih peserta dari hasil retrieve, daftar rekomendasi masih panjang dan tidak otomatis tertutup.

Perubahan:
- lib/server/progress.ts:
  - Hide stage "Registrasi CAPASKA".
  - Tidak ada lagi auto-Done untuk semua post registrasi.
  - Registrasi Ulang dihitung berdasarkan marker hasil pemeriksaan/field save.

- app/api/dashboard/route.ts:
  - Filter stage Registrasi CAPASKA dari dashboard.
  - Registrasi Ulang Done jika registrasi_ulang_done = 1 atau marker hasil sudah ada.

- app/api/dashboard/export/route.ts:
  - Logika progress export mengikuti dashboard.

- app/registrasi-ulang/page.tsx:
  - Saat peserta diklik dari Hasil Retrieve Data:
    - results dikosongkan otomatis.
    - daftar rekomendasi tertutup.
    - yang tampil fokus ke form Registrasi Ulang.

- app/api/registrasi-ulang/save/route.ts:
  - Save Registrasi Ulang menandai registrasi_ulang_done = 1.
  - Save juga mencoba membuat marker parameter "Status Registrasi Ulang".

File yang perlu upload/replace:
1. lib/server/progress.ts
2. app/api/dashboard/route.ts
3. app/api/dashboard/export/route.ts
4. app/dashboard/page.tsx
5. components/AppShell.tsx
6. app/registrasi-ulang/page.tsx
7. app/api/registrasi-ulang/save/route.ts

SQL yang perlu dijalankan:
- sql/registrasi_ulang_progress_fix_v38.sql

Cara pasang:
1. Upload/replace semua file di atas.
2. Commit changes.
3. Tunggu Vercel Ready + Current.
4. Supabase → SQL Editor → New query.
5. Run isi sql/registrasi_ulang_progress_fix_v38.sql.
6. Kalau ada warning RLS, pilih Run without RLS.
7. Logout-login admin/supervisor.
8. Ctrl + Shift + R.

Tanda aktif:
- Dashboard v38 · stage detail + registrasi ulang fix
- Registrasi Ulang v38 · auto close hasil retrieve

Patch v33 - Supervisor Dashboard + Kelulusan + Export Excel

Masalah yang diperbaiki:
1. Dashboard supervisor terlalu basic.
2. Belum ada export Excel.
3. Belum ada dashboard LULUS / TIDAK LULUS.
4. Tidak Lulus harus dihitung hanya dari peserta yang sudah selesai semua stage.
5. Perlu setup Parameter Kelulusan berdasarkan total score.

File yang perlu upload/replace:
1. components/AppShell.tsx
2. app/dashboard/page.tsx
3. app/api/dashboard/route.ts
4. app/api/dashboard/export/route.ts
5. app/parameter-kelulusan/page.tsx
6. app/api/graduation-rules/route.ts

SQL yang perlu dijalankan:
- sql/graduation_rules_v33.sql

Fitur baru:
1. Dashboard Progress & Kelulusan
   - Total
   - Belum Selesai
   - Selesai
   - Lulus
   - Tidak Lulus
   - Belum Dinilai
   - Rata-rata progress

2. Tabel LULUS dan TIDAK LULUS
   - Hanya peserta yang selesai semua stage yang masuk Lulus/Tidak Lulus.
   - Peserta belum selesai tetap hanya masuk Belum Selesai, bukan Tidak Lulus.

3. Export Excel
   - Export Progress Excel
   - Export Semua Hasil

4. Parameter Kelulusan
   - Menu admin baru: Parameter Kelulusan
   - Atur range score lulus per paket:
     Min Score Lulus
     Max Score Lulus

Logika kelulusan:
- Jika stage belum lengkap: Belum Selesai
- Jika stage lengkap tapi score kosong: Belum Dinilai
- Jika stage lengkap dan score dalam range: Lulus
- Jika stage lengkap dan score di luar range: Tidak Lulus

Cara pasang:
1. Upload/replace semua file di atas.
2. Commit changes.
3. Tunggu Vercel Ready + Current.
4. Supabase → SQL Editor → New query.
5. Paste isi sql/graduation_rules_v33.sql.
6. Run.
7. Kalau muncul warning RLS, pilih Run without RLS.
8. Logout-login admin/supervisor.
9. Ctrl + Shift + R.

Tanda aktif:
- Dashboard v33 · lulus/tidak lulus · export excel
- Parameter Kelulusan v33 · range total score

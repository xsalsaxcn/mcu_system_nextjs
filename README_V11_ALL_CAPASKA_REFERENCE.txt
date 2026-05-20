Patch v11 - All CAPASKA Reference Parameters

Sumber:
- File yang kamu kirim: Pasted text(38).txt

Isi patch:
- app/input/page.tsx
- app/input-corporate/page.tsx
- lib/shared/constants.ts
- sql/capaska_all_reference_parameters_v11.sql

Perubahan:
1. Semua field mayoritas single choice/radio sesuai reference.
2. Field Value dibuat sebagai score otomatis/read-only.
3. Total score section dan total score post otomatis dihitung di UI sebelum simpan.
4. Parameter lama CAPASKA dinonaktifkan oleh SQL agar tidak campur lagi.
5. Mapping package CAPASKA di-reset ke parameter reference aktif.

Langkah pasang:
1. Upload/replace isi patch ke GitHub repo.
2. Commit changes.
3. Tunggu Vercel redeploy sampai Ready + Current.
4. Supabase > SQL Editor > New query.
5. Copy seluruh isi sql/capaska_all_reference_parameters_v11.sql.
6. Klik Run.
7. Logout app.
8. Login ulang operator, contoh:
   capaska_mata / mata123
   capaska_tht / tht123
   capaska_pd / pd123

Catatan:
Data peserta tidak dihapus.
Hasil lama dari parameter lama tidak dihapus, tetapi tidak ditampilkan karena parameter lama dibuat nonaktif.

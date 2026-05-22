Patch v21 - Fast Label Search

Masalah:
Generate label di admin terasa berat walaupun cari 1 nama.

Penyebab utama:
1. Search label sebelumnya request terlalu besar.
2. Query pakai ILIKE '%nama%' di banyak kolom.
3. Tanpa pg_trgm index, Supabase harus scan tabel.
4. Print area QR ikut dirender terlalu awal.

Perbaikan:
1. app/labels/page.tsx
   - Search default hanya 25 peserta.
   - Kalau database = semua, wajib keyword minimal 2 karakter.
   - Print QR tidak dirender sampai tombol Print diklik.
   - Preview hanya 4 label.
   - QR tetap berisi MCU + Nama:
     MCU=NOMOR_MCU;NAME=NAMA_LENGKAP

2. app/api/labels/participants/route.ts
   - Fast exact search dulu untuk mcu_id, external_id, nik, barcode_value.
   - Kalau exact tidak ada, baru fallback ILIKE.
   - Limit maksimal 50.
   - Kolom select lebih ringan.

3. sql/label_search_performance_v21.sql
   - Tambah pg_trgm index untuk mempercepat search nama/MCU/barcode.

Cara pasang:
1. Upload/replace:
   - app/labels/page.tsx
   - app/api/labels/participants/route.ts
2. Commit changes.
3. Tunggu Vercel Ready + Current.
4. Supabase > SQL Editor > New query.
5. Paste isi:
   sql/label_search_performance_v21.sql
6. Run.
7. Logout-login admin.
8. Hard refresh Ctrl + Shift + R.

Tanda aktif:
Di halaman Cetak Label muncul badge:
Label Search v21 · fast search · QR MCU+Nama

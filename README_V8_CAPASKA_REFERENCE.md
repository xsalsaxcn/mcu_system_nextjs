# Patch v8 - CAPASKA Reference Forms

Patch ini menyesuaikan form input CAPASKA dengan screenshot reference yang dikirim:
- Pemeriksaan Mata
- Penyakit Dalam
- Kesehatan Gigi & Mulut + Dental panoramik
- Kesehatan THT
- Kesehatan Jantung dan Pembuluh Darah

## Cara pasang
1. Upload/replace file patch ke root GitHub repo.
2. Commit changes.
3. Tunggu Vercel redeploy sampai Ready + Current.
4. Jalankan SQL `sql/capaska_reference_parameters_v8.sql` di Supabase SQL Editor.
5. Login operator dan cek form.

## Catatan
SQL menonaktifkan parameter CAPASKA lama dan mengaktifkan parameter reference baru.

# WELLNESS_HISTORY_IMPORT_V352

Patch ini hanya menyentuh modul Wellness.

## File yang ditambahkan/diubah

- `app/wellness/history-import/page.tsx`
- `app/api/wellness/history/import/route.ts`
- `app/wellness/import/page.tsx`
- `app/wellness/dashboard/page.tsx`
- `app/api/wellness/dashboard/route.ts`
- `sql/wellness_history_v352.sql`

## Fungsi

Menambahkan halaman import khusus history pemeriksaan MCU:

- `/wellness/history-import`
- `/api/wellness/history/import`

Data history MCU disimpan ke tabel `wellness_checkup_history` dan ikut muncul di grafik per peserta sebagai titik pemeriksaan.

## Format minimal Excel

Kolom wajib:

- `KODE`
- `Nama Karyawan`
- `Tanggal Periksa`

Kolom klinis yang didukung:

- `NO. LAB`
- `Nama Grup`
- `Risk Level`
- `Selection Reason`
- `HbA1c Raw`
- `HbA1c %`
- `Tensi Raw`
- `Sistolik`
- `Diastolik`
- `BMI`
- `BB`
- `TB`
- `Lingkar Perut`
- `Gula Darah`
- `Jumlah Kriteria`
- `Risk Score`
- `Fokus Intervensi`
- `Monitoring Day-by-Day`
- `Catatan Validasi Medis`
- `Status Program`

## SQL

Jalankan manual di Supabase SQL Editor:

`sql/wellness_history_v352.sql`

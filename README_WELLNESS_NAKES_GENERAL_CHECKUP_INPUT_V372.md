# WELLNESS_NAKES_GENERAL_CHECKUP_INPUT_V372

Patch khusus Wellness untuk mengubah **Input NAKES / Mini MCU** menjadi lebih general.

## Inti perubahan

V371 memakai pilihan yang terlalu spesifik:

- Mini MCU
- Mini MCU Week 4
- Mini MCU Week 8
- Final MCU
- Follow-up NAKES

V372 menggantinya menjadi pilihan umum:

- Pemeriksaan Awal
- Pemeriksaan Berkala
- Evaluasi Akhir
- Follow-up Klinis
- Custom

Admin/NAKES tetap bisa mengisi **Nama kunjungan / label pemeriksaan** secara bebas, misalnya:

- Minggu 1
- Minggu 4
- Bulan 2
- Recheck TD
- Kunjungan Site 1
- Evaluasi Tengah Program
- Final Program

## File yang disentuh

- `app/wellness/nakes-input/page.tsx`
- `app/api/wellness/nakes-input/route.ts`
- `sql/wellness_nakes_general_checkup_v372_guard.sql`

## Database

Tidak menambah tabel baru. Tetap memakai `wellness_checkup_history`.

SQL guard hanya memastikan tabel Wellness history tersedia. Tidak menyentuh MCU, CAPASKA, Corporate MCU, atau Vaksinasi.

## Marker

- `WELLNESS_NAKES_GENERAL_CHECKUP_INPUT_V372_PAGE`
- `WELLNESS_NAKES_GENERAL_CHECKUP_INPUT_V372_API`
- `WELLNESS_NAKES_GENERAL_CHECKUP_INPUT_V372_SQL`

# WELLNESS_HISTORY_GROUP_FILTER_V354

Patch Wellness-only untuk menambahkan filter pencocokan peserta pada halaman Import History Pemeriksaan MCU.

## Yang berubah

- `app/wellness/history-import/page.tsx`
  - Menambahkan pilihan `Kelompok` dan `Group` dari Setting Wellness.
  - Pilihan mengikuti `Company / Main Entity` yang dipilih.
  - Submit import mengirim `kelompok_id` dan `group_unit_id` ke API.
  - Menambahkan instruksi mekanisme agar admin memilih Kelompok/Group bila ingin pencocokan lebih spesifik.

- `app/api/wellness/history/import/route.ts`
  - Mencocokkan peserta berdasarkan `KODE` + scope yang dipilih:
    - `company_id`
    - `kelompok_id`
    - `group_unit_id`
  - Bila scope dipilih dan peserta tidak ditemukan di scope tersebut, history akan di-skip agar tidak salah masuk peserta lain.
  - Bila opsi buat peserta baru dicentang, peserta baru dibuat dengan company/kelompok/group yang dipilih.

## Tidak berubah

- Tidak ada perubahan SQL.
- Tidak menyentuh MCU, CAPASKA, Corporate MCU, Vaksinasi, atau modul lain.

## Catatan penggunaan

1. Pastikan Setting Wellness sudah berisi Company, Kelompok, dan Group.
2. Import Peserta Wellness dulu dengan Company/Kelompok/Group yang benar.
3. Saat Import History MCU, pilih Company/Kelompok/Group yang sama agar matching lebih aman.
4. Klik Auto Mapping, cek mapping, lalu Import History MCU.

Marker: `WELLNESS_HISTORY_GROUP_FILTER_V354`

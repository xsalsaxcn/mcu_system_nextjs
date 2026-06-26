# WELLNESS_INPUT_PRO_SELECTOR_V359

Patch Wellness-only untuk merapikan pemilihan peserta di halaman Input Harian dan mencegah import peserta salah mapping.

## File yang berubah

- `app/wellness/input/page.tsx`
- `app/api/wellness/participants/route.ts`
- `app/api/wellness/import/participants/route.ts`

## Tujuan

1. Dropdown peserta tidak lagi hanya menampilkan `name` mentah.
2. Peserta ditampilkan dengan konteks: KODE, nama, risk cluster, perusahaan, kelompok, dan group upload.
3. Ada filter perusahaan, kelompok, group, dan pencarian.
4. Jika ada data lama yang namanya terlanjur menjadi `Grup A - Triple Risk`, sistem memberi warning agar data dibersihkan/reimport.
5. Import peserta dijaga agar `Nama Grup` tidak dianggap sebagai `Nama Karyawan`.
6. KODE duplikat dalam file import akan dilewati dengan pesan error detail, karena KODE dipakai sebagai kunci signup peserta.

## Catatan untuk file upload

Untuk file seperti `kelompok1-grupA.xlsx`, struktur yang benar adalah:

- `Nama Grup` = Risk Cluster / kelompok risiko klinis
- `KODE` = kunci peserta / No Karyawan
- `NO. LAB` = nomor pemeriksaan
- `Nama Karyawan` = nama peserta
- `Sex` = jenis kelamin
- `Departemen` dan `Jabatan` = informasi pekerjaan, bukan group upload aplikasi

Group upload aplikasi tetap dipilih dari UI:

`Perusahaan -> Kelompok -> Group Upload`

## Tidak mengubah SQL

Patch ini tidak menambah tabel/kolom dan tidak menyentuh modul MCU, CAPASKA, Corporate MCU, atau Vaksinasi.

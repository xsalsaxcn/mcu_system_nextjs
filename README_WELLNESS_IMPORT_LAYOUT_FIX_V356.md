# WELLNESS_IMPORT_LAYOUT_FIX_V356

Patch khusus modul Wellness untuk memperbaiki tampilan halaman Import Peserta Wellness.

## Tujuan

Memperbaiki blok **Target Upload Peserta per Grup** yang sebelumnya terlihat tumpang tindih pada layar laptop 1366px karena tiga dropdown dipaksa dalam satu baris sempit.

## File yang disentuh

- `app/wellness/import/page.tsx`

Tidak ada perubahan SQL. Tidak menyentuh MCU, CAPASKA, Corporate MCU, Vaksinasi, atau database modul lain.

## Perubahan UI

- Grid filter upload dibuat responsive.
- Dropdown perusahaan dibuat satu baris penuh.
- Dropdown Kelompok dan Group Upload dibuat dua kolom pada layar lebar, satu kolom pada layar kecil.
- Ditambahkan `min-w-0`, `w-full`, dan `truncate` agar teks dropdown panjang tidak menimpa field sebelahnya.
- Label dan pesan setting dibuat `break-words` agar tidak melebar keluar card.

## Marker

- `WELLNESS_IMPORT_LAYOUT_FIX_V356`

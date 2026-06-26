# WELLNESS_IMPORT_EXISTING_COMPANY_GROUP_V355

Patch khusus modul Wellness untuk halaman Import Peserta Wellness.

## Tujuan

Menambahkan pilihan perusahaan yang sudah ada ketika import peserta, sehingga upload dapat dilakukan per grup dan tidak mudah salah masuk ke entitas lain.

## File yang disentuh

- `app/wellness/import/page.tsx`
- `app/api/wellness/import/participants/route.ts`

Tidak ada perubahan SQL. Tidak menyentuh MCU, CAPASKA, Corporate MCU, Vaksinasi, atau modul database lain.

## Perubahan UI

Di halaman `/wellness/import` ditambahkan blok **Target Upload Peserta per Grup**:

1. Pilih Perusahaan yang Sudah Ada
2. Pilih Kelompok
3. Pilih Group Upload

Jika perusahaan dipilih dari setting, field `Company Name` akan terkunci otomatis agar tidak typo. Jika ingin membuat perusahaan baru, pilih opsi `Input perusahaan baru / tidak pakai setting` lalu isi nama perusahaan manual.

## Perubahan API

Import peserta sekarang mencoba mencocokkan existing participant dengan scope:

```text
KODE + wellness_company_id + wellness_kelompok_id + wellness_group_unit_id
```

Jika kolom setting/baseline belum ada di database, API tetap fallback ke pencocokan lama berdasarkan `KODE` saja.

## Marker

- `WELLNESS_IMPORT_EXISTING_COMPANY_V355`
- `WELLNESS_IMPORT_EXISTING_COMPANY_V355_API`

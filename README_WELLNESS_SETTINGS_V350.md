# WELLNESS_SETTINGS_PARAMETER_V350

Patch ini hanya menyentuh modul Wellness:

- `app/wellness/settings/page.tsx`
- `app/wellness/import/page.tsx`
- `app/wellness/dashboard/page.tsx`
- `app/wellness/master/page.tsx`
- `app/api/wellness/settings/route.ts`
- `app/api/wellness/import/participants/route.ts`
- `app/api/wellness/dashboard/route.ts`
- `app/api/wellness/export/route.ts`
- `lib/wellness/riskRules.ts`
- `sql/wellness_settings_v350.sql`

Tidak mengubah tabel MCU, CAPASKA, Corporate MCU, atau Vaksinasi.
SQL yang ditambahkan hanya `wellness_*`.

## Alur baru

1. Buka `/wellness/settings`.
2. Buat Main Entity / Nama Perusahaan.
3. Tambah Kelompok dan isi nama Coach.
4. Tambah Group di bawah parent Kelompok.
5. Pilih parameter form: Nutrisi, TB & BB, Workout, Mini MCU.
6. Pilih parameter Mini MCU yang akan diperiksa oleh Nakes.
7. Buka `/wellness/import` untuk import peserta + baseline MCU.
8. Buka `/wellness/dashboard` untuk melihat before-after.

## SQL

Jalankan `sql/wellness_settings_v350.sql` di Supabase SQL Editor sebelum memakai fitur setting/baseline penuh.

File SQL ini additive dan aman untuk modul lain karena hanya:

- membuat tabel `wellness_companies`
- membuat tabel `wellness_group_units`
- membuat tabel `wellness_program_parameters`
- membuat tabel `wellness_mini_mcu_parameters`
- membuat tabel `wellness_mini_mcu_logs`
- menambah kolom baseline/settings pada `wellness_participants`

## Kolom Excel import yang didukung

Minimal:

- No Karyawan
- Nama

Identitas opsional:

- Email
- No HP
- Jenis Kelamin
- Tanggal Lahir
- Kelompok / Group / Divisi / Department

Baseline MCU opsional:

- TB / Tinggi Badan
- BB / BB Awal / Berat Badan Awal
- BMI / IMT
- Lingkar Perut
- HbA1c
- Gula Darah / GDP / GDS / Glucose
- Sistol / SBP
- Diastol / DBP
- Tekanan Darah dengan format 156/101
- Tanggal MCU
- Catatan MCU
- Risk Cluster / Kelompok Risiko

## Catatan keamanan modul

Patch script melakukan backup file yang disentuh saja dan tidak memodifikasi file global menu/AppShell agar tidak mengganggu modul lain.

# Corporate MCU PDF V400

Scope perubahan hanya modul AI MCU Analyzer > Generate PDF MCU Corporate.

## Fitur
- Route khusus `/ai-mcu/corporate/generate`.
- API khusus Corporate untuk membaca parameter dan generate PDF.
- Checklist section PDF dan parameter Excel.
- Setup nama koordinator dan penanggung jawab per pemeriksaan.
- Bulk upload Foto Profile, Rontgen, EKG, Treadmill, Spirometri, Audiometri, dan USG.
- Auto mapping file secara ketat menggunakan kombinasi No MCU + nama peserta.
- File mismatch ditolak sebelum upload sehingga tidak dapat tertukar.
- Foto disimpan di Supabase Storage bucket `corporate-mcu-assets` dan URL ditulis ke `ai_mcu_import_rows.row_data`.
- Thorax, EKG, Treadmill, Spirometri, Audiometri, dan USG dibuat sebagai halaman penunjang tersendiri oleh renderer Corporate existing.

## Format nama file wajib
`NOMCU-NAMA PESERTA.jpg`

Contoh:
- `047-AGUS NUGROHO.jpg`
- `047-AGUS NUGROHO-THORAX.jpg`

## Tidak diubah
- Generate PDF CAPASKA dan scoring CAPASKA.
- Modul Vaksinasi.
- Modul Wellness.
- Layout dasar PDF Corporate existing, header, footer, font, margin, dan tabel.

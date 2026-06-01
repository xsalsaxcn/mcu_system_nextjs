CAPASKA THT Radio/Single Choice v45
===================================

Scope patch:
- app/input/page.tsx
- lib/shared/capaskaDirectScoring2026.ts
- sql/capaska_tht_radio_scoring_v45.sql

Perubahan:
1. UI operator CAPASKA menyembunyikan field auto seperti "Value ...", "Score ...", dan "Score total ...".
2. Parameter THT dipaksa tampil sebagai radio/single choice, walaupun database lama masih menyimpan input_type = text.
3. Radio THT menampilkan skor per opsi dan label Tidak Direkomendasikan untuk opsi merah.
4. Backend scoring CAPASKA v45 tetap menghitung score/value field meskipun parameter lama belum sempat diubah ke radio, selama pilihan cocok dengan rule CAPASKA.
5. Patch ini tidak menyentuh Corporate MCU dan Vaksinasi.

SQL opsional tapi direkomendasikan:
- Jalankan sql/capaska_tht_radio_scoring_v45.sql di Supabase SQL Editor.
- SQL ini hanya update parameter THT CAPASKA menjadi input_type = radio dan mengisi config_json scoring.

THT scoring:
- Membran timpani: Intak = 2, Tidak intak = -10 critical
- Serumen: Tidak ada = 2, Ada serumen = 1
- Tonsil: T0 / T1-T1 = 2, Sudah tonsilektomi = 2, T2a-T2a = 1, T2b-T2b = -1, T3-T3 = -10 critical
- Rhinitis Alergi: Negatif = 2, Positif = 1
- Epistaksis: Tidak ada = 1, Ada = -1
- Tes Garputala/Weber: Normal = 1, Tidak normal = -10 critical

Total normal THT = 10.

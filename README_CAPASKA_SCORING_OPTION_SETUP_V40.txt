# CAPASKA Scoring Option Setup v40

Patch ini menambahkan setup skor per opsi jawaban di halaman Setup Parameter.

## Fitur yang ditambahkan

1. Field Skor Maksimal pada form Tambah / Edit Parameter.
2. Field Tipe Skoring: By Option, Manual, atau No Score.
3. Checkbox Hitung ke total skor.
4. Tabel Opsi Jawaban & Skoring:
   - Opsi Jawaban
   - Value
   - Skor
   - Tidak Direkomendasikan
   - Catatan
5. Form operator menampilkan skor pilihan setelah opsi dipilih.
6. Dashboard dan export memakai engine scoring CAPASKA yang sama.
7. Total skor CAPASKA dihitung langsung dari skor opsi yang dipilih, bukan normalisasi 0-2.
8. Opsi dengan flag Tidak Direkomendasikan membuat status akhir menjadi Tidak Direkomendasikan.

## File yang berubah

- app/setup-parameters/page.tsx
- app/api/setup/parameters/route.ts
- app/input/page.tsx
- app/input-corporate/page.tsx
- lib/shared/capaskaScoring2026.ts

## File SQL baru

- sql/capaska_scoring_options_config_v40.sql

SQL ini tidak menghapus peserta atau hasil pemeriksaan. SQL ini hanya mengubah config_json parameter CAPASKA agar berisi opsi jawaban, skor, dan critical flag.

## Cara apply di local

```bat
cd /d "C:\Users\Lenovo\Documents\mcu_system_nextjs"
npm install
npm run build
```

## Cara apply ke Supabase

1. Buka Supabase SQL Editor.
2. Jalankan SQL utama CAPASKA kalau belum pernah:

```sql
-- sql/capaska_all_reference_parameters_v11.sql
```

3. Jalankan SQL scoring options baru:

```sql
-- sql/capaska_scoring_options_config_v40.sql
```

4. Login admin, buka Setup Parameter, edit parameter CAPASKA seperti Hernia.
5. Pastikan sudah terlihat:
   - Tidak ada = 1
   - Ada = -10
   - Tidak Direkomendasikan dicentang untuk Ada

## Catatan Ortopedi

PDF simulasi memiliki inkonsistensi kecil antara detail vertebra dan rekap total 100. Patch ini mengikuti rekap total 100 dengan mekanisme cap: skor detail Ortopedi bisa membaca vertebra 2 poin per normal agar simulasi kasus tetap 68, tetapi skor domain Ortopedi dibatasi maksimal 16.

## Deploy ke Vercel

Setelah build aman:

```bat
git status
git add .
git commit -m "add capaska scoring option setup"
git push
```

Vercel akan redeploy otomatis jika repo sudah terhubung.

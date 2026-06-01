CAPASKA Backend Scoring v42
===========================

Tujuan:
- Implementasi scoring CAPASKA 2026 lewat backend saja.
- Tidak mengubah halaman MCU Corporate.
- Tidak mengubah modul Vaksinasi.
- Tidak perlu perubahan tampilan untuk memakai engine scoring ini.

File backend yang berubah / ditambahkan:
1. lib/shared/capaskaDirectScoring2026.ts
   Engine scoring CAPASKA 2026 berbasis skor langsung per opsi.
   Contoh: Hernia Tidak ada = 1, Hernia Ada = -10 + red flag.

2. app/api/results/save/route.ts
   Saat hasil pemeriksaan CAPASKA disimpan, backend otomatis menghitung field Value/Score/Total Score untuk post tersebut.
   Corporate MCU dan Vaksinasi tetap lewat flow lama.

3. app/api/dashboard/route.ts
   Dashboard memakai engine scoring backend CAPASKA untuk menghitung total_score, domain score, dan red flag.

4. app/api/dashboard/export/route.ts
   Export memakai engine scoring backend yang sama dengan dashboard.

5. sql/capaska_scoring_options_config_v42.sql
   Opsional tetapi direkomendasikan. Mengisi config_json parameter CAPASKA dengan opsi skor dan critical flag.
   Script ini hanya update parameters dengan program_type='capaska'.

Cara apply:
1. Backup project dulu.
2. Extract ZIP patch ini.
3. Copy/overwrite isi patch ke folder project.
4. Jalankan npm run build.
5. Jalankan SQL v42 di Supabase SQL Editor jika ingin config_json parameter CAPASKA ikut punya opsi skor.

Catatan:
- Engine backend tetap punya builtin scoring rule, jadi dashboard tetap bisa menghitung skor meskipun SQL config belum dijalankan.
- SQL v42 tetap direkomendasikan agar opsi dropdown / config parameter CAPASKA sinkron dengan scoring backend.

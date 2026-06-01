Patch v49 - CAPASKA Excel Export Cleanup

File yang diubah:
- app/api/dashboard/export/route.ts

Perubahan khusus CAPASKA:
1. Sheet "Progress Peserta" tidak dibuat lagi untuk export CAPASKA.
2. Sheet "Hasil Wide Selesai" hanya berisi peserta yang status progress-nya Selesai dan progress 100%.
3. Kolom wide dibuat berkelompok:
   - Data Peserta
   - Hasil Pertanyaan
   - Skor Per Pertanyaan
   - Skor Pemeriksaan
   - Info
   - Final
4. Kolom "Total Skor Akhir" diletakkan di ujung paling kanan.
5. Sheet "Hasil Pemeriksaan" lebih rapi:
   - parameter Value/Score otomatis disembunyikan
   - ada kolom Skor hasil hitung per parameter
   - timestamp diformat menjadi DD/MM/YYYY HH:mm:ss WIB

Corporate MCU dan Vaksinasi tetap memakai sheet Progress Peserta seperti sebelumnya.

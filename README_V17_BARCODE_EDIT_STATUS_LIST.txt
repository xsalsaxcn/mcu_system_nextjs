Patch v17 - Barcode Scanner, Edit Hasil, Daftar Selesai/Belum

Fitur baru:
1. Tombol kamera 📷 di samping input pencarian.
   - Menggunakan BarcodeDetector browser jika tersedia.
   - Ada input manual jika kamera/browser tidak support.

2. Menu Edit Hasil Submission.
   - Hasil pencarian dan daftar peserta punya tombol:
     - Input Baru
     - Edit Hasil
   - Input Baru = form kosong.
   - Edit Hasil = load current_value dari Supabase.

3. Daftar peserta selesai dan belum selesai.
   - Klik Muat Daftar.
   - Ada tab:
     - Belum
     - Selesai
   - Status mengikuti stage operator yang sedang login.

4. AutoScore tetap dipakai.
   - Badge baru: AutoScore v17 aktif · scan barcode · edit hasil · daftar status

Cara pasang:
1. Upload/replace app/input/page.tsx ke GitHub.
2. Commit changes.
3. Tunggu Vercel Ready + Current.
4. Logout-login operator.
5. Hard refresh Ctrl + Shift + R.

Tidak perlu run SQL lagi.

Patch v27b - Kamera Langsung + Hapus Filter Tanggal

Perubahan:
1. Field Tanggal MCU di bagian Retrieve Data dihapus.
   Search hanya pakai Program, Database/Instansi, dan Cari Peserta.

2. Fitur foto dipisah:
   - Aktifkan Kamera: buka kamera live langsung dari browser.
   - Upload dari Galeri: pilih file dari galeri/file manager.

3. API search tidak lagi filter examination_date/exam_date.

4. Tanggal Pemeriksaan tetap ada di bagian Edit Data Identitas.

File yang perlu upload/replace:
- app/registrasi-ulang/page.tsx
- app/api/registrasi-ulang/search/route.ts

Cara pasang:
1. Upload/replace kedua file di atas.
2. Commit changes.
3. Tunggu Vercel Ready + Current.
4. Logout-login admin.
5. Hard refresh Ctrl + Shift + R.

Tanda aktif:
Registrasi Ulang v27b · kamera langsung · tanpa filter tanggal

Catatan:
Kalau kamera tidak terbuka, cek permission kamera untuk domain Vercel di browser/HP.

Patch v34 - Hasil Wide Export Hanya Peserta Selesai

Perubahan:
- Sheet wide export tidak lagi menampilkan semua peserta.
- Sheet wide sekarang hanya berisi peserta dengan Status Progress = Selesai.
- Nama sheet diubah dari "Hasil Wide" menjadi "Hasil Wide Selesai".
- Sheet "Progress Peserta" tetap mengikuti filter dashboard.
- Sheet "Hasil Pemeriksaan" tetap format long/raw results.

File yang perlu upload/replace:
1. app/api/dashboard/export/route.ts
2. app/dashboard/page.tsx

Tidak perlu SQL.

Cara pasang:
1. Upload/replace kedua file di atas.
2. Commit changes.
3. Tunggu Vercel Ready + Current.
4. Logout-login supervisor/admin.
5. Ctrl + Shift + R.
6. Klik Export Semua Hasil lagi.

Tanda aktif:
Dashboard v34 · wide export selesai only

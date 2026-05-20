# Patch v12 - Auto Scoring Fix

Fungsi:
- Saat operator memilih single choice/dropdown, field Value otomatis terisi.
- Total score otomatis dihitung.
- Field Value dan Score dibuat read-only supaya operator tidak mengisi manual.
- Tidak perlu menjalankan SQL lagi kalau parameter sudah benar.

Cara pasang:
1. Upload/replace file app/input/page.tsx ke GitHub.
2. Commit changes.
3. Tunggu Vercel redeploy sampai Ready + Current.
4. Logout lalu login ulang operator.
5. Hard refresh Ctrl + Shift + R.

Contoh Mata:
- Tidak menggunakan = 2
- Buta warna parsial = 1
- (+) / (-) = 1
- Normal 6/6 = 2
Total Score Kesehatan mata = 6

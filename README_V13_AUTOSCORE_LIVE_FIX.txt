Patch v13 - Auto Score Live Fix

Masalah:
Value dan Total Score masih kosong walaupun pilihan sudah dipilih.

Perbaikan:
- Auto score dihitung ulang otomatis setiap kali values/parameters berubah.
- Fallback mencari field Value berikutnya kalau nama Value berbeda sedikit.
- Field Value dan Score dibuat read-only.
- Skor ikut dikirim saat klik Simpan Hasil Pemeriksaan.

Cara pasang:
1. Upload/replace app/input/page.tsx ke GitHub.
2. Commit changes.
3. Tunggu Vercel redeploy Ready + Current.
4. Logout-login operator.
5. Hard refresh Ctrl + Shift + R.

Patch v15 - Blank Default + AutoScore

Requirement:
1. Saat masuk form, pilihan harus kosong / belum memilih apapun.
2. Field Value harus otomatis keluar begitu pertanyaan dipilih.
3. Score total ikut otomatis.
4. Field Value dan Score read-only.

Cara pasang:
1. Upload/replace app/input/page.tsx ke GitHub.
2. Commit changes.
3. Tunggu Vercel deployment terbaru Ready + Current.
4. Logout, login ulang operator.
5. Hard refresh Ctrl + Shift + R.

Cek:
Di header harus muncul:
AutoScore v15 aktif · pilihan awal kosong

Saat pilih opsi:
- dropdown berubah dari "-- Pilih --" ke pilihan.
- muncul "Skor pilihan: X".
- field Value di bawahnya otomatis terisi.

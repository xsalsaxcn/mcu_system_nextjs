Patch v22 - Hasil Pencarian Naik + QR/Barcode Nomor MCU Saja

Request:
1. Di halaman operator, Hasil Pencarian harus berada di atas.
2. Daftar Selesai / Belum Selesai tetap di bawah.
3. QR/barcode label jangan kombinasi MCU + nama lagi, cukup Nomor MCU saja.

File yang perlu upload/replace:
- app/input/page.tsx
- app/labels/page.tsx

Tidak perlu update Supabase.
Tidak perlu update package.json.

Perubahan:
- app/input/page.tsx:
  Hasil Pencarian dipindahkan ke atas Daftar Peserta Operator Ini.
  Badge aktif:
  AutoScore v22 aktif · hasil pencarian di atas · QR MCU saja

- app/labels/page.tsx:
  QR value sekarang hanya:
  NOMOR_MCU

  Contoh:
  CAPASKA-2026-0603

Cara pasang:
1. Extract ZIP.
2. Upload/replace:
   app/input/page.tsx
   app/labels/page.tsx
3. Commit changes.
4. Tunggu Vercel redeploy sampai Ready + Current.
5. Logout-login admin/operator.
6. Hard refresh Ctrl + Shift + R.

Catatan:
Kalau scanner masih diarahkan ke QR lama yang berisi MCU=...;NAME=..., sistem input masih bisa baca format itu juga.
Tapi label baru yang dicetak setelah patch ini akan berisi Nomor MCU saja.

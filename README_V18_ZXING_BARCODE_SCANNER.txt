Patch v18 - ZXing Barcode Scanner

Masalah:
Scanner v17 memakai BarcodeDetector bawaan browser. Di beberapa HP/browser,
BarcodeDetector kurang sensitif dan sering gagal membaca barcode.

Perbaikan v18:
1. Scanner diganti ke ZXing MultiFormatReader.
2. Kamera belakang dipaksa resolusi ideal 1920x1080.
3. Continuous scanning, lebih sensitif untuk barcode 1D dan QR.
4. Ada frame panduan scan.
5. Ada tombol flash/torch jika device mendukung.
6. Ada fallback input manual.
7. Badge baru:
   AutoScore v18 aktif · ZXing barcode scanner · edit hasil · daftar status

File yang perlu upload:
1. app/input/page.tsx
2. update package.json dengan dependency:
   "@zxing/browser": "^0.1.5"

Cara pasang:
1. Upload/replace app/input/page.tsx ke GitHub.
2. Edit package.json, tambahkan dependency:
   "@zxing/browser": "^0.1.5"
3. Commit changes.
4. Tunggu Vercel redeploy sampai Ready + Current.
5. Logout-login operator.
6. Hard refresh Ctrl + Shift + R.

Tips scan barcode:
- Pakai Chrome Android.
- Izinkan camera permission.
- Scan di HTTPS domain Vercel.
- Pakai landscape jika barcode panjang.
- Jarak 10-25 cm.
- Cahaya cukup.
- Nyalakan flash jika gelap.

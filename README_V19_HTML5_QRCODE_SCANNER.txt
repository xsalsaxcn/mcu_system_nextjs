Patch v19 - Scanner Lebih Sensitif dengan html5-qrcode

Kenapa scanner sebelumnya masih susah:
- Barcode garis/1D di label kecil 40x30 mm sering sulit dibaca kamera HP.
- Browser BarcodeDetector dan ZXing video stream bisa kurang stabil tergantung device.
- html5-qrcode biasanya lebih stabil untuk mobile dan punya scan dari foto.

Fitur v19:
1. Scanner kamera pakai html5-qrcode.
2. Support QR_CODE, CODE_128, CODE_39, EAN, UPC, ITF.
3. Scan ulang.
4. Scan dari foto/kamera capture.
5. Input manual tetap ada.
6. Badge:
   AutoScore v19 aktif · html5-qrcode scanner · edit hasil · daftar status

File yang perlu upload:
1. app/input/page.tsx
2. package.json, tambahkan:
   "html5-qrcode": "^2.3.8"

Cara pasang:
1. Upload/replace app/input/page.tsx.
2. Replace package.json dengan isi PACKAGE_JSON_FULLSCRIPT.txt atau tambahkan dependency html5-qrcode.
3. Commit changes.
4. Tunggu Vercel Ready + Current.
5. Logout-login operator.
6. Hard refresh Ctrl + Shift + R.

Catatan penting:
Kalau barcode garis tetap sulit terbaca, solusi paling stabil adalah scan QR code dari label.
QR code jauh lebih reliable untuk ukuran sticker kecil dibanding barcode garis.

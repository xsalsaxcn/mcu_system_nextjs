Patch v18b - ZXing API Build Fix

Error yang diperbaiki:
Property 'decodeFromVideoElementContinuously' does not exist on type 'BrowserMultiFormatReader'.

Penyebab:
Versi @zxing/browser yang dipakai Vercel tidak punya method:
decodeFromVideoElementContinuously

Solusi:
Diganti ke method yang tersedia:
decodeFromVideoDevice(undefined, videoElement, callback)

File yang perlu upload:
- app/input/page.tsx

Package.json tetap pakai:
"@zxing/browser": "^0.1.5"

Cara pasang:
1. Upload/replace app/input/page.tsx ke GitHub.
2. Commit changes.
3. Tunggu Vercel redeploy sampai Ready + Current.
4. Logout-login operator.
5. Hard refresh Ctrl + Shift + R.

Tanda aktif:
AutoScore v18b aktif · ZXing API fix · edit hasil · daftar status

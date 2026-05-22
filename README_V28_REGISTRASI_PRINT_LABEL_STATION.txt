Patch v28 - Registrasi Ulang Print Label Station seperti Cetak Label

Request:
- Print Barcode di Registrasi Ulang harus sama konsepnya dengan fitur Cetak Label.
- Tambahan: semua parameter/station bisa diatur jumlah print lebih dari 1x sesuai kebutuhan.

Perubahan:
1. Print Barcode sekarang mencetak label station, bukan hanya 1 label Registrasi Ulang.
2. Ada panel baru:
   Setting Print Barcode / Label Station
3. Setiap station/parameter punya input jumlah print:
   - Registrasi Ulang
   - Pemeriksaan Fisik
   - Darah
   - Urine
   - Dokter
   - Rontgen
   - EKG - Hasil
   - EKG - NAKES
   - Audio
   - Mata
   - THT
   - Gigi
   - Penyakit Dalam
   - Jantung
   - Radiologi
   - Ortopedi
4. Jumlah boleh 0 sampai 20.
5. Ada tombol cepat:
   - Semua 1x
   - EKG 2 Label
   - Reset
6. Ada setting label:
   - Ukuran font
   - Garis batas
   - QR kecil
   - Text barcode
7. Tombol Print Barcode menampilkan total label:
   Print Barcode (jumlah)

File yang perlu upload/replace:
- app/registrasi-ulang/page.tsx

API search tidak berubah dari v27b, tapi ikut disertakan agar aman:
- app/api/registrasi-ulang/search/route.ts

Cara pasang:
1. Upload/replace:
   app/registrasi-ulang/page.tsx
   app/api/registrasi-ulang/search/route.ts
2. Commit changes.
3. Tunggu Vercel Ready + Current.
4. Logout-login admin.
5. Hard refresh Ctrl + Shift + R.

Tanda aktif:
Registrasi Ulang v28 · print label station · custom jumlah

Catatan:
- Setelah Save, tombol Print Barcode aktif.
- Default hanya Registrasi Ulang = 1 label.
- Untuk cetak semua station, klik "Semua 1x".
- Untuk EKG, klik "EKG 2 Label" agar EKG Hasil dan EKG NAKES masing-masing 1 label.

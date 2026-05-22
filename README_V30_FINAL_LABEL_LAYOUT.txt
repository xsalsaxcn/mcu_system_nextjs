Patch v30 - Final Label Layout Compact, Tanpa Border, Full 40x30

Masalah dari hasil print sebelumnya:
1. Header tanggal MCU tumpang tindih.
2. Label tidak penuh ke area stiker.
3. Border line membuat area cetak semakin sempit.
4. Teks masih terlalu kecil dan sebagian terpotong.

Perbaikan v30:
1. Layout label diubah fixed-grid 40mm x 30mm.
2. Border default OFF.
3. Padding diperkecil.
4. Header dipisah 3 kolom:
   Station | JK/Usia | Tanggal MCU
5. Nama dibuat paling dominan.
6. Metadata dibuat 5 baris fixed:
   No MCU
   NIK K
   Lahir
   Paket
   Dept
7. QR diperkecil.
8. Footer dibuat sederhana:
   No MCU kiri, kode station kanan.
9. Semua text dibuat nowrap + truncate supaya tidak tumpang tindih.
10. Default Text Barcode diubah menjadi No MCU footer, bukan dekorasi garis.

File yang perlu upload/replace:
- app/registrasi-ulang/page.tsx

Tidak perlu update SQL.
Tidak perlu update package.json.

Cara pasang:
1. Upload/replace:
   app/registrasi-ulang/page.tsx
2. Commit changes.
3. Tunggu Vercel Ready + Current.
4. Logout-login admin.
5. Hard refresh Ctrl + Shift + R.
6. Print ulang dari Registrasi Ulang.

Tanda aktif:
Registrasi Ulang v30 · label compact tanpa border · siap print

Setting printer disarankan:
- Paper size: 40mm x 30mm
- Scale: 100%
- Margins: None
- Headers and footers: Off
- Background graphics: On jika tersedia

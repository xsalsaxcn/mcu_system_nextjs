Patch v29 - Setup Label Paket + Label Full Size

Menjawab konsep:
Setup jumlah print label seharusnya ditentukan saat penentuan paket.
Maka toolbar yang paling tepat adalah menu Admin baru:
"Setup Label Paket"

Kenapa bukan Registrasi Ulang?
Registrasi Ulang hanya memakai setting paket untuk print.
Setting default-nya harus ada di level paket, supaya tiap paket bisa beda kebutuhan station/label.

Fitur baru:
1. Toolbar Admin:
   Setup Label Paket

2. Halaman baru:
   /setup-label-paket

3. Di halaman itu admin bisa:
   - Pilih Program
   - Pilih Paket Pemeriksaan
   - Atur jumlah print per station/parameter
   - Save Setting

4. Registrasi Ulang:
   - Saat peserta dipilih, sistem otomatis load setting label dari package_id peserta.
   - Operator/admin tetap bisa override sementara sebelum print.
   - Default print count mengikuti paket.

5. Label printout:
   - Ukuran print disesuaikan ke 40mm x 30mm.
   - Padding lebih kecil.
   - Font default dinaikkan ke 9.
   - QR diperkecil supaya area teks lebih penuh.
   - Label lebih siap pakai untuk Xprinter/sticker kecil.

File yang perlu upload/replace:
- components/AppShell.tsx
- app/registrasi-ulang/page.tsx
- app/api/registrasi-ulang/search/route.ts
- app/setup-label-paket/page.tsx
- app/api/package-label-settings/route.ts

SQL yang perlu dijalankan:
- sql/package_label_print_settings_v29.sql

Cara pasang:
1. Upload/replace semua file di atas.
2. Commit changes.
3. Tunggu Vercel Ready + Current.
4. Supabase > SQL Editor > New query.
5. Paste isi sql/package_label_print_settings_v29.sql.
6. Run.
7. Logout-login admin.
8. Hard refresh Ctrl + Shift + R.

Tanda aktif:
- Toolbar Admin muncul "Setup Label Paket".
- Halaman Setup Label Paket punya badge:
  Setup Label Paket v29 · package-based print count
- Registrasi Ulang punya badge:
  Registrasi Ulang v29 · setting paket label · label full size

Setting printer yang disarankan:
- Paper size: 40mm x 30mm
- Scale: 100%
- Margins: None / Default printer no margin
- Background graphics: ON jika tersedia

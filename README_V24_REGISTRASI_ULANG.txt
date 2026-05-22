Patch v24 - Registrasi Ulang Admin

Konsep:
Menambahkan stage baru "Registrasi Ulang" dan toolbar/menu baru di user Admin.

Fitur:
1. Toolbar Admin baru:
   Registrasi Ulang

2. Halaman baru:
   /registrasi-ulang

3. Isi halaman:
   - Retrieve data peserta by nama / No MCU / NIK / tanggal lahir
   - Ambil/upload foto peserta
   - Edit data identitas:
     Nama lengkap
     Nomor MCU
     NIK karyawan
     NIK/identitas
     Jenis kelamin
     Tanggal lahir
     Usia
     Tanggal pemeriksaan
     Department karyawan
     Provinsi/lokasi
   - Save
   - Print Barcode/Label Registrasi Ulang

4. Supabase:
   - Tambah kolom identitas/foto pada participants
   - Tambah post/stage "Registrasi Ulang"
   - Tambah parameter stage Registrasi Ulang
   - Mapping ke semua package aktif CAPASKA dan Corporate

File yang perlu upload/replace:
- components/AppShell.tsx
- app/registrasi-ulang/page.tsx
- app/api/registrasi-ulang/search/route.ts
- app/api/registrasi-ulang/participant/route.ts
- app/api/registrasi-ulang/save/route.ts

SQL yang perlu dijalankan:
- sql/registrasi_ulang_stage_v24.sql

Urutan pasang:
1. Upload/replace semua file di atas.
2. Commit changes.
3. Tunggu Vercel deploy Ready + Current.
4. Supabase > SQL Editor > New query.
5. Paste isi sql/registrasi_ulang_stage_v24.sql.
6. Run.
7. Logout-login admin.
8. Hard refresh Ctrl + Shift + R.

Tanda berhasil:
- Toolbar Admin muncul menu "Registrasi Ulang".
- Halaman /registrasi-ulang muncul badge:
  Registrasi Ulang v24 · retrieve data · foto · edit data

Catatan:
- Foto disimpan sementara sebagai base64 di kolom participants.photo_data_url.
- Ini paling cepat dan gratis.
- Nanti jika data foto makin banyak, lebih baik dipindah ke Supabase Storage.

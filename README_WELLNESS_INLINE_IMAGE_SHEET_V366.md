# WELLNESS_INLINE_IMAGE_SHEET_V366

Patch Wellness-only untuk menyesuaikan bukti gambar tanpa approval/reject.

## Prinsip

- Tidak memakai alur approve/reject.
- Tidak upload gambar ke Supabase Storage.
- Aplikasi hanya menyimpan URL gambar/bukti.
- Front-end tetap di aplikasi Wellness.
- Dashboard tetap retrieve data dari Supabase untuk progress, grafik, gallery, dan before-after.
- Google Sheet tetap menjadi salinan response seperti Jotform.
- Google Sheet menambahkan kolom preview dengan formula `IMAGE()` agar gambar bisa langsung tampil bila URL publik.

## Yang diperbaiki

1. Input Harian Wellness
   - Link bukti langsung dipreview bila berupa URL gambar atau Google Drive public link.
   - Bukti healthtalk diwajibkan berupa link gambar/screenshot/foto absensi.
   - Tidak ada tombol upload Supabase.

2. Dashboard Wellness
   - Gallery bukti menampilkan gambar langsung bila URL bisa dipreview.
   - Status approval/reject tidak ditampilkan.
   - Link tetap tersedia sebagai fallback bila preview gagal.

3. Google Sheet Form Responses
   - Menambahkan kolom:
     - Preview Foto Makanan
     - Preview Bukti Aktivitas
     - Preview Bukti Healthtalk
   - Apps Script mengubah Google Drive file link menjadi `uc?export=view&id=...`.
   - Apps Script mengisi kolom preview dengan formula `=IMAGE("url", 1)`.

4. Supabase Storage
   - Route upload evidence dinonaktifkan.

## File yang disentuh

- `app/wellness/input/page.tsx`
- `app/wellness/dashboard/page.tsx`
- `app/api/wellness/daily-log/route.ts`
- `app/api/wellness/dashboard/route.ts`
- `app/api/wellness/evidence/upload/route.ts`
- `docs/wellness_google_sheet_webhook_v366.gs`
- `README_WELLNESS_INLINE_IMAGE_SHEET_V366.md`

## File yang dihapus bila ada

- `app/wellness/review/page.tsx`
- `app/api/wellness/review/route.ts`

## Catatan Google Drive

Agar gambar muncul langsung di aplikasi dan Google Sheet, file Drive harus dapat dilihat dengan setting minimal `Anyone with the link can view`.

Jika gambar tetap tidak tampil, penyebab paling umum adalah link masih private, bukan file gambar, atau Google membatasi preview dari host tersebut. Tombol buka bukti tetap tersedia sebagai fallback.

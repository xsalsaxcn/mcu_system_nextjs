# WELLNESS_EVIDENCE_GALLERY_PROGRESS_V364

Patch khusus modul Wellness untuk membuat aplikasi tetap menjadi front-end utama, sementara Google Sheet tetap menjadi salinan response seperti Jotform.

## Tujuan
- Aplikasi tetap melakukan retrieve data dari Supabase untuk dashboard, grafik, progress, dan before-after.
- Google Sheet tetap menerima salinan row input harian seperti Form Responses.
- Gambar/bukti tidak disimpan di Supabase Storage. Aplikasi hanya menyimpan dan membaca URL bukti.
- Dashboard peserta menampilkan evidence gallery, preview image bila URL bisa dipreview, recent responses, point chart, dan progress parameter.

## File yang disentuh
- `app/wellness/dashboard/page.tsx`
- `app/api/wellness/dashboard/route.ts`
- `app/wellness/input/page.tsx`

Tidak ada perubahan SQL. Tidak menyentuh MCU, CAPASKA, Corporate MCU, atau Vaksinasi.

## Data yang dibaca dashboard
Dashboard mengambil data dari tabel Wellness berikut bila tersedia:
- `wellness_food_logs`
- `wellness_weight_logs`
- `wellness_activity_logs`
- `wellness_daily_evidence`
- `wellness_healthtalk_logs`
- `wellness_point_logs`
- `wellness_checkup_history`
- `wellness_mini_mcu_logs`

Jika tabel v360 seperti evidence/point belum tersedia, dashboard tetap berjalan karena API memakai safe select.

## Fitur baru
1. Evidence Gallery per peserta.
2. Preview image dari URL gambar langsung atau Google Drive `uc?export=view`.
3. Tombol `Buka bukti` untuk URL Google Drive/Jotform/WhatsApp/Strava yang tidak bisa dipreview.
4. Tabel `Riwayat Input Harian` seperti form response ringkas.
5. Grafik `Point harian`.
6. Summary tambahan: Total Point, Evidence Count, Pending Evidence.
7. Input Harian copy diperjelas: bukti berupa link, bukan upload ke Supabase Storage.

## Catatan preview Google Drive
Untuk preview gambar Google Drive, link yang paling stabil adalah format viewable/public. Sistem mencoba mengubah link `drive.google.com/file/d/<ID>/...` menjadi `https://drive.google.com/uc?export=view&id=<ID>`.

Jika preview tetap tidak tampil, penyebab paling umum:
- file Google Drive belum public/anyone with link,
- URL bukan file gambar langsung,
- browser memblokir preview dari host tersebut.

Dalam kondisi itu tombol `Buka bukti` tetap bisa dipakai.

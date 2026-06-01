CAPASKA done-list performance patch v46

Tujuan:
- Mempercepat halaman operator CAPASKA saat memuat daftar peserta selesai.
- Daftar tidak lagi mengambil semua peserta lalu melakukan request /api/participant satu per satu.
- Backend /api/search/participants sekarang punya mode ringan: list=1&done=1/status=done.
- Mode ringan hanya memuat peserta yang sudah selesai untuk post operator yang login.
- Data list dibatasi 80 peserta terbaru supaya halaman tetap ringan.
- Peserta lama yang tidak tampil tetap bisa dibuka lewat Cari Peserta.

File yang diubah:
- app/input/page.tsx
- app/api/search/participants/route.ts

Scope aman:
- Perubahan optimized done-list hanya aktif untuk program capaska dan parameter done=1/status=done.
- Search peserta biasa tetap berjalan seperti sebelumnya.
- Corporate MCU dan Vaksinasi tidak diubah.

Catatan:
- Kalau daftar selesai masih terasa berat, kurangi limit di app/input/page.tsx dari 80 menjadi 50.

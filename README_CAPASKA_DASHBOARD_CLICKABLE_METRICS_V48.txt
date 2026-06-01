CAPASKA Dashboard Clickable Metrics v48

Perubahan:
- Card ringkasan di dashboard MCU CAPASKA sekarang bisa diklik.
- Total -> filter Semua.
- Belum Selesai -> filter Belum Selesai.
- Selesai -> filter Selesai.
- Lulus -> filter Lulus.
- Tidak Lulus -> filter Tidak Lulus.
- Rata-rata -> kembali ke Semua.
- Setelah klik card, dashboard otomatis reload dan tabel mengikuti filter yang dipilih.

Scope:
- File yang diubah: app/dashboard/page.tsx
- Perubahan click-filter aktif hanya untuk module MCU CAPASKA.
- Tidak mengubah database, scoring, form operator, Corporate MCU, atau Vaksinasi.

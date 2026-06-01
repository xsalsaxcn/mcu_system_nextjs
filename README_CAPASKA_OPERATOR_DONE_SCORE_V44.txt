CAPASKA Operator Done List + Final Score v44

Patch ini khusus CAPASKA operator page dan API search list.
Tidak mengubah flow MCU Corporate atau Vaksinasi.

Perubahan:
1. app/input/page.tsx
   - Daftar operator hanya menampilkan peserta Selesai.
   - Tab/daftar Belum disembunyikan.
   - Peserta Selesai bisa diklik untuk lihat/edit hasil.
   - List menampilkan Skor akhir operator/post masing-masing.

2. app/api/search/participants/route.ts
   - Saat list=1 dan program=capaska, backend menambahkan operator_final_score.
   - Score dihitung dari parameter post operator dan hasil pemeriksaan yang sudah tersimpan.
   - Corporate MCU dan Vaksinasi tidak disentuh.

Catatan:
- Skor akhir yang tampil adalah skor total untuk post operator yang login, misalnya operator Mata melihat skor akhir Mata.
- Jika skor tampil "-", kemungkinan total score parameter belum ada/mapping belum lengkap atau peserta belum pernah tersimpan ulang dengan backend scoring v42.

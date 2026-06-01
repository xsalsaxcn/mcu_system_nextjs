VACCINATION PHASE 4 - ARRIVAL BASED QUEUE

Perubahan:
1. Session bisa dihapus dari tabel session dengan tombol 🗑 Hapus.
2. Import peserta corporate TIDAK lagi otomatis membuat nomor antrian.
3. Nomor antrian baru dirilis saat registrasi ulang/kedatangan.
4. Multi vaksin per session tetap didukung.
5. Done di medis akan membuat 1 sticker untuk setiap vaksin yang diberikan.

Install:
1. Jalankan sql_vaccination_phase4_arrival_queue.sql di Supabase SQL Editor.
2. Extract ZIP ini ke root project Next.js.
3. npm run build
4. git add ...
5. git commit -m "fix vaccination arrival based queue and session delete"
6. git push origin feature/vaccination-module

Flow baru:
- /vaccination/session
  Buat session dan tambah daftar vaksin+lot. Hapus session salah dengan tombol 🗑.
- /vaccination/register
  Import peserta corporate. Peserta masuk status IMPORTED dan nomor antrian masih kosong.
  Saat peserta datang, klik Rilis Nomor Antrian.
- /vaccination/queue
  Hanya peserta yang sudah punya nomor antrian/status WAITING yang dipanggil.
- /vaccination/administer
  Pilih peserta yang sudah rilis antrian. Done + print sticker.

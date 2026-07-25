# Wellness Point Fix V87

## Tujuan

Menyambungkan kembali alur input Wellness dari Google Sheet ke total point dan seluruh front-end dengan aturan berikut:

- Lapor nutrisi: +5 per input.
- Health Talk offline dengan bukti: +20.
- Health Talk online atau tanpa bukti: +10.
- Workout harian mencapai target kalori: +10.
- Workout tercatat tetapi belum mencapai target: +5.
- Bonus nutrisi harian jika total kalori tidak melebihi batas: +10 sekali per tanggal.

## Akar Masalah

1. Route nutrisi berhasil menulis ke Google Sheet, tetapi sebelumnya tidak menulis transaksi ke `wellness_point_logs`.
2. Dashboard Coach membaca nutrisi dari `wellness_food_logs`, sedangkan input Portal Peserta terbaru hanya masuk ke Google Sheet.
3. Sebagian dashboard memakai ledger, sebagian menghitung dari Google Sheet, dan dashboard lama pernah menjumlahkan keduanya sehingga berisiko double count.
4. Aturan lama masih tersisa pada jalur `daily-log`, termasuk point untuk input berat badan dan bukti workout yang tidak termasuk skema final.
5. Portal Peserta belum menampilkan ringkasan total point dari sumber data aktual.

## Perbaikan

### Single point rules

Ditambahkan `lib/wellness/pointRules.ts` sebagai pusat nilai dan aturan point.

### Idempotent point writer

Ditambahkan `lib/wellness/pointWriter.ts` untuk:

- mencegah point event yang sama tercatat dua kali;
- memperbarui satu point workout per peserta per tanggal;
- menambah atau menghapus bonus nutrisi harian ketika total kalori berubah;
- membaca target kalori dari participant atau catatan target Coach.

### Participant submission

- Nutrisi: Google Sheet tetap menjadi sumber input, lalu +5 dicatat ke ledger dan bonus harian direkonsiliasi.
- Health Talk: Google Sheet tetap menjadi sumber input, lalu +10/+20 dicatat ke ledger.
- Workout: setelah activity tersimpan, total workout per tanggal direkonsiliasi menjadi +5 atau +10.

Kegagalan menulis ledger tidak membatalkan input Google Sheet. Respons API mengembalikan warning agar input peserta tidak hilang.

### Front-end source synchronization

- Admin, Company, Coach ranking, dan Coach participant detail memakai perhitungan sumber aktual untuk kategori nutrisi, workout, dan Health Talk.
- Ledger hanya ditambahkan untuk kategori `other`, sehingga event point tidak dihitung dua kali.
- Dashboard Coach monitoring sekarang membaca nutrisi Google Sheet dengan fallback ke Supabase.
- Portal Peserta memiliki endpoint `/api/wellness/participant/points` dan menampilkan kartu Poin serta jumlah Health Talk.
- Point Portal Peserta di-refresh setelah input nutrisi, workout, Health Talk, login, dan sinkronisasi activity.

### Legacy daily-log

- Point berat badan dihapus.
- Point tambahan bukti workout dihapus.
- Workout memakai aturan target kalori harian.
- Health Talk tidak lagi wajib memiliki bukti; tanpa bukti mendapat +10.
- Health Talk offline dengan bukti mendapat +20.

## Perilaku Data Lama

Tidak diperlukan backfill untuk tampilan front-end. Kategori nutrisi, workout, dan Health Talk dihitung ulang dari sumber aktual. Point ledger kategori lain tetap dipertahankan sebagai `other_points`.

## Validasi yang Dilakukan

- Pemeriksaan syntax TypeScript/TSX pada seluruh file yang diubah: lulus.
- Uji aturan point:
  - nutrisi per input = 5;
  - bonus di bawah batas = 10;
  - bonus di atas batas = 0;
  - workout target tercapai = 10;
  - workout di bawah target = 5;
  - Health Talk offline + bukti = 20;
  - Health Talk tanpa bukti = 10.

Full Next.js build belum dijalankan pada paket kerja ini karena dependensi proyek tidak tersedia lengkap di folder hasil ekstraksi.

## Checklist Setelah Deploy

1. Input satu nutrisi dari Portal Peserta.
2. Pastikan row muncul di Google Sheet.
3. Buka ulang halaman Home peserta dan cek Poin bertambah 5; jika total kalori masih di bawah batas, bonus harian menjadi 10.
4. Buka Admin, Company, dan Coach ranking; total harus sama.
5. Input workout di bawah target lalu cek +5; tambahkan activity sampai target tercapai lalu point workout tanggal tersebut harus berubah menjadi 10, bukan menjadi 15.
6. Input Health Talk offline dengan foto dan cek +20.
7. Input Health Talk online atau tanpa foto dan cek +10.

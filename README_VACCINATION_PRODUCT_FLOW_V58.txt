V58 - Vaccination product flow fixes
Scope: hanya area vaksinasi. Tidak menyentuh MCU Corporate dan CAPASKA.

Perubahan:
1. Registrasi > Edit Produk/Tindakan
   - Kategori harga dibuat dropdown dari setup Master Vaksin.
   - Produk yang sudah Done tidak bisa diubah/hapus dari registrasi.
   - Registrasi tetap bisa menambah produk/vaksin baru setelah peserta pernah masuk dokter / selesai.
   - Jika ada perubahan produk pada peserta yang sudah punya nomor antrian, status menjadi WAITING_WITH_NOTE.

2. Registrasi > tabel peserta
   - Header kolom punya sort arrow naik/turun.
   - Sort untuk Antrian, Nama, NIK/ID, Produk/Harga, Status, dan Note.

3. Antrian Vaksin
   - Note menampilkan status_note dan produk Not Done, termasuk tambahan vaksin/payment note.
   - Peserta dengan tambahan produk akan muncul sebagai Waiting With Note untuk dipanggil ulang.

4. Administered / Dokter
   - Baris vaksin punya status Done / Not Done.
   - Vaksin yang sudah Done tampil sebagai Done dan tidak bisa dihapus.
   - Vaksin tambahan dari registrasi muncul sebagai Not Done.
   - Dokter bisa klik Done per baris Not Done, atau Done + Print semua vaksin Not Done.
   - Backend hanya memproses item Not Done agar tidak double-administered.

SQL:
- Tidak ada SQL baru jika V57 sudah dijalankan.
- V58 memakai tabel dan kolom dari sql_vaccination_v57_operational_foundation.sql.

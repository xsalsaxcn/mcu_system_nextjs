V59 - Vaccination multi product import + doctor item done hardening
Scope: hanya area Vaksinasi. Tidak menyentuh MCU Corporate dan CAPASKA.

Isi patch:
1. Dokter/Administered
   - Button Done per item vaksin dibuat lebih robust.
   - Jika item berasal dari tambahan registrasi, backend memakai itemId dari database sebagai sumber data utama.
   - Vaksin tambahan yang masih Not Done bisa diproses Done walaupun peserta sebelumnya sudah pernah selesai vaksin lain.
   - Button menampilkan status proses supaya error lebih jelas.

2. Import peserta vaksinasi dari satu database multi produk
   - Jika satu Excel berisi banyak jenis vaksin di kolom BatchName, sistem tetap membuat satu database/source saja.
   - Saat import peserta ke session/lokasi, peserta yang sama digabung menjadi satu registrasi.
   - Produk/vaksin peserta dibuat otomatis dari BatchName masing-masing row.
   - Mapping auto detect:
     influenza/flu/vaxigrip -> produk influenza/vaxigrip
     typhoid/typhim/tifoid/tipes -> produk typhoid/typhim
     dengue/qdenga/dbd -> produk dengue/qdenga
   - Lot number tetap diambil dari setup daftar vaksin & lot pada session.

3. Session Locations
   - Participant count sekarang menghitung peserta unik, bukan jumlah row vaksin.
   - Metadata lokasi tetap berdasarkan location + date + time slot, sehingga 3 vaksin di lokasi/jam yang sama tidak membuat session terpisah.

Cara pakai data BINUS agar tidak terpisah database:
- Gabungkan file FLU, TYPHOID, DENGUE ke satu Excel dengan header yang sama.
- Pastikan kolom BatchName tetap ada dan berisi jenis vaksin per row.
- Import satu Excel tersebut sebagai satu database vaksinasi.
- Buat session dari database tersebut berdasarkan lokasi/time slot.
- Di session, tambahkan semua produk dan lot yang tersedia.
- Klik Import Peserta dari Database; sistem akan auto-detect produk yang didapat setiap peserta berdasarkan BatchName.

Tidak perlu SQL baru jika v57 sudah dijalankan.

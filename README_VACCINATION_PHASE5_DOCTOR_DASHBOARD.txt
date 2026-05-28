VACCINATION PHASE 5 - DOCTOR FILTER AND DASHBOARD EXPORT

Perubahan:
1. Administered/Medis:
   - Tambah field Nama dokter/petugas.
   - Simpan ke vaccination_records.administered_by.
   - Tambah section "Peserta Sudah Selesai".
   - Filter selesai berdasarkan dokter/petugas.
   - Search nama/antrian/vaksin.

2. Dashboard Vaksinasi:
   - Halaman baru /vaccination/dashboard.
   - Filter session, database corporate, status.
   - Status:
     all, done, not_done, no_queue, waiting.
   - Export CSV:
     Export Semua
     Export Sudah
     Export Belum
     Export Filter Aktif

Install:
1. Extract ZIP ke root project Next.js.
2. npm run build
3. git add app\api\vaccination app\vaccination
4. git commit -m "add vaccination doctor filter and dashboard export"
5. git push origin feature/vaccination-module

Catatan:
- Tidak perlu SQL baru karena memakai field existing vaccination_records.administered_by.

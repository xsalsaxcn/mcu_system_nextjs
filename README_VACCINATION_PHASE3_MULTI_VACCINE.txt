VACCINATION PHASE 3 - MULTI VACCINE PER SESSION

Tujuan:
1. Satu session/perusahaan bisa memiliki lebih dari 1 vaksin.
2. Setiap vaksin punya lot number masing-masing.
3. Saat Done di medis:
   - 1 vaksin = 1 vaccination_record
   - 2 vaksin = 2 vaccination_record
   - sticker print juga 1 per vaksin
4. Sticker label tetap ukuran 70mm x 35mm.

Install:
1. Jalankan sql_vaccination_phase3_multi_vaccine.sql di Supabase SQL Editor.
2. Extract ZIP ke root project Next.js.
3. npm run build
4. git add ...
5. git commit -m "add multi vaccine session and multi sticker print"
6. git push origin feature/vaccination-module

Flow:
- /vaccination/master
  Buat master vaksin dan lot number.
- /vaccination/session
  Buat session. Tambahkan semua vaksin + lot untuk session tersebut.
- /vaccination/register
  Import peserta corporate.
- /vaccination/administer
  Pilih peserta. Daftar vaksin session otomatis muncul. Klik Done + Print Semua Sticker.

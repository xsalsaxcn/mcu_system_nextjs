INSTALL VACCINATION MODULE PHASE 1

1) Jalankan SQL:
- Buka Supabase SQL Editor
- Paste isi sql_vaccination_phase1.sql
- Run

2) Extract ZIP ini ke root project:
C:\Users\Lenovo\Documents\mcu_system_nextjs

3) Build:
npm run build

4) Commit:
git add app\vaccination app\api\vaccination
git commit -m "add corporate vaccination module phase 1"
git push origin main

5) Alur test:
- /vaccination/master -> tambah vaksin dan lot
- /vaccination/session -> buat session
- /vaccination/register -> registrasi peserta
- /vaccination/queue -> panggil antrian
- /vaccination/administer -> Done + Print Sticker
- Public queue dari token session

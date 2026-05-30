HARMONY OPERATOR ROLE FIX

Tujuan:
1. Akun operator tidak lagi melihat dashboard admin selector.
2. Akun operator hanya melihat:
   - Dashboard Operator
   - Form sesuai program/post
3. Menu hamburger disembunyikan untuk operator.
4. Admin/supervisor tetap melihat dashboard operasional dan menu lengkap.
5. Fungsi form lama tetap dipakai, jadi fitur edit, lihat score, belum/selesai, dan QR tetap aman.

File yang diganti:
- components/AppShell.tsx
- app/dashboard/page.tsx

Install langsung ke main:

cd /d "C:\Users\Lenovo\Documents\mcu_system_nextjs"

git checkout main
git pull --rebase origin main

powershell -Command "Expand-Archive -Path $env:USERPROFILE\Downloads\harmony_operator_role_fix_patch.zip -DestinationPath . -Force"

npm run build

git status
git add components\AppShell.tsx app\dashboard\page.tsx README_HARMONY_OPERATOR_ROLE_FIX.txt
git commit -m "restore operator specific dashboard and menu"
git push origin main

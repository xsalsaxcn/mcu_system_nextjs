HARMONY UI FIX V2 - MAIN HOTFIX

Tujuan:
1. Menghapus header dobel di dashboard.
2. Dashboard tidak lagi berlevel di dalam layar karena AppShell sudah menangani header.
3. Menu hamburger memakai path lama berbasis slug Indonesia agar tidak 404 seperti /import atau /parameters.
4. Patch ini ditujukan langsung untuk branch main.

Cara pakai langsung ke main:

cd /d "C:\Users\Lenovo\Documents\mcu_system_nextjs"

git checkout main
git pull --rebase origin main

powershell -Command "Expand-Archive -Path $env:USERPROFILE\Downloads\harmony_ui_fix_v2_main_hotfix.zip -DestinationPath . -Force"

npm run build

git status
git add components\AppShell.tsx app\dashboard\page.tsx README_HARMONY_UI_FIX_V2_MAIN_HOTFIX.txt
git commit -m "fix harmony dashboard layout and menu routes"
git push origin main

Catatan penting:
- Jika masih ada menu yang 404, jalankan:
  powershell -Command "Get-ChildItem -Recurse app -Filter page.tsx | ForEach-Object { $_.FullName.Replace((Get-Location).Path + '\app\','').Replace('\page.tsx','').Replace('\','/') }"
- Kirim hasilnya agar href menu disesuaikan 100% dengan route project.

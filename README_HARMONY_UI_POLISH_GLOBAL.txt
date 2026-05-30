HARMONY UI POLISH GLOBAL PATCH

Patch ini memperbaiki tampilan yang terlihat plain/jelek tanpa mengubah logic halaman.

File yang diganti:
- components/AppShell.tsx
- app/globals.css

Perbaikan:
1. Header lebih rapi dan profesional.
2. Encoding rusak seperti "a~ Menu" dan "A-" dihindari dengan karakter ASCII.
3. Menu tetap memakai URL asli dari build.
4. Global CSS merapikan input, select, button, card, table, dan wrapper halaman.
5. Fungsi halaman tidak diubah.

Cara install langsung ke main:

cd /d "C:\Users\Lenovo\Documents\mcu_system_nextjs"

git checkout main
git pull --rebase origin main

powershell -Command "Expand-Archive -Path $env:USERPROFILE\Downloads\harmony_ui_polish_global_patch.zip -DestinationPath . -Force"

npm run build

git status
git add components\AppShell.tsx app\globals.css README_HARMONY_UI_POLISH_GLOBAL.txt
git commit -m "polish harmony global ui"
git push origin main

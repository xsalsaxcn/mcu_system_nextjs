Mobile menu portrait fix v74

Run from project root:

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\apply_mobile_menu_portrait_fix_v74.ps1
npm run build

Then commit:

git add app\globals.css scripts\apply_mobile_menu_portrait_fix_v74.ps1 README_MOBILE_MENU_V74.txt
git commit -m "fix mobile portrait hamburger menu"
git push origin main

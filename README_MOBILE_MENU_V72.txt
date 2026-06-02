Mobile hamburger menu fullscreen fix v72

Run from project root:

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\apply_mobile_menu_fullscreen_v72.ps1
npm run build
npm run dev

Then commit and push:

git add components\AppShell.tsx app\globals.css
git commit -m "fix mobile hamburger fullscreen menu"
git push origin main

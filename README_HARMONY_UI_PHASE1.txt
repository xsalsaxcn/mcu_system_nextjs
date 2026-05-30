HARMONY UI PHASE 1 PATCH

Tujuan:
1. Rename sistem dari "MCU System" menjadi "Harmony Health App".
2. Dashboard utama menjadi dashboard selector:
   - Vaksinasi Perusahaan
   - MCU CAPASKA
   - MCU Corporate
   Lalu pilih database/session dan klik Tampilkan Dashboard.
3. Section vaksinasi tidak lagi jadi card tempelan di body Dashboard MCU.
4. Tambah hierarchical hamburger component:
   components/HarmonyMenu.tsx
5. Tambah reusable login panel:
   components/HarmonyLoginPanel.tsx

File diganti:
- app/dashboard/page.tsx
- app/vaccination/page.tsx
- app/layout.tsx

File baru:
- components/HarmonyMenu.tsx
- components/HarmonyLoginPanel.tsx

Cara install:
1. Extract ZIP ke root project:
   cd /d "C:\Users\Lenovo\Documents\mcu_system_nextjs"
   powershell -Command "Expand-Archive -Path $env:USERPROFILE\Downloads\harmony_ui_phase1_patch.zip -DestinationPath . -Force"

2. Build:
   npm run build

3. Commit:
   git status
   git add app\dashboard\page.tsx app\vaccination\page.tsx app\layout.tsx components\HarmonyMenu.tsx components\HarmonyLoginPanel.tsx README_HARMONY_UI_PHASE1.txt
   git commit -m "redesign dashboard selector and harmony branding"
   git push origin feature/vaccination-module

Penting untuk hamburger global:
- Patch ini membuat component HarmonyMenu dan sudah dipakai di app/dashboard/page.tsx serta app/vaccination/page.tsx.
- Agar tombol Menu di header lama juga berubah di semua halaman, perlu edit file shell/header asli.
- Cari file header:
  findstr /s /n /i "MCU System Menu Logout" app components
- Kirim hasil command itu, nanti bisa dibuatkan fullscript exact untuk mengganti header lama menjadi Harmony Health App + hierarchical menu.

Penting untuk login:
- Patch ini menyediakan components/HarmonyLoginPanel.tsx.
- Agar login page berubah total, perlu edit file AuthGate asli.
- Cari file login:
  findstr /s /n /i "Login sesuai role petugas User awal admin123" app components
- Kirim hasil command itu, nanti bisa dibuatkan fullscript exact untuk AuthGate/login.

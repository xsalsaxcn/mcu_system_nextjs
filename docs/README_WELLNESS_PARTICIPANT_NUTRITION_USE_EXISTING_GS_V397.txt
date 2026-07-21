WELLNESS_PARTICIPANT_NUTRITION_USE_EXISTING_GS_V397

Patch ini memakai Apps Script yang sudah benar, yaitu script dengan marker:
WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370

Tidak perlu paste Apps Script baru.

Yang dilakukan route nutrition:
1. Kalau ada foto makanan, kirim ke Apps Script dengan action=uploadEvidence.
2. Apps Script menyimpan foto ke Google Drive folder wellness program / Company / Peserta / Nutrisi.
3. Route append row ke Google Sheet Form Responses memakai payload row.
4. Route mirror log ke Supabase wellness_food_logs agar dashboard peserta tetap bisa menghitung Calories In.
5. Kalori makanan otomatis dicari dari wellness_food_calories berdasarkan food_name dan aliases.

Env yang harus ada di Vercel Production:
WELLNESS_GOOGLE_SHEET_WEBHOOK_URL=https://script.google.com/macros/s/xxx/exec
WELLNESS_GOOGLE_SHEET_WEBHOOK_SECRET=wellness-2026-secret
WELLNESS_GOOGLE_SHEET_TAB_NAME=Form Responses

Apps Script Properties harus punya:
WELLNESS_WEBHOOK_SECRET=wellness-2026-secret
WELLNESS_DRIVE_ROOT_FOLDER_NAME=wellness program
Opsional: WELLNESS_DRIVE_FOLDER_ID atau WELLNESS_GOOGLE_DRIVE_FOLDER_ID

Setelah apply:
1. Jalankan docs\wellness_participant_nutrition_use_existing_gs_v397.sql di Supabase SQL Editor.
2. npm run build
3. git add -- app/api/wellness/participant/nutrition/route.ts docs/wellness_participant_nutrition_use_existing_gs_v397.sql docs/README_WELLNESS_PARTICIPANT_NUTRITION_USE_EXISTING_GS_V397.txt
4. git commit -m "Use existing Google Sheet Drive webhook for participant nutrition"
5. git push origin main

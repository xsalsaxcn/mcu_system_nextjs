# WELLNESS_GOOGLE_DRIVE_FOLDER_FIX_V369

Patch ini memperbaiki error Apps Script:

```text
Unexpected error while getting the method or property getFolderById on object DriveApp.
```

Penyebab paling umum:

- `WELLNESS_DRIVE_FOLDER_ID` belum diisi di Script Properties.
- Yang ditempel adalah URL folder penuh, bukan folder ID.
- Web App belum di-deploy dengan `Execute as: Me`.
- Folder Drive tidak bisa diakses oleh akun yang menjalankan Apps Script.
- Apps Script masih memakai deployment versi lama.

Perbaikan v369:

- Apps Script menerima folder ID murni **atau** URL folder Google Drive.
- Error folder dibuat lebih jelas.
- Ditambah `doGet` health-check.
- Ditambah fungsi `testWellnessDriveFolder()` untuk dites langsung dari Apps Script.
- Tidak mengubah SQL/database.
- Tidak menyentuh MCU, CAPASKA, Corporate MCU, atau Vaksinasi.

## Cara pakai

1. Buka file:

```cmd
notepad docs\wellness_google_sheet_webhook_v369.gs
```

2. Copy semua isi file ke Google Sheet > Extensions > Apps Script.

3. Di Apps Script > Project Settings > Script properties, isi:

```text
WELLNESS_WEBHOOK_SECRET = wellness-2026-secret
WELLNESS_DRIVE_FOLDER_ID = 11iUlg15_cz-4GcXg_h7KWHTCBgIPOXE
```

Boleh juga isi `WELLNESS_DRIVE_FOLDER_ID` dengan URL folder penuh, karena v369 akan otomatis mengambil ID folder dari URL.

4. Deploy ulang:

```text
Deploy > Manage deployments > Edit > Version: New version > Deploy
```

Pastikan:

```text
Execute as: Me
Who has access: Anyone with the link
```

5. Buka Web App URL `/exec` di browser. Harus muncul JSON dengan:

```json
"folderAccessible": true
```

Kalau `folderAccessible` masih `false`, berarti Drive folder belum bisa diakses oleh akun Apps Script atau Script Property belum benar.

# WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370

Patch ini memperbaiki Apps Script Google Drive upload untuk Wellness ketika `DriveApp.getFolderById()` gagal meskipun `WELLNESS_DRIVE_FOLDER_ID` sudah benar.

Perubahan utama:
- Marker: `WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370`
- Apps Script mencoba `WELLNESS_DRIVE_FOLDER_ID` terlebih dahulu.
- Jika gagal, script fallback mencari folder berdasarkan nama `wellness program` atau `WELLNESS_DRIVE_ROOT_FOLDER_NAME`.
- Jika folder belum ada, script membuat folder root di My Drive.
- Upload tetap membuat struktur:
  - `wellness program / Nama Perusahaan / KODE - Nama Karyawan / Nutrisi|Workout|Health Talk`
- File tetap disimpan di Google Drive, bukan Supabase Storage.
- Aplikasi hanya menyimpan URL bukti.

Catatan penting:
- Jangan menjalankan `uploadEvidenceToDrive` atau `getOrCreateFolder` langsung dari dropdown Apps Script karena fungsi tersebut membutuhkan payload/argumen dari aplikasi.
- Untuk test, jalankan `testWellnessDriveFolder`, `testDriveAccess`, atau buka Web App URL `/exec`.

Script properties yang disarankan:
- `WELLNESS_WEBHOOK_SECRET = wellness-2026-secret`
- `WELLNESS_DRIVE_FOLDER_ID = 11iUlg15_cz-4GcXg_h7KWHTCBgIPOXE` opsional bila folder ID bisa diakses.
- `WELLNESS_DRIVE_ROOT_FOLDER_NAME = wellness program` sebagai fallback by name.

Setelah copy script ke Apps Script, deploy ulang Web App sebagai:
- Execute as: Me
- Who has access: Anyone with the link

# WELLNESS_GOOGLE_DRIVE_FOLDER_STRUCTURE_V368

Patch ini membuat upload bukti Wellness otomatis tersimpan di Google Drive dengan struktur folder:

```text
<Root Wellness Folder>
└── <Nama Perusahaan>
    └── <KODE - Nama Karyawan>
        ├── Nutrisi
        ├── Workout
        └── Health Talk
```

Contoh:

```text
wellness program
└── PT Guntner Indonesia
    └── 278 - Adin Sugiyanto
        └── Nutrisi
            └── 2026-06-27T... - foto-sarapan.jpg
```

## Yang berubah

- Tombol upload di Input Harian tetap ada.
- File bukti disimpan ke Google Drive, bukan Supabase Storage.
- Aplikasi hanya menyimpan URL hasil upload.
- Google Sheet tetap menerima URL bukti dan preview image menggunakan formula `IMAGE()`.
- Apps Script otomatis membuat folder perusahaan, folder karyawan, dan subfolder kategori bukti.
- Kategori otomatis berdasarkan field:
  - `photo_url` -> `Nutrisi`
  - `activity_evidence_url` -> `Workout`
  - `healthtalk_evidence_url` -> `Health Talk`

## Setup root folder Drive

Folder Drive yang diberikan user:

```text
https://drive.google.com/drive/u/0/folders/11iUlg15_cz-4GcXg_h7KWHTCBgIPOXE
```

Folder ID-nya:

```text
11iUlg15_cz-4GcXg_h7KWHTCBgIPOXE
```

Masukkan ke Apps Script:

```text
Project Settings > Script properties > Add script property
Property: WELLNESS_DRIVE_FOLDER_ID
Value: 11iUlg15_cz-4GcXg_h7KWHTCBgIPOXE
```

Secret tetap:

```text
Property: WELLNESS_WEBHOOK_SECRET
Value: wellness-2026-secret
```

## Update Apps Script

Copy isi file ini:

```cmd
notepad docs\wellness_google_sheet_webhook_v368.gs
```

Paste ke Google Sheet > Extensions > Apps Script, lalu Deploy ulang sebagai Web App.

## Catatan

Agar image preview bisa tampil di aplikasi dan Google Sheet, file perlu bisa dilihat oleh link. Script akan mencoba set `Anyone with the link can view`. Jika kebijakan Workspace membatasi public sharing, URL tetap tersimpan, tetapi preview gambar bisa gagal tampil.

Patch ini tidak mengubah SQL dan tidak menyentuh MCU, CAPASKA, Corporate MCU, atau Vaksinasi.

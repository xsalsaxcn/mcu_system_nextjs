# Corporate MCU Google Drive Assets V401

Perubahan ini khusus untuk **AI MCU Analyzer → Generate PDF MCU Corporate**.
CAPASKA, Vaksinasi, Wellness, dan renderer/layout PDF existing tidak diubah.

## Tujuan

Bulk upload berikut disimpan langsung ke Google Drive, bukan Supabase Storage:

- Foto Profile
- Foto Rontgen / Thorax
- Lampiran EKG
- Lampiran Treadmill
- Lampiran Spirometri
- Lampiran Audiometri
- Lampiran USG

## Alur penyimpanan

1. Admin memilih jenis file yang akan diupload.
2. Nama file dibaca dengan format `NOMCU-NAMA PESERTA.ext`.
3. Sistem memvalidasi pasangan **No MCU + nama peserta** pada database Corporate yang dipilih.
4. Hanya pasangan yang cocok tepat satu kali yang dikirim ke Google Drive.
5. File mismatch/ambigu tidak dikirim dan tidak dipasang ke peserta mana pun.
6. File biner hanya tersimpan di Google Drive.
7. Supabase Storage sama sekali tidak digunakan.
8. Pada `ai_mcu_import_rows.row_data` hanya disimpan referensi kecil `gdrive://fileId`, URL Drive, dan metadata matching agar PDF Engine mengetahui file milik peserta yang benar.

## Folder Google Drive

Folder induk memakai konfigurasi Google Drive MCU yang sudah ada. Urutan pembacaan:

1. `AI_MCU_GOOGLE_DRIVE_FOLDER_ID`
2. `AI_MCU_GOOGLE_DRIVE_FOLDER_URL`
3. `AI_MCU_GDRIVE_BASE_FOLDER`
4. `GDRIVE_BASE_FOLDER`
5. `GOOGLE_DRIVE_FOLDER_ID`
6. Fallback `APP_CONFIG.outputFolderId` pada renderer Corporate existing

Struktur folder otomatis:

```text
[FOLDER MCU EXISTING]
└── MCU Corporate
    └── [Nama Database / Perusahaan]
        └── Lampiran Peserta
            ├── Foto Profile
            │   └── 047 - AGUS NUGROHO
            ├── Foto Rontgen - Thorax
            │   └── 047 - AGUS NUGROHO
            ├── Lampiran EKG
            ├── Lampiran Treadmill
            ├── Lampiran Spirometri
            ├── Lampiran Audiometri
            └── Lampiran USG
```

File re-upload untuk peserta dan jenis yang sama akan mengganti file canonical yang sama, sehingga Drive tidak dipenuhi duplikasi.

## Kredensial Google Drive

Python MCU Engine menggunakan konfigurasi yang sudah ada:

- `GDRIVE_CREDENTIALS`, berupa path file JSON, JSON langsung, atau base64 JSON; atau
- `GOOGLE_APPLICATION_CREDENTIALS`.

Pastikan folder induk Google Drive sudah dibagikan sebagai Editor kepada service account yang digunakan.

## Referensi gambar pada PDF

Referensi disimpan sebagai:

```text
gdrive://FILE_ID
```

Saat generate PDF, Python Engine mengunduh file asli melalui Google Drive API dan mengubahnya menjadi data URI. Karena itu:

- file tidak perlu dibuat public;
- kualitas gambar asli dipertahankan;
- foto peserta tidak bergantung pada direct public URL;
- layout/header/footer PDF tidak berubah.

## File yang berubah

```text
app/ai-mcu/corporate/generate/page.tsx
app/api/ai-mcu/corporate/assets/upload/route.ts
app/api/ai-mcu/corporate/generate-pdf/route.ts
services/mcu-engine/main.py
services/mcu-engine/core/pdf_service_gs_port.py
services/mcu-engine/core/corporate_drive_assets.py
```

## Pengujian

- `npx tsc --noEmit` berhasil.
- Next.js production compilation berhasil dan masuk tahap lint/type validation.
- Python syntax check berhasil.
- Helper parsing Google Drive file/folder ID berhasil.

Pengujian upload nyata memerlukan kredensial Google Drive dan akses ke folder deployment milik inHARMONY.

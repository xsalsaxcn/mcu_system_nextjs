# WELLNESS_DAILY_INPUT_PRO_V360

Patch ini merapikan Input Harian Wellness dengan inspirasi dari form Monitoring Nutrisi & Aktifitas.

## Yang berubah

- `app/wellness/input/page.tsx`
  - Tampilan dibuat menjadi 4 tab: Nutrisi, BB & Lingkar Perut, Aktivitas, Healthtalk/Seminar.
  - Selector peserta lebih jelas: KODE, Nama, Risk Cluster, Company > Kelompok > Group.
  - Field bukti memakai link bukti/foto, supaya tidak tergantung storage dulu.
  - Ada panduan point di sisi kanan.

- `app/api/wellness/daily-log/route.ts`
  - Bisa menerima log nutrisi, BB, aktivitas, dan healthtalk.
  - Menyimpan point ke `wellness_point_logs` bila SQL v360 sudah dijalankan.
  - Menyimpan evidence/link bukti ke `wellness_daily_evidence` bila SQL v360 sudah dijalankan.
  - Tidak menyentuh modul MCU, CAPASKA, Corporate MCU, atau Vaksinasi.

- `sql/wellness_daily_evidence_points_v360.sql`
  - Membuat tabel additive khusus Wellness:
    - `wellness_daily_evidence`
    - `wellness_healthtalk_logs`
    - `wellness_point_logs`

## Catatan

Fitur upload file binary belum diaktifkan karena perlu keputusan storage bucket. Untuk tahap aman, peserta/admin menempel link bukti dari Google Drive, WhatsApp media, Strava, atau folder perusahaan.

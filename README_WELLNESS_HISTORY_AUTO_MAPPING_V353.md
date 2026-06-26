# WELLNESS_HISTORY_AUTO_MAPPING_V353

Patch khusus modul Wellness untuk menambahkan fitur Auto Mapping pada halaman Import History Pemeriksaan MCU.

## Ruang lingkup

File yang berubah:

- `app/wellness/history-import/page.tsx`
- `app/api/wellness/history/import/route.ts`
- `README_WELLNESS_HISTORY_AUTO_MAPPING_V353.md`

Tidak ada perubahan SQL.
Tidak menyentuh MCU, CAPASKA, Corporate MCU, Vaksinasi, atau modul database non-Wellness.

## Fitur baru

Pada halaman `/wellness/history-import`, setelah file baseline/history MCU dipilih, user bisa klik tombol **Auto Mapping**.

Auto Mapping akan:

1. Membaca sheet Excel.
2. Mendeteksi baris header secara otomatis.
3. Mencocokkan kolom Excel dengan field sistem Wellness.
4. Menampilkan tabel mapping yang bisa dikoreksi manual.
5. Mengirim hasil mapping ke API saat tombol **Import History MCU** diklik.

## Kolom wajib yang dimapping

- `KODE / No Karyawan`
- `Nama Karyawan`
- `Tanggal Periksa`

## Kolom klinis yang didukung

- `NO. LAB`
- `Nama Grup / Risk Cluster`
- `Risk Level`
- `Selection Reason`
- `HbA1c Raw`
- `HbA1c %`
- `Tensi Raw`
- `Sistolik`
- `Diastolik`
- `BMI / IMT`
- `BB / Berat Badan`
- `TB / Tinggi Badan`
- `Lingkar Perut`
- `Gula Darah`
- `Risk Score`
- `Fokus Intervensi`
- `Monitoring Day-by-Day`
- `Catatan Validasi Medis`
- `Status Program`

## Catatan teknis

API `/api/wellness/history/import` sekarang menerima FormData field opsional:

```text
column_mapping
```

Isinya JSON object dengan bentuk:

```json
{
  "employee_code": "KODE",
  "participant_name": "Nama Karyawan",
  "checkup_date": "Tanggal Periksa",
  "hba1c_percent": "HbA1c %"
}
```

Jika mapping tidak dikirim, API tetap memakai fallback alias lama sehingga import lama tetap kompatibel.

# WELLNESS_PARTICIPANT_CHARTS_V351

Patch ini hanya menyentuh modul Wellness:

- `app/wellness/dashboard/page.tsx`
- `app/api/wellness/dashboard/route.ts`

Tidak ada perubahan SQL dan tidak menyentuh modul MCU, CAPASKA, Corporate MCU, atau Vaksinasi.

## Isi perubahan

1. Dashboard Wellness menampilkan panel **Grafik Parameter Per Peserta**.
2. User dapat memilih peserta dari dropdown atau tombol **Lihat grafik** pada tabel monitoring.
3. Grafik membaca data dari baseline dan log Wellness existing:
   - Berat badan
   - BMI
   - Tekanan darah sistolik/diastolik
   - HbA1c
   - Gula darah
   - Lingkar perut
   - Nutrisi harian / kalori food log
   - Workout calories
   - Workout duration
4. API `/api/wellness/dashboard` sekarang mengirim object `parameter_charts` per peserta.
5. Bila data trend belum cukup, kartu grafik tetap muncul dengan pesan belum ada data.

## Catatan

Grafik HbA1c, gula darah, tensi, dan lingkar perut akan semakin lengkap setelah data Mini MCU / history pemeriksaan di-import ke tabel Wellness. Untuk saat ini grafik memakai data baseline dan log Wellness yang sudah tersedia.

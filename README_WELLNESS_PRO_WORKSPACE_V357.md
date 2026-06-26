# WELLNESS_PRO_WORKSPACE_V357

Patch khusus modul Wellness untuk merapikan struktur aplikasi dan tampilan dashboard agar lebih profesional.

## Prinsip isolasi

Patch ini tidak mengubah SQL dan tidak mengubah database. Tidak ada perubahan ke route/API MCU CAPASKA, MCU Corporate, atau Vaksinasi.

## File yang berubah

- `app/wellness/dashboard/page.tsx`
- `app/wellness/import/page.tsx`
- `app/api/wellness/import/participants/route.ts`
- `app/dashboard/page.tsx` hanya blok tampilan Wellness pada dashboard operasional
- `components/AppShell.tsx` hanya daftar menu Wellness
- `components/HarmonyMenu.tsx` hanya daftar menu Wellness

## Perubahan utama

1. Menambahkan struktur menu Wellness yang berurutan:
   - Dashboard Wellness
   - Setting Parameter
   - Import Peserta
   - Import History MCU
   - Input Harian
   - Master Kalori
   - Signup Peserta
   - Profil Wellness

2. Merapikan dashboard khusus `/wellness/dashboard` menjadi Wellness Command Center:
   - summary cards
   - menu workflow
   - grafik per peserta
   - tabel profesional dengan kolom Peserta, Scope Program, Baseline MCU, Progress Terakhir, Risiko, Aktivitas, Aksi

3. Merapikan blok Wellness di `/dashboard` agar tabel tidak aneh/tumpang tindih:
   - kolom tidak bergeser
   - risk cluster tidak terlihat seperti nama bila import sudah benar
   - aksi diarahkan ke Workspace Wellness

4. Fix mapping import peserta:
   - Kolom `Nama Grup` tidak lagi terbaca sebagai `Nama peserta`.
   - Untuk nama peserta, sistem memprioritaskan `Nama Karyawan`, `Nama Peserta`, `Nama Lengkap`, `Employee Name`.
   - Jika Group Upload sudah dipilih, kolom Departemen/Divisi dari Excel tidak akan mengubah scope upload.
   - `Nama Grup` dibaca sebagai Risk Cluster bila ada.

5. Halaman import menampilkan detail error/skipped row supaya penyebab gagal import terlihat.

## Catatan data yang sudah terlanjur salah

Jika sebelum patch ada peserta yang namanya berisi `Grup A - Triple Risk`, itu berasal dari import lama yang membaca `Nama Grup` sebagai `Nama`. Setelah patch, import ulang dari Excel yang benar akan mencegah kejadian ini.

Untuk data yang sudah terlanjur salah, opsi paling aman adalah hapus baris import salah untuk company/kelompok/group tersebut lalu import ulang setelah patch.

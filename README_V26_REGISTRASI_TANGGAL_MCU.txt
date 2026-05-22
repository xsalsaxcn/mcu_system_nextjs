Patch v26 - Registrasi Ulang: Tanggal MCU

Perubahan:
- Field tanggal di Retrieve Data Registrasi Ulang bukan lagi "Tanggal Lahir".
- Diubah menjadi "Tanggal MCU".
- Query API tidak lagi filter birth_date/date_of_birth.
- Query API sekarang filter examination_date/exam_date.

File yang perlu upload/replace:
1. app/registrasi-ulang/page.tsx
2. app/api/registrasi-ulang/search/route.ts

Cara pasang:
1. Upload/replace kedua file di atas.
2. Commit changes.
3. Tunggu Vercel Ready + Current.
4. Logout-login admin.
5. Hard refresh Ctrl + Shift + R.

Tanda aktif:
Registrasi Ulang v26 · Tanggal MCU · retrieve data · foto · edit data

Catatan:
Tanggal lahir tetap ada di form Edit Data Identitas.
Yang berubah hanya field filter/retrieve di bagian atas menjadi Tanggal MCU.

# MCU System - Next.js + Supabase + Vercel

Starter ini menggantikan Streamlit agar UI lebih responsif di mobile dan tidak reload seluruh aplikasi setiap interaksi.

## Fitur
- Login page custom dari tabel `users`
- Role-based menu/dashboard
- Supabase PostgreSQL connection via server-side API routes
- Admin import database peserta dengan auto-detect header Excel
- Operator input CAPASKA sesuai `post_id`
- Progress stage CAPASKA
- Review hasil dokter/supervisor
- Responsive mobile UI
- Siap deploy ke Vercel Free/Hobby

## Cara setup

### 1. Supabase
Jalankan file SQL:

```text
sql/supabase_schema.sql
```

di Supabase SQL Editor.

Ini membuat tabel dasar, admin default, stage CAPASKA, operator, parameter minimal, dan reviewer.

Login awal:
```text
admin / admin123
```

### 2. Environment Vercel
Tambahkan environment variables:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
APP_SECRET
NEXT_PUBLIC_APP_NAME
```

Gunakan `SUPABASE_SERVICE_ROLE_KEY` hanya di Vercel Environment Variables, jangan upload ke GitHub.

### 3. Local run
```bash
npm install
cp .env.example .env.local
npm run dev
```

### 4. Deploy Vercel Free
Upload project ke GitHub, import repo ke Vercel, isi environment variables, lalu deploy.

## Catatan
- Starter ini menggunakan API routes server-side supaya service role key tidak bocor ke browser.
- QR/PDF/Excel belum dibuat permanen. Untuk tetap gratis, barcode/PDF sebaiknya dibuat on-demand.
- Password user masih mengikuti sistem lama: plain text di tabel `users`. Untuk production, migrasikan ke password hashing atau Supabase Auth.

# Corporate Setup Persistence V411

Perubahan ini membuat tombol **Simpan Setup** menyimpan nama petugas ke Supabase berdasarkan database MCU Corporate (`source_id`).

## File

- `app/api/ai-mcu/corporate/setup/route.ts`
- `app/ai-mcu/corporate/generate/page.tsx`
- `sql/corporate_mcu_pdf_setup_v411.sql`

## Aktivasi

1. Buka Supabase Dashboard -> SQL Editor.
2. Jalankan isi `sql/corporate_mcu_pdf_setup_v411.sql` satu kali.
3. Commit dan deploy dua file aplikasi di atas beserta file SQL sebagai dokumentasi.
4. Buka halaman Corporate, pilih database, isi nama petugas, lalu klik **Simpan Setup**.
5. Refresh halaman. Setup harus muncul kembali.

Browser localStorage tetap digunakan sebagai fallback sementara jika API/Supabase tidak dapat diakses.

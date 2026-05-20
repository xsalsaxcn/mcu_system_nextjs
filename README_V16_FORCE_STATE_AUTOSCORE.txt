Patch v16 - Force State AutoScore

Perbaikan utama dibanding v15:
- Value dan Score tidak lagi dihitung sebagai derived render saja.
- Saat dropdown dipilih, state langsung diisi dengan Value dan Total Score.
- parseOptions mendukung config_json dalam bentuk string JSON maupun array Supabase.
- Saat masuk form, semua pilihan tetap kosong.
- Badge baru: AutoScore v16 aktif · force state update.

Cara pasang:
1. Upload/replace app/input/page.tsx ke GitHub.
2. Commit changes.
3. Tunggu Vercel deployment terbaru Ready + Current.
4. Logout-login operator.
5. Hard refresh Ctrl + Shift + R.

Tidak perlu run SQL lagi.

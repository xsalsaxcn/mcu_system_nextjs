# V64 Vaccination Manual BatchName Mapping

Patch ini khusus area Vaksinasi. MCU Corporate dan CAPASKA tidak diubah.

Perubahan utama:
- Tidak ada auto-detect vaksin dari BatchName.
- Session Setup menampilkan mapping manual: `BatchName di database` -> `Vaksin/Lot Session`.
- Import peserta vaksinasi hanya memakai mapping manual tersebut.
- Jika BatchName belum dimapping, peserta/item tidak akan otomatis diberi semua vaksin.

Wajib jalankan SQL:

```txt
sql_vaccination_v64_manual_batch_mapping.sql
```

Catatan:
- Data yang sudah terlanjur salah mapping harus dihapus session/registrasinya lalu import ulang.
- Setelah membuat session, pastikan semua BatchName sudah dipetakan sebelum klik Import Peserta dari Database di Registrasi.

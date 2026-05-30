# CAPASKA Scoring 2026 V3 - Reference Rules

Patch ini memperbaiki scoring agar mengikuti tabel referensi per pemeriksaan, bukan menganggap semua abnormal sebagai red flag.

## Prinsip utama

1. Skor biasa mengikuti angka di tabel:
   - contoh: 1 caries = -1
   - 2 caries = -2
   - 3 caries = -3
   - strabismus (+)/(-) = -5
   - epistaksis ada = -1
   - radiologi ringan = -1

2. `Tidak Direkomendasikan (-10)` hanya keluar untuk baris merah di referensi.

3. Domain score dihitung dari jumlah skor asli tabel, bukan dinormalisasi otomatis `jumlah komponen * 2`.
   Ini penting karena setiap parameter punya bobot berbeda:
   - Mata ada item 3, -1, -5
   - Gigi ada item 3, 2, 1, -5
   - THT ada item 2, 1, -1
   - Ortopedi dan Radiologi ada toleransi ringan/sedang/berat

## Contoh yang dikoreksi

### Gigi - Caries Dentis
| Temuan Klinis | Skor |
|---|---:|
| 0 caries | 3 |
| 1 caries | -1 |
| 2 caries | -2 |
| 3 caries | -3 |
| >3 caries | Tidak Direkomendasikan (-10) |

### Mata
| Parameter | Temuan | Skor |
|---|---|---:|
| Lensa kontak/kaca mata | Tidak menggunakan | 3 |
| Lensa kontak/kaca mata | Menggunakan | -1 |
| Buta warna | Tidak buta warna | 3 |
| Buta warna | Parsial/Total | Tidak Direkomendasikan (-10) |
| Strabismus/Juling | (-) | 3 |
| Strabismus/Juling | (+)/(-) | -5 |
| Visus | Normal ≥6/6 | 3 |
| Visus | <6/6 - 6/12 | 2 |
| Visus | <6/12 | Tidak Direkomendasikan (-10) |

### THT
- Membran timpani tidak intak = Tidak Direkomendasikan (-10)
- Tonsil T3 = Tidak Direkomendasikan (-10)
- Weber tidak normal = Tidak Direkomendasikan (-10)
- Epistaksis ada = -1, bukan red flag

### Ortopedi / Radiologi
- Ringan = pengurangan skor biasa
- Sedang/Berat = Tidak Direkomendasikan (-10)

## File yang diganti

- `lib/shared/capaskaScoring2026.ts`

## Cara install

```bat
cd /d "C:\Users\Lenovo\Documents\mcu_system_nextjs"

powershell -Command "Expand-Archive -Path $env:USERPROFILE\Downloads\capaska_scoring_2026_v3_reference_rules_patch.zip -DestinationPath . -Force"

npm run build
```

Kalau build aman:

```bat
git status
git add lib\shared\capaskaScoring2026.ts README_CAPASKA_SCORING_2026_V3_REFERENCE_RULES.txt
git commit -m "align capaska scoring with reference rules"
git push origin feature/vaccination-module
```

## Catatan lanjutan

Rules pada gambar Penyakit Dalam terlihat kecil/blur. Patch ini sudah memasukkan rule yang terlihat jelas, tetapi untuk final 100% akurat sebaiknya gunakan file Excel/PDF asli scoring sebagai sumber tunggal.

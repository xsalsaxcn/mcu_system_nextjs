# CAPASKA Scoring 2026 Patch

Patch ini menyatukan logic scoring CAPASKA agar input, dashboard, dan export memakai satu engine yang sama:

- `lib/shared/capaskaScoring2026.ts`
- `app/input-corporate/page.tsx`
- `app/api/dashboard/route.ts`
- `app/api/dashboard/export/route.ts`

## Bobot domain baru

| Domain | Max |
|---|---:|
| Mata | 12 |
| Gigi & Mulut + Dental Panoramik | 16 |
| THT | 10 |
| Penyakit Dalam | 28 |
| Jantung & Pembuluh Darah | 12 |
| Ortopedi | 16 |
| Radiologi / Whole Spine | 6 |
| Total | 100 |

## Red flag

Jika ditemukan red flag, sistem memberi penalti `-10` satu kali dan status dashboard menjadi:

`Tidak Direkomendasikan`

Kolom tambahan di export:

- Score Sebelum Penalti
- Penalti Red Flag
- Mata
- Gigi Mulut
- THT
- Penyakit Dalam
- Jantung Pembuluh Darah
- Ortopedi
- Radiologi
- Red Flag
- Scoring Version

## Cara install

```bat
cd /d "C:\Users\Lenovo\Documents\mcu_system_nextjs"

powershell -Command "Expand-Archive -Path $env:USERPROFILE\Downloads\capaska_scoring_2026_patch.zip -DestinationPath . -Force"

npm run build
```

Kalau build aman:

```bat
git status
git add lib\shared\capaskaScoring2026.ts app\input-corporate\page.tsx app\api\dashboard\route.ts app\api\dashboard\export\route.ts README_CAPASKA_SCORING_2026.txt
git commit -m "add capaska scoring 2026"
git push origin feature/vaccination-module
```

## Catatan penting

Menu `Parameter Kelulusan` tetap dipakai untuk menentukan range lulus. Karena score sekarang 0-100, pastikan range kelulusan CAPASKA diatur sesuai kebijakan terbaru, misalnya `Min Score Lulus = 75` dan `Max Score Lulus = 100` bila itu yang akan dipakai internal.

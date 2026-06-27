# WELLNESS_NAKES_MENU_BUTTON_V373

Patch khusus Wellness untuk memunculkan tombol/menu **Input NAKES**.

## Isi perubahan

- Memastikan halaman `/wellness/nakes-input` tersedia.
- Memastikan API `/api/wellness/nakes-input` tersedia.
- Menambahkan quick nav Wellness di halaman terkait:
  - Dashboard Wellness
  - Input Harian Wellness
  - Import Peserta Wellness
  - Import History MCU
  - Landing Wellness bila ada
- Tombol yang ditambahkan:
  - Dashboard
  - Input Harian
  - Input NAKES
  - Import History MCU

## Database

Tidak mengubah tabel non-Wellness. SQL guard tetap hanya untuk `wellness_checkup_history`.

## Marker

- `WELLNESS_NAKES_MENU_BUTTON_V373`
- `WELLNESS_NAKES_GENERAL_CHECKUP_INPUT_V372_PAGE`
- `WELLNESS_NAKES_GENERAL_CHECKUP_INPUT_V372_API`

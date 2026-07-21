# WELLNESS_PARTICIPANT_OTP_STRAVA_GFIT_V376

Patch khusus Wellness untuk membuat portal peserta yang wajib OTP dan memiliki pilihan:

- Konek dengan Strava
- Konek dengan Google Fit legacy
- Sync activity otomatis ke `wellness_activity_logs`
- History workout menampilkan sumber, jenis aktivitas, durasi, kalori, dan jarak

## Catatan penting Google Fit

Google Fit REST API adalah legacy/deprecated. Untuk project baru Google mengarahkan ke Health Connect. Tombol Google Fit di patch ini tetap dibuat karena user meminta pilihan Google Fit, tetapi hanya akan bekerja jika Google Cloud project kamu sudah punya akses Google Fit API/OAuth scope.

## File yang ditambahkan

- `app/wellness/portal/page.tsx`
- `app/api/wellness/participant/request-otp/route.ts`
- `app/api/wellness/participant/verify-otp/route.ts`
- `app/api/wellness/participant/me/route.ts`
- `app/api/wellness/integrations/strava/connect/route.ts`
- `app/api/wellness/integrations/strava/callback/route.ts`
- `app/api/wellness/integrations/strava/sync/route.ts`
- `app/api/wellness/integrations/google-fit/connect/route.ts`
- `app/api/wellness/integrations/google-fit/callback/route.ts`
- `app/api/wellness/integrations/google-fit/sync/route.ts`
- `lib/wellness/portalAuth.ts`
- `sql/wellness_participant_otp_strava_gfit_v376_guard.sql`

## Environment Variables

```env
APP_SECRET=isi_secret_aplikasi_yang_panjang
WELLNESS_OTP_DEBUG=1

STRAVA_CLIENT_ID=xxxxx
STRAVA_CLIENT_SECRET=xxxxx

GOOGLE_FIT_CLIENT_ID=xxxxx
GOOGLE_FIT_CLIENT_SECRET=xxxxx
```

Callback URL Strava:

```text
https://DOMAIN-KAMU/api/wellness/integrations/strava/callback
```

Callback URL Google Fit:

```text
https://DOMAIN-KAMU/api/wellness/integrations/google-fit/callback
```

## SQL

Jalankan:

```cmd
notepad sql\wellness_participant_otp_strava_gfit_v376_guard.sql
```

Copy ke Supabase SQL Editor lalu Run.

## Portal

Buka:

```text
/wellness/portal
```


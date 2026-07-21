-- HIDE_QUICK_LOGIN_UPDATE_PASSWORD_V246
-- Run this in Supabase SQL Editor to update existing operator passwords.
-- Username tetap sama. Password lama diganti ke password baru yang disetujui.

BEGIN;

UPDATE users SET password = 'mata741!'      WHERE username = 'capaska_mata';
UPDATE users SET password = 'tht926!'       WHERE username = 'capaska_tht';
UPDATE users SET password = 'gigi583!'      WHERE username = 'capaska_gigi';
UPDATE users SET password = 'pd472!'        WHERE username = 'capaska_pd';
UPDATE users SET password = 'jantung819!'   WHERE username = 'capaska_jantung';
UPDATE users SET password = 'ortopedi634!'  WHERE username = 'capaska_ortopedi';
UPDATE users SET password = 'radiologi258!' WHERE username = 'capaska_radiologi';

COMMIT;

-- Optional check:
-- SELECT username, password FROM users WHERE username IN (
--   'capaska_mata','capaska_tht','capaska_gigi','capaska_pd',
--   'capaska_jantung','capaska_ortopedi','capaska_radiologi'
-- ) ORDER BY username;
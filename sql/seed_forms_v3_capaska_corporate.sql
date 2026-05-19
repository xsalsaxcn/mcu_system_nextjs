-- Optional SQL helper.
-- Cara paling mudah setelah deploy: login admin > Master Users > klik "Seed / Refresh Forms CAPASKA + Corporate".
-- File ini hanya catatan; seed utama sudah dilakukan oleh API /api/setup/seed-defaults.

-- Cek jumlah parameter per program:
SELECT program_type, COUNT(*) AS total_parameter
FROM parameters
GROUP BY program_type
ORDER BY program_type;

-- Cek mapping package:
SELECT packages.name AS package_name, packages.program_type, COUNT(package_parameters.id) AS total_mapped_parameters
FROM packages
LEFT JOIN package_parameters ON package_parameters.package_id = packages.id
GROUP BY packages.id, packages.name, packages.program_type
ORDER BY packages.program_type, packages.name;

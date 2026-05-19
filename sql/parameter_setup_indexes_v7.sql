-- Optional indexes untuk mempercepat setup parameter dan mapping paket.
CREATE INDEX IF NOT EXISTS idx_parameters_program_post_active
ON parameters(program_type, post_id, is_active);

CREATE INDEX IF NOT EXISTS idx_package_parameters_package
ON package_parameters(package_id);

CREATE INDEX IF NOT EXISTS idx_package_parameters_parameter
ON package_parameters(parameter_id);

CREATE INDEX IF NOT EXISTS idx_packages_program_active
ON packages(program_type, is_active);

CREATE INDEX IF NOT EXISTS idx_posts_program_active
ON posts(program_type, is_active);

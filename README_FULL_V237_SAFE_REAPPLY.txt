Harmony Health App full source V237

Included features reapplied safely:
1. CAPASKA post score popup after submit, OK returns to search.
2. Staff/petugas selector is required and single-select only.
3. Reset Hasil Form Ini is admin-only in input form.
4. Dashboard selected participant reset API/UI retained.
5. Setup Parameter has Edit Data Petugas page at /setup-parameters/staff with Ortopedi/Orthopedi alias.
6. Ortopedi scoring max is 16: Skoliosis/Kifosis/Lordosis Tidak Ada=1, Ada=-10, Ringan removed from default constants.
7. Labels renamed: Hiperekstensi Lutut and OX Knee.
8. Setup Parameter mapping list supports drag-and-drop reorder.
9. Parameter editor includes Masuk ke progress bar? stored in config_json.include_in_progress.

Safety:
- No participant data reset.
- No examination_results deletion.
- Mapping save refuses empty mapping unless allow_empty=true to prevent package losing all parameters.

After installing, run npm run build before commit. Commit explicit files only; never git add .

// WELLNESS_CANONICAL_CLINICAL_HISTORY_V126M42_7
// Satu resolver read-only untuk Portal Peserta, grafik Coach, dan kalkulator Coach.
// Supabase tetap menjadi sumber dasar; revisi NAKES Google Sheet yang sama/lebih baru
// melengkapi atau menggantikan nilai klinis pada tanggal yang sama.

export type CanonicalClinicalHistoryArgs = {
  participant: any;
  databaseRows?: any[];
  sheetRows?: any[];
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function rawPayload(row: any) {
  if (!row?.raw_payload) return {};
  if (typeof row.raw_payload === "object") return row.raw_payload;
  try {
    const parsed = JSON.parse(String(row.raw_payload));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parseNumber(value: any): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = clean(value);
  if (!text || text === "-") return null;

  const normalized = /^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text)
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNumber(...values: any[]) {
  for (const value of values) {
    const parsed = parseNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function firstText(...values: any[]) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return "";
}

export function canonicalClinicalDateKey(value: any) {
  const text = clean(value);
  if (!text) return "";

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  }

  const local = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (local) {
    return `${local[3]}-${String(local[2]).padStart(2, "0")}-${String(local[1]).padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function sheetField(row: any, ...keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && clean(value) !== "") {
      return value;
    }
  }
  return null;
}

function participantCode(participant: any) {
  return clean(
    participant?.code ||
      participant?.employee_code ||
      participant?.participant_code ||
      participant?.no_karyawan ||
      participant?.kode_karyawan ||
      participant?.nik,
  );
}

function participantId(participant: any) {
  return Number(participant?.id || participant?.participant_id || 0);
}

function isNakesSheetRow(row: any) {
  const logType = clean(sheetField(row, "Log Type", "log_type")).toLowerCase();
  const marker = clean(sheetField(row, "NAKES Sync Marker", "Marker")).toLowerCase();
  return (
    logType === "nakes_checkup" ||
    marker.includes("nakes") ||
    Boolean(
      sheetField(
        row,
        "Tinggi Badan NAKES (cm)",
        "Berat Badan NAKES (kg)",
        "Usia NAKES (tahun)",
        "NAKES History ID",
      ),
    )
  );
}

function sheetTimestamp(row: any) {
  const value = sheetField(row, "Submission Date", "Updated At", "Created At");
  const parsed = value ? new Date(String(value)) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toISOString()
    : clean(value);
}

function sortableNumber(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? String(Math.max(0, Math.trunc(parsed))).padStart(20, "0")
    : clean(value);
}

function rowDate(row: any) {
  return canonicalClinicalDateKey(
    row?.checkup_date ||
      row?.exam_date ||
      row?.log_date ||
      row?.measurement_date ||
      row?.created_at,
  );
}

function sourcePriority(row: any) {
  const raw = rawPayload(row);
  const source = clean(
    row?._canonical_source ||
      row?.source ||
      row?.visit_label ||
      raw?.source,
  ).toLowerCase();

  if (source.includes("google_sheet_nakes")) return 90;
  if (raw?.nakes_revision || raw?.nakes_source_key) return 80;
  if (source.includes("nakes") || source.includes("pemeriksaan")) return 70;
  if (source.includes("mini mcu") || source.includes("mini_mcu")) return 50;
  if (source.includes("baseline")) return 30;
  return 40;
}

export function canonicalClinicalRecencyKey(row: any) {
  const raw = rawPayload(row);
  return [
    rowDate(row),
    firstText(row?.updated_at, raw?.saved_at, row?.created_at),
    sortableNumber(raw?.nakes_revision || row?.revision || 0),
    sortableNumber(row?._canonical_sheet_row_number || row?.id || 0),
    sortableNumber(sourcePriority(row)),
  ].join("|");
}

function metricValue(row: any, ...keys: string[]) {
  const raw = rawPayload(row);
  const values: any[] = [];
  for (const key of keys) {
    values.push(row?.[key], raw?.[key]);
  }
  return firstNumber(...values);
}

export function canonicalNakesSheetRows(args: {
  participant: any;
  sheetRows?: any[];
}) {
  const id = participantId(args.participant);
  const code = participantCode(args.participant).toLowerCase();

  return (args.sheetRows || [])
    .filter((row: any) => {
      if (!isNakesSheetRow(row)) return false;
      const rowId = Number(sheetField(row, "Participant ID", "participant_id") || 0);
      const rowCode = clean(
        sheetField(row, "KODE", "Kode", "participant_code", "Kode Peserta"),
      ).toLowerCase();
      // WELLNESS_NAKES_STRICT_IDENTITY_V126M61_1
      // For rows carrying both identity keys, BOTH must match. This prevents
      // duplicate names (e.g. Teguh 145 vs 176) from sharing a crossed row.
      const hasRowId = rowId > 0;
      const hasRowCode = Boolean(rowCode);
      const idMatches = hasRowId && rowId === id;
      const codeMatches = hasRowCode && Boolean(code && rowCode === code);

      if (hasRowId && hasRowCode) return idMatches && codeMatches;
      if (hasRowId) return idMatches;
      if (hasRowCode) return codeMatches;
      return false;
    })
    .map((row: any) => {
      const date = canonicalClinicalDateKey(
        sheetField(
          row,
          "Log Date",
          "Tanggal Pemeriksaan NAKES",
          "Tanggal Pemeriksaan",
          "Submission Date",
        ),
      );
      const weight = firstNumber(
        sheetField(
          row,
          "Berat Badan NAKES (kg)",
          "BB Monitoring terbaru",
          "BB anda per hari ini (diisi sekali saja perminggu)",
        ),
      );
      const height = firstNumber(
        sheetField(row, "Tinggi Badan NAKES (cm)", "Tinggi Badan (cm)"),
      );
      const suppliedBmi = firstNumber(sheetField(row, "BMI", "BMI NAKES", "IMT"));
      const calculatedBmi =
        weight !== null && height !== null && height > 0
          ? Math.round((weight / Math.pow(height / 100, 2)) * 10) / 10
          : null;
      const revision = firstNumber(sheetField(row, "NAKES Revision", "Revision"));
      const sheetRowNumber = firstNumber(row?._rowNumber);
      const historyId = firstText(
        sheetField(row, "NAKES History ID", "History ID"),
        sheetRowNumber,
      );
      const updatedAt = sheetTimestamp(row) || date;

      return {
        id: `sheet-nakes:${historyId || `${date}:${sheetRowNumber || 0}`}`,
        participant_id: id,
        participant_code: participantCode(args.participant),
        checkup_date: date,
        created_at: updatedAt,
        updated_at: updatedAt,
        history_type: firstText(
          sheetField(row, "Jenis Input NAKES", "History Type"),
          "nakes_checkup",
        ),
        visit_label: firstText(
          sheetField(row, "Nama Kunjungan / Label Pemeriksaan", "Visit Label"),
          "Pemeriksaan NAKES",
        ),
        height_cm: height,
        weight_kg: weight,
        bmi: suppliedBmi ?? calculatedBmi,
        waist_cm: firstNumber(
          sheetField(row, "Lingkar Perut NAKES (cm)", "Lingkar Perut (cm)"),
        ),
        systolic: firstNumber(sheetField(row, "Sistolik NAKES", "Sistolik")),
        diastolic: firstNumber(sheetField(row, "Diastolik NAKES", "Diastolik")),
        pulse: firstNumber(sheetField(row, "Nadi NAKES", "Nadi")),
        hba1c_percent: firstNumber(
          sheetField(row, "HbA1c NAKES (%)", "HbA1c (%)", "HbA1c"),
        ),
        glucose_value: firstNumber(
          sheetField(row, "Gula Darah NAKES", "Gula Darah", "Glucose"),
        ),
        age_years: firstNumber(sheetField(row, "Usia NAKES (tahun)", "Usia")),
        gender: firstText(sheetField(row, "Jenis Kelamin", "Gender", "Sex")),
        raw_payload: {
          source: "google_sheet_nakes",
          age_years: firstNumber(sheetField(row, "Usia NAKES (tahun)", "Usia")),
          gender: firstText(sheetField(row, "Jenis Kelamin", "Gender", "Sex")),
          nakes_revision: revision,
          sheet_row_number: sheetRowNumber,
          sheet_history_id: historyId,
        },
        _canonical_source: "google_sheet_nakes",
        _canonical_sheet_row_number: sheetRowNumber,
      };
    })
    .filter((row: any) =>
      Boolean(
        row.checkup_date &&
          [
            row.weight_kg,
            row.height_cm,
            row.bmi,
            row.waist_cm,
            row.systolic,
            row.diastolic,
            row.hba1c_percent,
            row.glucose_value,
            row.age_years,
          ].some((value) => value !== null && value !== undefined && value !== ""),
      ),
    );
}

const numericFields: Array<[string, string[]]> = [
  ["weight_kg", ["weight_kg", "weight", "body_weight", "bb", "berat_badan"]],
  ["height_cm", ["height_cm", "height", "body_height", "tb", "tinggi_badan"]],
  ["bmi", ["bmi", "imt"]],
  ["waist_cm", ["waist_cm", "waist", "waist_circumference", "lingkar_perut"]],
  ["systolic", ["systolic", "sbp", "systolic_bp", "td_sistolik"]],
  ["diastolic", ["diastolic", "dbp", "diastolic_bp", "td_diastolik"]],
  ["pulse", ["pulse", "heart_rate", "nadi"]],
  ["hba1c_percent", ["hba1c_percent", "hba1c", "hba1c_value", "hb_a1c"]],
  ["glucose_value", ["glucose_value", "blood_glucose", "fasting_glucose", "glucose", "gula_darah"]],
  ["age_years", ["age_years", "age", "usia"]],
];

function mergeRowsForDate(rows: any[], date: string) {
  const ordered = [...rows].sort((a, b) =>
    canonicalClinicalRecencyKey(a).localeCompare(canonicalClinicalRecencyKey(b)),
  );
  let merged: any = { checkup_date: date, raw_payload: {} };

  for (const row of ordered) {
    const raw = rawPayload(row);
    const previousMetrics = Object.fromEntries(
      numericFields.map(([target]) => [target, merged?.[target]]),
    );
    const metadata = {
      ...row,
      checkup_date: date,
      raw_payload: { ...(merged.raw_payload || {}), ...raw },
    };
    merged = { ...merged, ...metadata };

    for (const [target, aliases] of numericFields) {
      const value = metricValue(row, ...aliases);
      if (value !== null) merged[target] = value;
      else if (previousMetrics[target] !== undefined) {
        merged[target] = previousMetrics[target];
      }
    }

    const gender = firstText(row?.gender, row?.sex, row?.jenis_kelamin, raw?.gender, raw?.sex, raw?.jenis_kelamin);
    if (gender) merged.gender = gender;
  }

  if (firstNumber(merged.bmi) === null) {
    const weight = firstNumber(merged.weight_kg);
    const height = firstNumber(merged.height_cm);
    if (weight !== null && height !== null && height > 0) {
      merged.bmi = Math.round((weight / Math.pow(height / 100, 2)) * 10) / 10;
    }
  }

  merged._canonical_recency_key = canonicalClinicalRecencyKey(merged);
  return merged;
}

export function resolveCanonicalClinicalHistory(args: CanonicalClinicalHistoryArgs) {
  const databaseRows = (args.databaseRows || []).map((row: any) => ({
    ...row,
    checkup_date: rowDate(row),
    _canonical_source: firstText(row?._canonical_source, row?.source, row?.visit_label, "supabase_clinical"),
  }));
  const sheetRows = canonicalNakesSheetRows({
    participant: args.participant,
    sheetRows: args.sheetRows || [],
  });

  const groups = new Map<string, any[]>();
  for (const row of [...databaseRows, ...sheetRows]) {
    const date = rowDate(row);
    if (!date) continue;
    const current = groups.get(date) || [];
    current.push(row);
    groups.set(date, current);
  }

  return [...groups.entries()]
    .map(([date, rows]) => mergeRowsForDate(rows, date))
    .sort((a, b) => {
      const byDate = rowDate(a).localeCompare(rowDate(b));
      if (byDate) return byDate;
      return canonicalClinicalRecencyKey(a).localeCompare(canonicalClinicalRecencyKey(b));
    });
}

export function latestCanonicalClinicalRow(rows: any[]) {
  return [...(rows || [])].sort((a, b) =>
    canonicalClinicalRecencyKey(b).localeCompare(canonicalClinicalRecencyKey(a)),
  )[0] || null;
}

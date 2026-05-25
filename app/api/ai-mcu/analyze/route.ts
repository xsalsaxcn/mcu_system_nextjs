import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

function clean(value: any) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text || ["null", "undefined", "nan", "-", "—"].includes(text.toLowerCase())) return "";
  return text;
}

function norm(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isObject(value: any) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value: any) {
  const raw = clean(value).replace(/,/g, ".");
  const match = raw.match(/-?\d+(\.\d+)?/);
  if (!match) return NaN;
  return Number(match[0]);
}

function getByAliases(row: Record<string, any>, aliases: string[]) {
  const normalizedAliases = aliases.map(norm).filter(Boolean);

  for (const key of Object.keys(row || {})) {
    const keyNorm = norm(key);
    if (normalizedAliases.includes(keyNorm)) {
      const value = clean(row[key]);
      if (value) return value;
    }
  }

  for (const key of Object.keys(row || {})) {
    const keyNorm = norm(key);
    if (!keyNorm) continue;

    for (const alias of normalizedAliases) {
      if (alias.length >= 3 && (keyNorm.includes(alias) || alias.includes(keyNorm))) {
        const value = clean(row[key]);
        if (value) return value;
      }
    }
  }

  return "";
}

function parseBloodPressure(value: any) {
  const text = clean(value);
  const nums = text.match(/\d+(\.\d+)?/g)?.map(Number) || [];
  return {
    systolic: nums[0] || NaN,
    diastolic: nums[1] || NaN,
    display: text,
  };
}

function applyFieldMapping(row: Record<string, any>, fieldMapping: Record<string, string>) {
  const out: Record<string, any> = { ...(row || {}) };

  if (!isObject(fieldMapping)) return out;

  for (const [targetKey, sourceHeader] of Object.entries(fieldMapping)) {
    if (!clean(targetKey) || !clean(sourceHeader)) continue;
    const value = row?.[sourceHeader as string];
    if (value !== undefined && value !== null && clean(value)) {
      out[targetKey] = value;
    }
  }

  if (fieldMapping.NAMA && clean(row[fieldMapping.NAMA])) {
    out.NAMA = row[fieldMapping.NAMA];
    out.Nama = row[fieldMapping.NAMA];
  }

  if (fieldMapping.NOMCU && clean(row[fieldMapping.NOMCU])) {
    out.NOMCU = row[fieldMapping.NOMCU];
    out.MCU_ID = row[fieldMapping.NOMCU];
    out["NO MCU"] = row[fieldMapping.NOMCU];
  }

  if (fieldMapping.NIK && clean(row[fieldMapping.NIK])) {
    out.NIK = row[fieldMapping.NIK];
  }

  return out;
}

function normalizeRowForEngine(row: Record<string, any>, fallback: Record<string, any> = {}) {
  const out: Record<string, any> = { ...(row || {}) };

  const name = clean(out.NAMA || out.Nama) || clean(fallback.participant_name) || getByAliases(out, [
    "NAMA",
    "Nama",
    "Nama Peserta",
    "Nama Karyawan",
    "Patient Name",
    "Employee Name",
  ]);

  const mcuId = clean(out.MCU_ID || out.NOMCU || out["NO MCU"] || out["NO.MCU"]) || clean(fallback.mcu_id) || getByAliases(out, [
    "MCU_ID",
    "NOMCU",
    "NO MCU",
    "NO.MCU",
    "Nomor MCU",
    "No Peserta",
    "Barcode",
  ]);

  const nik = clean(out.NIK || out["NIK/NRP/ID"]) || clean(fallback.nik) || getByAliases(out, [
    "NIK",
    "NIK/NRP/ID",
    "NRP",
    "KTP",
    "Employee ID",
    "ID Karyawan",
  ]);

  out.NAMA = name;
  out.Nama = name;
  out.MCU_ID = mcuId;
  out.NOMCU = mcuId;
  out["NO MCU"] = mcuId;
  out.NIK = nik;

  const aliasMap: Record<string, string[]> = {
    JK: ["JK", "Jenis Kelamin", "Gender", "Sex"],
    USIA: ["USIA", "Usia", "Umur", "Age"],
    TGLLAHIR: ["TGLLAHIR", "Tanggal Lahir", "Tgl Lahir", "DOB", "Birth Date"],
    DEPT: ["DEPT", "DEPARTEMEN", "Departemen", "Department", "Bagian", "Unit", "Divisi"],
    DEPARTEMEN: ["DEPT", "DEPARTEMEN", "Departemen", "Department", "Bagian", "Unit", "Divisi"],
    PAKET: ["PAKET", "Paket", "Package", "Paket Pemeriksaan"],

    TD: ["TD", "Tensi", "Tekanan Darah", "Blood Pressure", "FS:Tensi", "FS Tensi"],
    TENSI: ["TD", "Tensi", "Tekanan Darah", "Blood Pressure", "FS:Tensi", "FS Tensi"],
    BMI: ["BMI", "IMT", "FS:BMI", "FS BMI"],
    IMT: ["BMI", "IMT", "FS:BMI", "FS BMI"],
    TB: ["TB", "Tinggi Badan", "Height", "FS:TB", "FS TB"],
    BB: ["BB", "Berat Badan", "Weight", "FS:BB", "FS BB"],

    HB: ["HB", "Hb", "Hemoglobin", "DL:Hb", "DL Hb"],
    LEUKOSIT: ["Leukosit", "Leukocyte", "WBC", "DL:Leu", "DL Leu"],
    HEMATOKRIT: ["Hematokrit", "HT", "HCT", "DL:Ht", "DL Ht"],
    TROMBOSIT: ["Trombosit", "Platelet", "PLT", "DL:Trom", "DL Trom"],
    ERITROSIT: ["Eritrosit", "RBC", "DL:Eri", "DL Eri"],

    GDP: ["GDP", "Gula Darah Puasa", "Glukosa Puasa", "GD:GDP", "GD GDP"],
    GDS: ["GDS", "Gula Darah Sewaktu", "Glukosa Sewaktu", "GD:Sewaktu", "GD Sewaktu"],
    CHOL: ["CHOL", "Kolesterol", "Kolesterol Total", "LD:Chol", "LD Chol"],
    KOLESTEROL: ["CHOL", "Kolesterol", "Kolesterol Total", "LD:Chol", "LD Chol"],
    HDL: ["HDL", "LD:HDL", "LD HDL"],
    LDL: ["LDL", "LD:LDL", "LD LDL"],
    TRIG: ["TRIG", "Trigliserida", "Triglyceride", "LD:Trig", "LD Trig"],
    TRIGLISERIDA: ["TRIG", "Trigliserida", "Triglyceride", "LD:Trig", "LD Trig"],

    UREUM: ["Ureum", "FK:Ureum", "FK Ureum"],
    KREATININ: ["Kreatinin", "Creatinine", "FK:Kreatinin", "FK Kreatinin"],
    ASAM_URAT: ["Asam Urat", "Uric Acid", "FK:AsamUrat", "FK AsamUrat"],
    SGOT: ["SGOT", "AST", "FH:SGOT", "FH SGOT"],
    SGPT: ["SGPT", "ALT", "FH:SGPT", "FH SGPT"],
    HBSAG: ["HBsAg", "HBSAG", "HP:HBsAg", "HP HBsAg"],
  };

  for (const [target, aliases] of Object.entries(aliasMap)) {
    if (!clean(out[target])) {
      const value = getByAliases(out, aliases);
      if (value) out[target] = value;
    }
  }

  if (!clean(out.TD) && clean(out.TENSI)) out.TD = out.TENSI;
  if (!clean(out.TENSI) && clean(out.TD)) out.TENSI = out.TD;
  if (!clean(out.BMI) && clean(out.IMT)) out.BMI = out.IMT;
  if (!clean(out.IMT) && clean(out.BMI)) out.IMT = out.BMI;
  if (!clean(out.DEPT) && clean(out.DEPARTEMEN)) out.DEPT = out.DEPARTEMEN;
  if (!clean(out.DEPARTEMEN) && clean(out.DEPT)) out.DEPARTEMEN = out.DEPT;
  if (!clean(out.CHOL) && clean(out.KOLESTEROL)) out.CHOL = out.KOLESTEROL;
  if (!clean(out.KOLESTEROL) && clean(out.CHOL)) out.KOLESTEROL = out.CHOL;
  if (!clean(out.TRIG) && clean(out.TRIGLISERIDA)) out.TRIG = out.TRIGLISERIDA;
  if (!clean(out.TRIGLISERIDA) && clean(out.TRIG)) out.TRIGLISERIDA = out.TRIG;

  return out;
}

function rowKey(row: Record<string, any>) {
  return norm(row.MCU_ID || row.NOMCU || row["NO MCU"] || row["NO.MCU"] || row.NIK || row["NIK/NRP/ID"] || row.NAMA || row.Nama);
}

function rowName(row: Record<string, any>) {
  return clean(row.NAMA || row.Nama || row.name || row.participant_name);
}

function rowMcuId(row: Record<string, any>) {
  return clean(row.MCU_ID || row.NOMCU || row["NO MCU"] || row["NO.MCU"] || row.mcu_id);
}

function compareText(value: any) {
  const text = clean(value);
  if (!text) return "";
  const n = Number(text.replace(/,/g, "."));
  if (Number.isFinite(n)) return String(n);
  return text.replace(/\s+/g, " ").toLowerCase();
}

const IGNORE_KEYS = new Set([
  "NO",
  "NOMCU",
  "NO MCU",
  "NO.MCU",
  "MCU_ID",
  "NAMA",
  "Nama",
  "name",
  "NIK",
  "NIK/NRP/ID",
  "DATABASE_NAME",
  "PROGRAM_TYPE",
  "Nama PT",
  "Perusahaan",
  "_AI_MCU_FIELD_MAPPING",
  "_import_id",
  "_participant_id",
  "_SheetName",
  "_RowIndex",
]);

function comparableKeys(previousRows: any[], currentRows: any[]) {
  const keys = new Set<string>();

  for (const row of [...(previousRows || []), ...(currentRows || [])]) {
    for (const key of Object.keys(row || {})) {
      if (!key || key.startsWith("_") || IGNORE_KEYS.has(key)) continue;
      keys.add(key);
    }
  }

  return Array.from(keys).sort();
}

function buildComparison(previousRows: any[], currentRows: any[], thresholdPct = 10) {
  const oldMap = new Map<string, Record<string, any>>();

  for (const oldRow of previousRows || []) {
    const key = rowKey(oldRow);
    if (key && !oldMap.has(key)) oldMap.set(key, oldRow);
  }

  const keys = comparableKeys(previousRows, currentRows);
  const comparisonAll: any[] = [];
  const comparisonChanged: any[] = [];
  const comparisonSignif: any[] = [];
  const changedLong: any[] = [];

  for (const current of currentRows || []) {
    const key = rowKey(current);
    const oldRow = key ? oldMap.get(key) : undefined;

    const name = rowName(current) || rowName(oldRow || {});
    const mcuId = rowMcuId(current) || rowMcuId(oldRow || {});

    const wide: any = {
      Nama: name,
      MCU_ID: mcuId,
    };

    let changedCount = 0;
    let significantCount = 0;

    for (const param of keys) {
      const oldValue = oldRow ? oldRow[param] : "";
      const newValue = current[param];

      const oldClean = clean(oldValue);
      const newClean = clean(newValue);

      const oldCompare = compareText(oldValue);
      const newCompare = compareText(newValue);
      const changed = oldCompare !== newCompare;

      const oldNum = toNumber(oldValue);
      const newNum = toNumber(newValue);
      const numeric = Number.isFinite(oldNum) && Number.isFinite(newNum);

      const delta = numeric ? newNum - oldNum : null;
      const pct = numeric && oldNum !== 0 ? (delta! / oldNum) * 100 : null;

      const significant = changed && (pct === null ? true : Math.abs(pct) >= thresholdPct);
      const status = !changed ? "Stabil" : numeric ? (delta! > 0 ? "Naik" : delta! < 0 ? "Turun" : "Stabil") : "Berubah";

      wide[`${param} (Lalu)`] = oldClean;
      wide[`${param} (Ini)`] = newClean;
      wide[`${param} Δ`] = delta === null ? (changed ? "Berubah" : "Stabil") : Number(delta.toFixed(4));
      wide[`${param} %Δ`] = pct === null ? "" : Number(pct.toFixed(2));
      wide[`${param} Status`] = status;
      wide[`${param} Signifikan`] = significant ? "YES" : "NO";

      if (changed) {
        changedCount += 1;
        if (significant) significantCount += 1;

        changedLong.push({
          Nama: name,
          MCU_ID: mcuId,
          Parameter: param,
          "Nilai Lalu": oldClean,
          "Nilai Ini": newClean,
          "Δ": wide[`${param} Δ`],
          "%Δ": wide[`${param} %Δ`],
          Status: status,
          Signifikan: significant ? "YES" : "NO",
        });
      }
    }

    wide.__changedCount = changedCount;
    wide.__significantCount = significantCount;

    comparisonAll.push(wide);
    if (changedCount > 0) comparisonChanged.push(wide);
    if (significantCount > 0) comparisonSignif.push(wide);
  }

  return {
    comparisonAll,
    comparisonChanged,
    comparisonSignif,
    changedLong,
    parameterCount: keys.length,
  };
}

function normalizeEngineUrl() {
  return String(process.env.AI_MCU_ENGINE_URL || "").replace(/\/$/, "");
}

function asArray(value: any) {
  return Array.isArray(value) ? value : [];
}

function collectArrays(obj: any, names: string[], out: any[] = [], depth = 0) {
  if (!obj || depth > 6) return out;

  if (Array.isArray(obj)) {
    for (const item of obj) collectArrays(item, names, out, depth + 1);
    return out;
  }

  if (typeof obj !== "object") return out;

  for (const name of names) {
    const value = obj[name];
    if (Array.isArray(value)) out.push(value);
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") collectArrays(value, names, out, depth + 1);
  }

  return out;
}

function getAny(obj: any, keys: string[]) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return "";
}

function normalizeStatus(value: any, fallback = "") {
  const raw = clean(value || fallback);
  const lower = raw.toLowerCase();

  if (lower.includes("data") && (lower.includes("tidak") || lower.includes("no") || lower.includes("missing"))) {
    return "Data tidak ada";
  }

  if (lower.includes("tidak") || lower.includes("not detected") || lower === "false" || lower === "normal") {
    return "Tidak terdeteksi";
  }

  if (lower.includes("terdeteksi") || lower.includes("detected") || lower === "true" || lower === "abnormal") {
    return "Terdeteksi";
  }

  return raw || "Data tidak ada";
}

function normalizeSeverity(value: any) {
  const raw = clean(value);
  if (!raw) return "";
  const lower = raw.toLowerCase();

  if (lower.includes("tinggi") || lower.includes("high") || lower.includes("berat")) return "Tinggi";
  if (lower.includes("sedang") || lower.includes("medium") || lower.includes("moderate")) return "Sedang";
  if (lower.includes("rendah") || lower.includes("low") || lower.includes("ringan")) return "Rendah";

  return raw;
}

function normalizeDiseaseRow(row: any, parent: any = {}) {
  const name = clean(
    getAny(row, ["Nama", "NAMA", "name", "participantName", "participant_name"]) ||
      getAny(parent, ["Nama", "NAMA", "name", "participantName", "participant_name"])
  );

  const mcuId = clean(
    getAny(row, ["MCU_ID", "NOMCU", "No MCU", "mcu_id", "participantId", "participant_id"]) ||
      getAny(parent, ["MCU_ID", "NOMCU", "No MCU", "mcu_id", "participantId", "participant_id"])
  );

  const condition = clean(
    getAny(row, ["Condition", "condition", "Penyakit", "penyakit", "disease", "diagnosis", "rule_name", "title"])
  );

  const detectedRaw = getAny(row, ["Status", "status", "detected", "isDetected", "hasil", "result", "rule_status"]);
  const status = normalizeStatus(detectedRaw, condition ? "Terdeteksi" : "Data tidak ada");

  const severity = normalizeSeverity(getAny(row, ["Severity", "severity", "Level", "level", "risk", "Kategori", "kategori"]));
  const score = getAny(row, ["Score", "score", "nilai", "points"]);
  const evidence = clean(getAny(row, ["Evidence", "evidence", "Alasan", "alasan", "detail", "details", "temuan", "reason"]));
  const nextStep = clean(getAny(row, ["NextStep", "nextStep", "next_step", "Saran", "saran", "recommendation", "rekomendasi", "action"]));

  return {
    Nama: name,
    MCU_ID: mcuId,
    Condition: condition || "-",
    Status: status,
    Severity: severity || "-",
    Score: score === undefined || score === null ? "" : score,
    Evidence: evidence || "-",
    NextStep: nextStep || "-",
    _raw: row,
  };
}

function normalizeDiseaseRows(engineResult: any) {
  const candidateNames = [
    "Interpretasi_Penyakit",
    "interpretasiPenyakit",
    "diseaseRows",
    "diseases",
    "conditionRows",
    "conditions",
    "allConditions",
    "all_conditions",
    "ruleBasedRows",
    "rule_based_rows",
    "ruleResults",
    "interpretationRows",
    "diseaseInterpretation",
    "disease_interpretation",
  ];

  const directArrays = collectArrays(engineResult, candidateNames);
  let rows: any[] = [];

  for (const arr of directArrays) {
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;

      const nested = candidateNames.map((key) => item[key]).find((value) => Array.isArray(value));
      if (Array.isArray(nested)) {
        rows.push(...nested.map((child) => normalizeDiseaseRow(child, item)));
      } else {
        rows.push(normalizeDiseaseRow(item));
      }
    }
  }

  if (!rows.length) {
    const analyses = [
      ...asArray(engineResult?.analyses),
      ...asArray(engineResult?.analysis),
      ...asArray(engineResult?.data?.analyses),
      ...asArray(engineResult?.results),
      ...asArray(engineResult?.data?.results),
    ];

    for (const item of analyses) {
      const nested = candidateNames.map((key) => item?.[key]).find((value) => Array.isArray(value));
      if (Array.isArray(nested)) {
        rows.push(...nested.map((child) => normalizeDiseaseRow(child, item)));
      } else if (item && typeof item === "object" && (item.condition || item.Condition || item.disease || item.Penyakit)) {
        rows.push(normalizeDiseaseRow(item));
      }
    }
  }

  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.Nama}|${row.MCU_ID}|${row.Condition}|${row.Status}|${row.Evidence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return row.Condition && row.Condition !== "-";
  });
}

function collectEngineRows(engineResult: any, keys: string[]) {
  const arrays = collectArrays(engineResult, keys);
  if (arrays.length) return arrays[0];
  return [];
}

function addAbnormal(output: any[], row: any, parameter: string, value: any, interpretation: string, normalRange: string) {
  output.push({
    Nama: rowName(row),
    MCU_ID: rowMcuId(row),
    Parameter: parameter,
    Hasil: clean(value),
    "Normal Range": normalRange,
    Interpretasi: interpretation,
    Source: "next-fallback",
  });
}

function localAbnormalRows(rows: any[]) {
  const output: any[] = [];

  for (const row of rows) {
    const bmi = toNumber(row.BMI || row.IMT);
    if (Number.isFinite(bmi)) {
      if (bmi >= 30) addAbnormal(output, row, "BMI", bmi, "Obesitas", "< 25");
      else if (bmi >= 25) addAbnormal(output, row, "BMI", bmi, "Overweight", "< 25");
    }

    const bp = parseBloodPressure(row.TD || row.TENSI);
    if (Number.isFinite(bp.systolic) || Number.isFinite(bp.diastolic)) {
      if (bp.systolic >= 140 || bp.diastolic >= 90) addAbnormal(output, row, "TD", bp.display, "Hipertensi", "< 140/90");
      else if (bp.systolic >= 120 || bp.diastolic >= 80) addAbnormal(output, row, "TD", bp.display, "Prehipertensi", "< 120/80");
    }

    const ldl = toNumber(row.LDL);
    if (Number.isFinite(ldl) && ldl >= 130) addAbnormal(output, row, "LDL", ldl, "LDL tinggi", "< 130");

    const chol = toNumber(row.CHOL || row.KOLESTEROL);
    if (Number.isFinite(chol) && chol >= 200) addAbnormal(output, row, "Kolesterol", chol, "Kolesterol tinggi", "< 200");

    const trig = toNumber(row.TRIG || row.TRIGLISERIDA);
    if (Number.isFinite(trig) && trig >= 150) addAbnormal(output, row, "Trigliserida", trig, "Trigliserida tinggi", "< 150");

    const gdp = toNumber(row.GDP);
    if (Number.isFinite(gdp) && gdp >= 126) addAbnormal(output, row, "GDP", gdp, "Diabetes range", "< 126");

    const gds = toNumber(row.GDS);
    if (Number.isFinite(gds) && gds >= 200) addAbnormal(output, row, "GDS", gds, "Diabetes range", "< 200");

    const sgot = toNumber(row.SGOT);
    if (Number.isFinite(sgot) && sgot > 40) addAbnormal(output, row, "SGOT", sgot, "SGOT tinggi", "≤ 40");

    const sgpt = toNumber(row.SGPT);
    if (Number.isFinite(sgpt) && sgpt > 40) addAbnormal(output, row, "SGPT", sgpt, "SGPT tinggi", "≤ 40");

    const kreatinin = toNumber(row.KREATININ);
    if (Number.isFinite(kreatinin) && kreatinin > 1.3) addAbnormal(output, row, "Kreatinin", kreatinin, "Kreatinin tinggi", "≤ 1.3");
  }

  return output;
}

function localDiseaseRows(rows: any[]) {
  const output: any[] = [];

  function push(row: any, condition: string, status: string, severity: string, score: number | "", evidence: string, nextStep: string) {
    output.push({
      Nama: rowName(row),
      MCU_ID: rowMcuId(row),
      Condition: condition,
      Status: status,
      Severity: severity || "-",
      Score: score,
      Evidence: evidence || "-",
      NextStep: nextStep || "-",
      Source: "next-fallback",
    });
  }

  for (const row of rows) {
    const bp = parseBloodPressure(row.TD || row.TENSI);
    if (Number.isFinite(bp.systolic) || Number.isFinite(bp.diastolic)) {
      if (bp.systolic >= 160 || bp.diastolic >= 100) {
        push(row, "Hipertensi", "Terdeteksi", "Tinggi", 85, `TD ${bp.display} (grade 2)`, "Ulang TD, evaluasi dokter, pertimbangkan terapi & monitoring.");
      } else if (bp.systolic >= 140 || bp.diastolic >= 90) {
        push(row, "Hipertensi", "Terdeteksi", "Sedang", 70, `TD ${bp.display} (grade 1)`, "Modifikasi gaya hidup, ulang TD terjadwal, konsultasi dokter.");
      } else if (bp.systolic >= 120 || bp.diastolic >= 80) {
        push(row, "Prehipertensi", "Terdeteksi", "Rendah", 45, `TD ${bp.display}`, "Monitoring tekanan darah dan modifikasi gaya hidup.");
      } else {
        push(row, "Hipertensi", "Tidak terdeteksi", "-", "", `TD ${bp.display}`, "-");
      }
    } else {
      push(row, "Hipertensi", "Data tidak ada", "-", "", "Kolom TD tidak tersedia.", "-");
    }

    const bmi = toNumber(row.BMI || row.IMT);
    if (Number.isFinite(bmi)) {
      if (bmi >= 30) push(row, "Obesitas Tingkat 1", "Terdeteksi", bmi >= 35 ? "Sedang" : "Rendah", bmi >= 35 ? 65 : 50, `BMI ${bmi}`, "Edukasi nutrisi & aktivitas; target BB turun 5–10%.");
      else if (bmi >= 25) push(row, "Overweight", "Terdeteksi", "Rendah", 35, `BMI ${bmi}`, "Edukasi diet, aktivitas fisik, pantau gula/lemak darah.");
      else push(row, "Obesitas Tingkat 1", "Tidak terdeteksi", "-", "", `BMI ${bmi}`, "-");
    } else {
      push(row, "Obesitas Tingkat 1", "Data tidak ada", "-", "", "BMI tidak tersedia.", "-");
    }

    const gdp = toNumber(row.GDP);
    const gds = toNumber(row.GDS);
    if ((Number.isFinite(gdp) && gdp >= 126) || (Number.isFinite(gds) && gds >= 200)) {
      push(row, "Diabetes", "Terdeteksi", "Sedang", 70, `GDP ${clean(row.GDP) || "-"}, GDS ${clean(row.GDS) || "-"}`, "Konfirmasi gula darah/HbA1c dan konsultasi dokter.");
    } else if (Number.isFinite(gdp) || Number.isFinite(gds)) {
      push(row, "Diabetes", "Tidak terdeteksi", "-", "", `GDP ${clean(row.GDP) || "-"}, GDS ${clean(row.GDS) || "-"}`, "-");
    } else {
      push(row, "Diabetes", "Data tidak ada", "-", "", "Kolom GDP/GDS tidak tersedia.", "-");
    }

    const ldl = toNumber(row.LDL);
    const chol = toNumber(row.CHOL || row.KOLESTEROL);
    const trig = toNumber(row.TRIG || row.TRIGLISERIDA);
    if ((Number.isFinite(ldl) && ldl >= 130) || (Number.isFinite(chol) && chol >= 200) || (Number.isFinite(trig) && trig >= 150)) {
      push(row, "Dislipidemia", "Terdeteksi", "Sedang", 60, `LDL ${clean(row.LDL) || "-"}, Chol ${clean(row.CHOL || row.KOLESTEROL) || "-"}, TG ${clean(row.TRIG || row.TRIGLISERIDA) || "-"}`, "Diet rendah lemak, aktivitas fisik, evaluasi risiko kardiovaskular.");
    } else if (Number.isFinite(ldl) || Number.isFinite(chol) || Number.isFinite(trig)) {
      push(row, "Dislipidemia", "Tidak terdeteksi", "-", "", `LDL ${clean(row.LDL) || "-"}, Chol ${clean(row.CHOL || row.KOLESTEROL) || "-"}, TG ${clean(row.TRIG || row.TRIGLISERIDA) || "-"}`, "-");
    } else {
      push(row, "Dislipidemia", "Data tidak ada", "-", "", "Kolom lipid tidak tersedia.", "-");
    }

    const sgot = toNumber(row.SGOT);
    const sgpt = toNumber(row.SGPT);
    if ((Number.isFinite(sgot) && sgot > 40) || (Number.isFinite(sgpt) && sgpt > 40)) {
      push(row, "Gangguan fungsi hati", "Terdeteksi", "Sedang", 55, `SGOT ${clean(row.SGOT) || "-"}, SGPT ${clean(row.SGPT) || "-"}`, "Evaluasi dokter; pertimbangkan ulang fungsi hati dan faktor risiko.");
    } else if (Number.isFinite(sgot) || Number.isFinite(sgpt)) {
      push(row, "Gangguan fungsi hati", "Tidak terdeteksi", "-", "", `SGOT ${clean(row.SGOT) || "-"}, SGPT ${clean(row.SGPT) || "-"}`, "-");
    } else {
      push(row, "Gangguan fungsi hati", "Data tidak ada", "-", "", "Kolom SGOT/SGPT tidak tersedia.", "-");
    }
  }

  return output;
}

function firstNonEmptyMapping(rows: any[]) {
  for (const row of rows || []) {
    if (isObject(row?.field_mapping) && Object.keys(row.field_mapping).length) return row.field_mapping;
    if (isObject(row?.row_data?._AI_MCU_FIELD_MAPPING) && Object.keys(row.row_data._AI_MCU_FIELD_MAPPING).length) return row.row_data._AI_MCU_FIELD_MAPPING;
  }

  return {};
}

function mappedKeyCount(mapping: any) {
  if (!isObject(mapping)) return 0;
  return Object.entries(mapping).filter(([, v]) => clean(v)).length;
}

export async function POST(req: NextRequest) {
  try {
    const user = getSessionUser(req);
    if (!user) return fail("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    const sourceId = Number(body.sourceId || body.source_id || 0);
    const thresholdPct = Number(body.thresholdPct || 10);

    if (!Number.isFinite(sourceId) || sourceId <= 0) {
      return fail("sourceId wajib dipilih.");
    }

    const supabase = getSupabaseAdmin();

    const sourceResult = await supabase
      .from("participant_sources")
      .select("id,name,institution_name,program_type")
      .eq("id", sourceId)
      .maybeSingle();

    if (sourceResult.error) return fail(sourceResult.error.message, 500);
    if (!sourceResult.data) return fail("Database/source tidak ditemukan.", 404);

    const rowsResult = await supabase
      .from("ai_mcu_import_rows")
      .select("id,participant_id,dataset_role,row_data,field_mapping,participant_name,mcu_id,nik,company_name,database_name,source_file_name,sheet_name,row_index,analysis_meta")
      .eq("source_id", sourceId)
      .order("id", { ascending: true });

    if (rowsResult.error) return fail(rowsResult.error.message, 500);

    const rawRows = rowsResult.data || [];
    const globalMapping = firstNonEmptyMapping(rawRows);

    const roleCounts = rawRows.reduce((acc: Record<string, number>, row: any) => {
      const role = clean(row.dataset_role) || "(empty)";
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});

    let currentDbRows = rawRows.filter((r: any) => {
      const role = clean(r.dataset_role).toLowerCase();
      return role === "new" || role === "current";
    });

    const previousDbRows = rawRows.filter((r: any) => {
      const role = clean(r.dataset_role).toLowerCase();
      return role === "old" || role === "previous" || role === "lama";
    });

    if (!currentDbRows.length) {
      currentDbRows = rawRows.filter((r: any) => {
        const role = clean(r.dataset_role).toLowerCase();
        return !["old", "previous", "lama"].includes(role);
      });
    }

    if (!currentDbRows.length && rawRows.length) currentDbRows = rawRows;

    const currentRows = currentDbRows.map((r: any) => {
      const rowMapping = isObject(r.field_mapping) && Object.keys(r.field_mapping).length ? r.field_mapping : globalMapping;
      const mapped = applyFieldMapping(r.row_data || {}, rowMapping);
      return normalizeRowForEngine(mapped, {
        participant_name: r.participant_name,
        mcu_id: r.mcu_id,
        nik: r.nik,
      });
    });

    const previousRows = previousDbRows.map((r: any) => {
      const rowMapping = isObject(r.field_mapping) && Object.keys(r.field_mapping).length ? r.field_mapping : globalMapping;
      const mapped = applyFieldMapping(r.row_data || {}, rowMapping);
      return normalizeRowForEngine(mapped, {
        participant_name: r.participant_name,
        mcu_id: r.mcu_id,
        nik: r.nik,
      });
    });

    if (!currentRows.length) {
      return fail("Database ini belum punya row MCU yang bisa dianalisis. Upload MCU Baru ulang atau pilih database lain.", 404, {
        debug: {
          sourceId,
          rawRowCount: rawRows.length,
          roleCounts,
        },
      });
    }

    const comparison = buildComparison(previousRows, currentRows, thresholdPct);

    let engineResult: any = null;
    const engineUrl = normalizeEngineUrl();

    if (engineUrl) {
      try {
        const res = await fetch(`${engineUrl}/analyze-mcu`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            currentRows,
            previousRows,
            includeAllRuleStatuses: true,
            outputMode: "streamlit_rule_based",
          }),
        });

        engineResult = await res.json().catch(() => null);
      } catch (error: any) {
        engineResult = {
          ok: false,
          message: error?.message || "Python engine tidak bisa dihubungi.",
        };
      }
    }

    let abnormalRows = collectEngineRows(engineResult, ["abnormalRows", "abnormal", "abnormal_summary", "Abnormal_Summary"]);
    let diseaseRows = normalizeDiseaseRows(engineResult);
    const priorityRows = collectEngineRows(engineResult, ["priorityRows", "priorities", "priority", "Prioritas"]);

    if (!abnormalRows.length) abnormalRows = localAbnormalRows(currentRows);
    if (!diseaseRows.length || diseaseRows.every((r) => r.Status === "Data tidak ada" && !r.Nama && !r.MCU_ID)) {
      diseaseRows = localDiseaseRows(currentRows);
    }

    return NextResponse.json({
      ok: true,
      source: sourceResult.data,
      debug: {
        rawRowCount: rawRows.length,
        roleCounts,
        currentRowsSent: currentRows.length,
        previousRowsSent: previousRows.length,
        mappingKeysSaved: mappedKeyCount(globalMapping),
        firstCurrentRowKeys: Object.keys(currentRows[0] || {}).slice(0, 120),
        firstCurrentRowSample: currentRows[0] || null,
        engineConfigured: Boolean(engineUrl),
        engineOk: Boolean(engineResult?.ok),
        engineTopLevelKeys: engineResult && typeof engineResult === "object" ? Object.keys(engineResult).slice(0, 50) : [],
      },
      summary: {
        totalCurrent: currentRows.length,
        totalPrevious: previousRows.length,
        parameterCount: comparison.parameterCount,
        comparisonAll: comparison.comparisonAll.length,
        comparisonChanged: comparison.comparisonChanged.length,
        comparisonSignif: comparison.comparisonSignif.length,
        changedParameters: comparison.changedLong.length,
        thresholdPct,
        engineOk: Boolean(engineResult?.ok),
        abnormalRows: abnormalRows.length,
        diseaseRows: diseaseRows.length,
        diseaseDetected: diseaseRows.filter((r) => r.Status === "Terdeteksi").length,
      },
      Rekap_Analisis: currentRows,
      Abnormal_Summary: abnormalRows,
      Perbandingan_All: comparison.comparisonAll,
      Perbandingan_Changed: comparison.comparisonChanged,
      Perbandingan_Signif: comparison.comparisonSignif,
      Perbandingan_Long: comparison.changedLong,
      Interpretasi_Penyakit: diseaseRows,
      Prioritas: priorityRows,
      previousRows,
      engineResult,
    });
  } catch (error: any) {
    return fail(error?.message || "Analisis MCU gagal.", 500);
  }
}

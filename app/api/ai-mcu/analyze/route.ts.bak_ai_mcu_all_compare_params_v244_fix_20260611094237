import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";

type Dict = Record<string, any>;

function fail(message: string, status = 400, extra: Dict = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

function clean(value: any) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text || ["null", "undefined", "nan", "-", "—"].includes(text.toLowerCase())) return "";
  return text;
}

function norm(value: any) {
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

function extractNumberFromText(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = Number(String(match[1]).replace(",", "."));
      if (Number.isFinite(value)) return value;
    }
  }
  return NaN;
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

function contains(text: string, terms: string[]) {
  const t = text.toLowerCase();
  return terms.some((term) => t.includes(term.toLowerCase()));
}

function getByAliases(row: Dict, aliases: string[]) {
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

function applyFieldMapping(rowData: Dict, fieldMapping: Dict) {
  const out: Dict = { ...(rowData || {}) };

  if (!isObject(fieldMapping)) return out;

  for (const [targetKey, sourceHeader] of Object.entries(fieldMapping)) {
    const target = clean(targetKey);
    const source = clean(sourceHeader);

    if (!target || !source) continue;

    // If source is only a master header and not present in uploaded row_data,
    // do not inject an empty value. This prevents false "Data tidak ada" mappings.
    if (Object.prototype.hasOwnProperty.call(rowData || {}, source)) {
      const value = rowData[source];
      if (clean(value)) out[target] = value;
    }
  }

  return out;
}

function normalizeRow(row: Dict, fallback: Dict = {}) {
  const out: Dict = { ...(row || {}) };

  const aliasMap: Record<string, string[]> = {
    NAMA: ["NAMA", "Nama", "Nama Peserta", "Nama Karyawan", "Patient Name", "Employee Name", "name", "participant_name"],
    MCU_ID: ["MCU_ID", "NOMCU", "NO MCU", "NO.MCU", "Nomor MCU", "No Peserta", "Barcode", "NO", "mcu_id"],
    NOMCU: ["NOMCU", "NO MCU", "NO.MCU", "MCU_ID", "NO", "Barcode"],
    NIK: ["NIK", "NIK/NRP/ID", "NRP", "KTP", "Employee ID", "ID Karyawan", "nik"],
    JK: ["JK", "Jenis Kelamin", "Gender", "Sex"],
    USIA: ["USIA", "Usia", "Umur", "Age"],
    TGLLAHIR: ["TGLLAHIR", "Tanggal Lahir", "Tgl Lahir", "DOB", "Birth Date"],
    DEPARTEMEN: ["DEPARTEMEN", "Departemen", "DEPT", "Dept/Bagian", "Bagian", "Unit", "Department"],
    DEPT: ["DEPT", "Departemen", "DEPARTEMEN", "Dept/Bagian", "Bagian", "Unit", "Department"],
    PAKET: ["PAKET", "Paket", "Paket MCU", "Package"],

    KATEGORI: ["KATEGORI", "Kategori", "Category", "Fit Status", "Status Fit", "Status"],
    KESIMPULAN: ["KESIMPULAN", "Kesimpulan", "Conclusion", "Resume", "Summary"],
    SARAN: ["SARAN", "Saran", "Recommendation", "Rekomendasi", "Next Step", "Anjuran"],

    TD: ["TD", "Tensi", "Tekanan Darah", "Blood Pressure", "FS:Tensi", "FS Tensi"],
    TENSI: ["TD", "Tensi", "Tekanan Darah", "Blood Pressure", "FS:Tensi", "FS Tensi"],
    SISTOLIK: ["SISTOLIK", "Sistole", "Sistolik", "Systolic"],
    DIASTOLIK: ["DIASTOLIK", "Diastole", "Diastolik", "Diastolic"],
    BMI: ["BMI", "IMT", "FS:BMI", "FS BMI", "Indeks Massa Tubuh", "Index Massa Tubuh"],
    IMT: ["BMI", "IMT", "FS:BMI", "FS BMI"],
    TB: ["TB", "Tinggi Badan", "Height", "FS:TB", "FS TB"],
    BB: ["BB", "Berat Badan", "Weight", "FS:BB", "FS BB"],

    HB: ["HB", "Hb", "Hemoglobin", "DL:Hb", "DL Hb"],
    LEUKOSIT: ["Leukosit", "Leukocyte", "WBC", "DL:Leu", "DL Leu"],
    HEMATOKRIT: ["Hematokrit", "HT", "HCT", "DL:Ht", "DL Ht"],
    TROMBOSIT: ["Trombosit", "Platelet", "PLT", "DL:Trom", "DL Trom"],
    ERITROSIT: ["Eritrosit", "RBC", "DL:Eri", "DL Eri"],

    GDP: ["GDP", "Gula Darah Puasa", "Glukosa Puasa", "GD:GDP", "GD GDP", "FBS"],
    GDS: ["GDS", "Gula Darah Sewaktu", "Glukosa Sewaktu", "GD:Sewaktu", "GD Sewaktu", "RBS"],
    HBA1C: ["HBA1C", "HbA1c", "Hb A1c", "A1C"],
    CHOL: ["CHOL", "Kolesterol", "Kolesterol Total", "LD:Chol", "LD Chol", "Cholesterol"],
    KOLESTEROL: ["CHOL", "Kolesterol", "Kolesterol Total", "LD:Chol", "LD Chol", "Cholesterol"],
    HDL: ["HDL", "LD:HDL", "LD HDL"],
    LDL: ["LDL", "LD:LDL", "LD LDL"],
    TRIG: ["TRIG", "Trigliserida", "Triglyceride", "LD:Trig", "LD Trig", "TG"],
    TRIGLISERIDA: ["TRIG", "Trigliserida", "Triglyceride", "LD:Trig", "LD Trig", "TG"],

    UREUM: ["Ureum", "Urea", "BUN", "FK:Ureum", "FK Ureum"],
    KREATININ: ["Kreatinin", "Creatinine", "Creat", "FK:Kreatinin", "FK Kreatinin"],
    ASAM_URAT: ["Asam Urat", "Uric Acid", "FK:AsamUrat", "FK AsamUrat"],
    SGOT: ["SGOT", "AST", "FH:SGOT", "FH SGOT"],
    SGPT: ["SGPT", "ALT", "FH:SGPT", "FH SGPT"],
    HBSAG: ["HBsAg", "HBSAG", "HP:HBsAg", "HP HBsAg"],

    UR_PROTEIN: ["UR:Prot", "Urine Protein", "Protein Urine", "Protein"],
    UR_GLU: ["UR:Glu", "Urine Glukosa", "Glukosa Urine", "Glucose Urine"],
    UR_LEUKOSIT: ["UR:Leukosit", "Leukosit Urine", "WBC Urine"],
    UR_ERITROSIT: ["UR:Eritrosit", "Eritrosit Urine", "RBC Urine"],
    UR_BAKTERI: ["UR:Bakteri", "Bakteri Urine", "Bacteria"],
    THORAX: ["Thorax Foto", "Hasilthorax", "Hasil Thorax", "Foto Thorax", "Rontgen Thorax", "Thorax"],
    EKG: ["EKG", "HasilEKG", "Hasil EKG", "ECG"],
  
    MEDICAL_RECORD_NO: ["No Medical Record", "No. Medical Record", "Medical Record", "No MR", "NO MR", "MR", "No Rekam Medis", "No. Rekam Medis", "Nomor Rekam Medis"],
    NO_MR: ["No Medical Record", "No. Medical Record", "Medical Record", "No MR", "NO MR", "MR", "No Rekam Medis", "No. Rekam Medis", "Nomor Rekam Medis"],
    TANGGAL_MCU: ["Tanggal MCU", "TGL MCU", "TGLMCU", "MCU Date", "Tanggal Pemeriksaan", "Tgl Pemeriksaan"],
    PERUSAHAAN: ["Nama PT", "PERUSAHAAN", "Perusahaan", "Company", "Company Name", "PT"],
    BAGIAN: ["Bagian", "BAGIAN", "Dept/Bagian", "Unit", "Section", "Division", "Divisi"],
    JABATAN: ["Jabatan", "JABATAN", "Position", "Job Title", "Posisi"],
};

  for (const [target, aliases] of Object.entries(aliasMap)) {
    if (!clean(out[target])) {
      const value = getByAliases(out, aliases);
      if (value) out[target] = value;
    }
  }

  out.NAMA = clean(out.NAMA) || clean(fallback.participant_name) || clean(fallback.name);
  out.MCU_ID = clean(out.MCU_ID) || clean(out.NOMCU) || clean(fallback.mcu_id) || clean(fallback.id);
  out.NOMCU = clean(out.NOMCU) || clean(out.MCU_ID);
  out.NIK = clean(out.NIK) || clean(fallback.nik);
  out.MEDICAL_RECORD_NO = clean(out.MEDICAL_RECORD_NO) || clean(out.NO_MR) || clean(out["No. Medical Record"]);
  out.NO_MR = clean(out.NO_MR) || clean(out.MEDICAL_RECORD_NO);
  out["No. Medical Record"] = clean(out["No. Medical Record"]) || clean(out.MEDICAL_RECORD_NO);
  out["Tanggal MCU"] = clean(out["Tanggal MCU"]) || clean(out.TANGGAL_MCU);
  out.Perusahaan = clean(out.Perusahaan) || clean(out.PERUSAHAAN) || clean(out["Nama PT"]);
  out.Bagian = clean(out.Bagian) || clean(out.BAGIAN);
  out.Jabatan = clean(out.Jabatan) || clean(out.JABATAN);

  if (!clean(out.TD) && clean(out.TENSI)) out.TD = out.TENSI;
  if (!clean(out.TD) && clean(out.SISTOLIK) && clean(out.DIASTOLIK)) out.TD = `${out.SISTOLIK}/${out.DIASTOLIK}`;
  if (!clean(out.BMI) && clean(out.IMT)) out.BMI = out.IMT;
  if (!clean(out.IMT) && clean(out.BMI)) out.IMT = out.BMI;
  if (!clean(out.CHOL) && clean(out.KOLESTEROL)) out.CHOL = out.KOLESTEROL;
  if (!clean(out.KOLESTEROL) && clean(out.CHOL)) out.KOLESTEROL = out.CHOL;
  if (!clean(out.TRIG) && clean(out.TRIGLISERIDA)) out.TRIG = out.TRIGLISERIDA;

  return out;
}

function rowName(row: Dict) {
  return clean(row.NAMA || row.Nama || row.name || row.participant_name) || "-";
}

function rowMcuId(row: Dict) {
  return clean(row.MCU_ID || row.NOMCU || row["NO MCU"] || row["NO.MCU"] || row.NO || row.mcu_id) || "-";
}

function evidenceText(row: Dict) {
  return [
    row.KATEGORI,
    row.KESIMPULAN,
    row.SARAN,
    row.THORAX,
    row.EKG,
    row["Thorax Foto"],
    row.Hasilthorax,
    row.HasilEKG,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" | ");
}

function pushAbnormal(target: any[], row: Dict, parameter: string, value: any, interpretation: string, severity = "Rendah", source = "rule-based", saran = "") {
  const key = `${rowName(row)}|${rowMcuId(row)}|${parameter}|${interpretation}|${clean(value)}`;
  if ((target as any)._seen?.has(key)) return;
  (target as any)._seen?.add(key);

  target.push({
    NAMA: rowName(row),
    MCU_ID: rowMcuId(row),
    PARAMETER: parameter,
    HASIL: clean(value) || "-",
    INTERPRETASI: interpretation,
    SEVERITY: severity,
    SARAN: clean(saran || row.SARAN) || "-",
    SOURCE: source,
  });
}

function pushDisease(target: any[], row: Dict, condition: string, status: string, severity: string, score: number | "", evidence: string, nextStep: string, source = "rule-based") {
  const key = `${rowName(row)}|${rowMcuId(row)}|${condition}|${status}|${evidence}`;
  if ((target as any)._seen?.has(key)) return;
  (target as any)._seen?.add(key);

  target.push({
    NAMA: rowName(row),
    MCU_ID: rowMcuId(row),
    CONDITION: condition,
    STATUS: status,
    SEVERITY: severity || "-",
    SCORE: score === "" ? "-" : score,
    EVIDENCE: clean(evidence) || "-",
    NEXTSTEP: clean(nextStep) || "-",
    SOURCE: source,
  });
}

function positiveUrine(value: any) {
  const t = clean(value).toLowerCase();
  if (!t) return false;
  if (["negatif", "negative", "normal", "0", "none", "tidak ada"].includes(t)) return false;
  return contains(t, ["+", "positif", "positive", "trace", "sedikit", "banyak", "abnormal"]);
}

function numericAndTextRules(rows: Dict[]) {
  const abnormal: any[] = [];
  const disease: any[] = [];
  (abnormal as any)._seen = new Set<string>();
  (disease as any)._seen = new Set<string>();

  for (const row of rows) {
    const name = rowName(row);
    const mcu = rowMcuId(row);
    const combined = evidenceText(row);
    const combinedLower = combined.toLowerCase();

    const kategori = clean(row.KATEGORI);
    const kesimpulan = clean(row.KESIMPULAN);
    const saran = clean(row.SARAN);

    // BMI can come from numeric column or from text like "Underweight (BMI: 18.22)".
    let bmi = toNumber(row.BMI || row.IMT);
    if (!Number.isFinite(bmi)) {
      bmi = extractNumberFromText(combinedLower, [
        /bmi\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i,
        /imt\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i,
      ]);
    }

    if (Number.isFinite(bmi)) {
      if (bmi < 18.5) {
        pushAbnormal(abnormal, row, "BMI / IMT", bmi, "Underweight", "Rendah", "rule-bmi", "Konsultasi gizi, evaluasi asupan dan faktor penyebab.");
        pushDisease(disease, row, "Underweight", "Terdeteksi", "Rendah", 45, `BMI ${bmi}`, "Konsultasi gizi dan monitoring berat badan.", "rule-bmi");
      } else if (bmi >= 35) {
        pushAbnormal(abnormal, row, "BMI / IMT", bmi, "Obesitas tingkat 2", "Sedang", "rule-bmi", "Program penurunan berat badan terstruktur.");
        pushDisease(disease, row, "Obesitas Tingkat 2", "Terdeteksi", "Sedang", 70, `BMI ${bmi}`, "Evaluasi risiko metabolik, diet dan aktivitas terstruktur.", "rule-bmi");
      } else if (bmi >= 30) {
        pushAbnormal(abnormal, row, "BMI / IMT", bmi, "Obesitas tingkat 1", "Rendah", "rule-bmi", "Target penurunan berat badan 5-10%.");
        pushDisease(disease, row, "Obesitas Tingkat 1", "Terdeteksi", "Rendah", 55, `BMI ${bmi}`, "Edukasi nutrisi dan aktivitas fisik.", "rule-bmi");
      } else if (bmi >= 25) {
        pushAbnormal(abnormal, row, "BMI / IMT", bmi, "Overweight", "Rendah", "rule-bmi", "Modifikasi gaya hidup dan monitoring.");
        pushDisease(disease, row, "Overweight", "Terdeteksi", "Rendah", 40, `BMI ${bmi}`, "Edukasi nutrisi dan aktivitas fisik.", "rule-bmi");
      }
    }

    const bp = parseBloodPressure(row.TD || row.TENSI);
    if (Number.isFinite(bp.systolic) || Number.isFinite(bp.diastolic)) {
      if (bp.systolic >= 160 || bp.diastolic >= 100) {
        pushAbnormal(abnormal, row, "Tekanan Darah", bp.display, "Hipertensi grade 2", "Tinggi", "rule-bp", "Ulang TD dan evaluasi dokter.");
        pushDisease(disease, row, "Hipertensi", "Terdeteksi", "Tinggi", 85, `TD ${bp.display} (grade 2)`, "Ulang TD, evaluasi dokter, pertimbangkan terapi dan monitoring.", "rule-bp");
      } else if (bp.systolic >= 140 || bp.diastolic >= 90) {
        pushAbnormal(abnormal, row, "Tekanan Darah", bp.display, "Hipertensi grade 1", "Sedang", "rule-bp", "Ulang TD terjadwal dan konsultasi dokter.");
        pushDisease(disease, row, "Hipertensi", "Terdeteksi", "Sedang", 70, `TD ${bp.display} (grade 1)`, "Modifikasi gaya hidup, ulang TD terjadwal, konsultasi dokter.", "rule-bp");
      } else if (bp.systolic >= 120 || bp.diastolic >= 80) {
        pushAbnormal(abnormal, row, "Tekanan Darah", bp.display, "Prehipertensi", "Rendah", "rule-bp", "Monitoring tekanan darah.");
        pushDisease(disease, row, "Prehipertensi", "Terdeteksi", "Rendah", 45, `TD ${bp.display}`, "Monitoring tekanan darah dan modifikasi gaya hidup.", "rule-bp");
      }
    }

    const gdp = toNumber(row.GDP);
    const gds = toNumber(row.GDS);
    const hba1c = toNumber(row.HBA1C);

    if ((Number.isFinite(gdp) && gdp >= 126) || (Number.isFinite(gds) && gds >= 200) || (Number.isFinite(hba1c) && hba1c >= 6.5)) {
      pushAbnormal(abnormal, row, "Gula Darah", `GDP ${clean(row.GDP) || "-"}; GDS ${clean(row.GDS) || "-"}; HbA1c ${clean(row.HBA1C) || "-"}`, "Diabetes range", "Sedang", "rule-glucose", "Konfirmasi ulang gula darah/HbA1c dan konsultasi dokter.");
      pushDisease(disease, row, "Diabetes", "Terdeteksi", "Sedang", 75, `GDP ${clean(row.GDP) || "-"}, GDS ${clean(row.GDS) || "-"}, HbA1c ${clean(row.HBA1C) || "-"}`, "Konfirmasi HbA1c/gula darah dan konsultasi dokter.", "rule-glucose");
    } else if ((Number.isFinite(gdp) && gdp >= 100) || (Number.isFinite(hba1c) && hba1c >= 5.7)) {
      pushAbnormal(abnormal, row, "Gula Darah", `GDP ${clean(row.GDP) || "-"}; HbA1c ${clean(row.HBA1C) || "-"}`, "Prediabetes range", "Rendah", "rule-glucose", "Modifikasi gaya hidup dan monitoring.");
      pushDisease(disease, row, "Prediabetes", "Terdeteksi", "Rendah", 50, `GDP ${clean(row.GDP) || "-"}, HbA1c ${clean(row.HBA1C) || "-"}`, "Diet, aktivitas fisik, dan monitoring berkala.", "rule-glucose");
    }

    const ldl = toNumber(row.LDL);
    const chol = toNumber(row.CHOL || row.KOLESTEROL);
    const trig = toNumber(row.TRIG || row.TRIGLISERIDA);
    const hdl = toNumber(row.HDL);

    if ((Number.isFinite(ldl) && ldl >= 130) || (Number.isFinite(chol) && chol >= 200) || (Number.isFinite(trig) && trig >= 150) || (Number.isFinite(hdl) && hdl < 40)) {
      pushAbnormal(abnormal, row, "Profil Lipid", `Chol ${clean(row.CHOL || row.KOLESTEROL) || "-"}; HDL ${clean(row.HDL) || "-"}; LDL ${clean(row.LDL) || "-"}; TG ${clean(row.TRIG || row.TRIGLISERIDA) || "-"}`, "Dislipidemia", "Sedang", "rule-lipid", "Diet rendah lemak, aktivitas fisik, evaluasi risiko kardiovaskular.");
      pushDisease(disease, row, "Dislipidemia", "Terdeteksi", "Sedang", 60, `LDL ${clean(row.LDL) || "-"}, Chol ${clean(row.CHOL || row.KOLESTEROL) || "-"}, TG ${clean(row.TRIG || row.TRIGLISERIDA) || "-"}`, "Diet rendah lemak, aktivitas fisik, evaluasi risiko kardiovaskular.", "rule-lipid");
    }

    const sgot = toNumber(row.SGOT);
    const sgpt = toNumber(row.SGPT);
    if ((Number.isFinite(sgot) && sgot > 40) || (Number.isFinite(sgpt) && sgpt > 40)) {
      pushAbnormal(abnormal, row, "Fungsi Hati", `SGOT ${clean(row.SGOT) || "-"}; SGPT ${clean(row.SGPT) || "-"}`, "Enzim hati meningkat", "Sedang", "rule-liver", "Evaluasi dokter dan pertimbangkan ulang fungsi hati.");
      pushDisease(disease, row, "Gangguan fungsi hati", "Terdeteksi", "Sedang", 55, `SGOT ${clean(row.SGOT) || "-"}, SGPT ${clean(row.SGPT) || "-"}`, "Evaluasi dokter; pertimbangkan ulang fungsi hati dan faktor risiko.", "rule-liver");
    }

    const kreatinin = toNumber(row.KREATININ);
    const ureum = toNumber(row.UREUM);
    if ((Number.isFinite(kreatinin) && kreatinin > 1.3) || (Number.isFinite(ureum) && ureum > 50)) {
      pushAbnormal(abnormal, row, "Fungsi Ginjal", `Ureum ${clean(row.UREUM) || "-"}; Kreatinin ${clean(row.KREATININ) || "-"}`, "Gangguan fungsi ginjal / nilai ginjal meningkat", "Sedang", "rule-kidney", "Evaluasi dokter dan hidrasi cukup.");
      pushDisease(disease, row, "Gangguan fungsi ginjal", "Terdeteksi", "Sedang", 60, `Ureum ${clean(row.UREUM) || "-"}, Kreatinin ${clean(row.KREATININ) || "-"}`, "Evaluasi dokter dan monitoring fungsi ginjal.", "rule-kidney");
    }

    const hb = toNumber(row.HB);
    if (Number.isFinite(hb) && hb < 12) {
      pushAbnormal(abnormal, row, "Hemoglobin", hb, "Anemia / Hb rendah", "Sedang", "rule-hb", "Evaluasi dokter, pertimbangkan pemeriksaan lanjutan.");
      pushDisease(disease, row, "Anemia", "Terdeteksi", "Sedang", 55, `Hb ${hb}`, "Evaluasi penyebab anemia dan konsultasi dokter.", "rule-hb");
    }

    if (positiveUrine(row.UR_PROTEIN)) {
      pushAbnormal(abnormal, row, "Urine Protein", row.UR_PROTEIN, "Proteinuria", "Sedang", "rule-urine", "Ulang urinalisis dan evaluasi dokter.");
      pushDisease(disease, row, "Kelainan urine", "Terdeteksi", "Sedang", 50, `Protein urine ${row.UR_PROTEIN}`, "Ulang urinalisis dan evaluasi dokter.", "rule-urine");
    }

    if (positiveUrine(row.UR_GLU)) {
      pushAbnormal(abnormal, row, "Urine Glukosa", row.UR_GLU, "Glukosuria", "Sedang", "rule-urine", "Evaluasi gula darah.");
      pushDisease(disease, row, "Kelainan urine", "Terdeteksi", "Sedang", 50, `Glukosa urine ${row.UR_GLU}`, "Evaluasi gula darah dan ulang urinalisis.", "rule-urine");
    }

    if (positiveUrine(row.UR_LEUKOSIT) || positiveUrine(row.UR_BAKTERI)) {
      pushAbnormal(abnormal, row, "Urine Leukosit/Bakteri", `${clean(row.UR_LEUKOSIT) || "-"} / ${clean(row.UR_BAKTERI) || "-"}`, "Kemungkinan infeksi saluran kemih", "Sedang", "rule-urine", "Ulang urinalisis dan evaluasi gejala.");
      pushDisease(disease, row, "Kemungkinan ISK", "Terdeteksi", "Sedang", 50, `Leukosit ${clean(row.UR_LEUKOSIT) || "-"}, Bakteri ${clean(row.UR_BAKTERI) || "-"}`, "Ulang urinalisis dan evaluasi dokter bila bergejala.", "rule-urine");
    }

    if (contains(clean(row.HBSAG), ["reaktif", "reactive", "positif", "positive", "+"])) {
      pushAbnormal(abnormal, row, "HBsAg", row.HBSAG, "HBsAg reaktif", "Tinggi", "rule-hepatitis", "Konsultasi dokter dan pemeriksaan lanjutan hepatitis B.");
      pushDisease(disease, row, "HBsAg reaktif", "Terdeteksi", "Tinggi", 80, `HBsAg ${row.HBSAG}`, "Konsultasi dokter dan pemeriksaan lanjutan hepatitis B.", "rule-hepatitis");
    }

    // Text-based rules from KESIMPULAN/SARAN/KATEGORI.
    // This is essential for uploaded Excel that only stores summary columns.
    if (contains(combinedLower, ["underweight", "berat badan kurang", "kurus"])) {
      const ev = Number.isFinite(bmi) ? `BMI ${bmi}` : kesimpulan || combined;
      pushAbnormal(abnormal, row, "Kesimpulan", ev, "Underweight", "Rendah", "rule-text", "Konsultasi gizi dan evaluasi asupan.");
      pushDisease(disease, row, "Underweight", "Terdeteksi", "Rendah", 45, ev, "Konsultasi gizi dan monitoring berat badan.", "rule-text");
    }

    if (contains(combinedLower, ["overweight", "berat badan lebih"])) {
      pushAbnormal(abnormal, row, "Kesimpulan", kesimpulan || combined, "Overweight", "Rendah", "rule-text", "Modifikasi gaya hidup.");
      pushDisease(disease, row, "Overweight", "Terdeteksi", "Rendah", 40, kesimpulan || combined, "Edukasi nutrisi dan aktivitas fisik.", "rule-text");
    }

    if (contains(combinedLower, ["obesitas", "obese"])) {
      pushAbnormal(abnormal, row, "Kesimpulan", kesimpulan || combined, "Obesitas", "Sedang", "rule-text", "Program penurunan berat badan.");
      pushDisease(disease, row, "Obesitas", "Terdeteksi", "Sedang", 60, kesimpulan || combined, "Edukasi nutrisi, aktivitas fisik, dan monitoring metabolik.", "rule-text");
    }

    if (contains(combinedLower, ["hipertensi", "tekanan darah tinggi", "tensi tinggi"])) {
      pushAbnormal(abnormal, row, "Kesimpulan", kesimpulan || combined, "Hipertensi", "Sedang", "rule-text", "Ulang TD dan konsultasi dokter.");
      pushDisease(disease, row, "Hipertensi", "Terdeteksi", "Sedang", 70, kesimpulan || combined, "Ulang TD dan konsultasi dokter.", "rule-text");
    }

    if (contains(combinedLower, ["diabetes", "gula darah tinggi", "hiperglikemi", "hiperglikemia"])) {
      pushAbnormal(abnormal, row, "Kesimpulan", kesimpulan || combined, "Gangguan gula darah / diabetes", "Sedang", "rule-text", "Konfirmasi gula darah/HbA1c.");
      pushDisease(disease, row, "Diabetes", "Terdeteksi", "Sedang", 70, kesimpulan || combined, "Konfirmasi gula darah/HbA1c dan konsultasi dokter.", "rule-text");
    }

    if (contains(combinedLower, ["dislipidemia", "kolesterol", "ldl", "trigliserida", "lipid"])) {
      pushAbnormal(abnormal, row, "Kesimpulan", kesimpulan || combined, "Dislipidemia / profil lipid abnormal", "Sedang", "rule-text", "Diet rendah lemak dan evaluasi risiko kardiovaskular.");
      pushDisease(disease, row, "Dislipidemia", "Terdeteksi", "Sedang", 60, kesimpulan || combined, "Diet rendah lemak, aktivitas fisik, evaluasi risiko kardiovaskular.", "rule-text");
    }

    if (contains(combinedLower, ["asam urat", "uric acid", "hiperurisemia"])) {
      pushAbnormal(abnormal, row, "Kesimpulan", kesimpulan || combined, "Asam urat tinggi", "Rendah", "rule-text", "Diet rendah purin dan evaluasi dokter bila bergejala.");
      pushDisease(disease, row, "Hiperurisemia", "Terdeteksi", "Rendah", 45, kesimpulan || combined, "Diet rendah purin dan monitoring.", "rule-text");
    }

    if (contains(combinedLower, ["sgot", "sgpt", "fungsi hati", "enzim hati", "fatty liver"])) {
      pushAbnormal(abnormal, row, "Kesimpulan", kesimpulan || combined, "Gangguan fungsi hati", "Sedang", "rule-text", "Evaluasi dokter dan fungsi hati ulang.");
      pushDisease(disease, row, "Gangguan fungsi hati", "Terdeteksi", "Sedang", 55, kesimpulan || combined, "Evaluasi dokter dan fungsi hati ulang.", "rule-text");
    }

    if (contains(combinedLower, ["kreatinin", "ureum", "fungsi ginjal", "ginjal"])) {
      pushAbnormal(abnormal, row, "Kesimpulan", kesimpulan || combined, "Gangguan fungsi ginjal", "Sedang", "rule-text", "Evaluasi dokter dan fungsi ginjal ulang.");
      pushDisease(disease, row, "Gangguan fungsi ginjal", "Terdeteksi", "Sedang", 55, kesimpulan || combined, "Evaluasi dokter dan monitoring fungsi ginjal.", "rule-text");
    }

    if (contains(combinedLower, ["anemia", "hb rendah", "hemoglobin rendah"])) {
      pushAbnormal(abnormal, row, "Kesimpulan", kesimpulan || combined, "Anemia", "Sedang", "rule-text", "Evaluasi dokter dan pemeriksaan lanjutan.");
      pushDisease(disease, row, "Anemia", "Terdeteksi", "Sedang", 55, kesimpulan || combined, "Evaluasi penyebab anemia.", "rule-text");
    }

    if (contains(combinedLower, ["myopia", "miopia", "mata kanan", "mata kiri", "visus", "refraksi"])) {
      pushAbnormal(abnormal, row, "Mata / Visus", kesimpulan || combined, "Gangguan refraksi / visus", "Rendah", "rule-text", "Konsultasi mata/optometri bila diperlukan.");
      pushDisease(disease, row, "Gangguan refraksi / visus", "Terdeteksi", "Rendah", 35, kesimpulan || combined, "Konsultasi mata/optometri bila diperlukan.", "rule-text");
    }

    if (contains(combinedLower, ["thorax", "rontgen", "x-ray", "xray", "paru"])) {
      const hasNormalThorax = contains(combinedLower, ["thorax normal", "foto thorax normal", "paru normal"]);
      if (!hasNormalThorax && !contains(combinedLower, ["tidak ditemukan kelainan"])) {
        pushAbnormal(abnormal, row, "Thorax", kesimpulan || combined, "Temuan thorax perlu evaluasi", "Sedang", "rule-text", "Konsultasi dokter sesuai temuan.");
        pushDisease(disease, row, "Temuan thorax", "Terdeteksi", "Sedang", 50, kesimpulan || combined, "Konsultasi dokter sesuai temuan.", "rule-text");
      }
    }

    if (contains(combinedLower, ["ekg", "ecg", "sinus", "aritmia", "bradikardi", "takikardi"])) {
      const hasNormalEkg = contains(combinedLower, ["ekg normal", "ecg normal", "normal sinus"]);
      if (!hasNormalEkg && !contains(combinedLower, ["tidak ditemukan kelainan"])) {
        pushAbnormal(abnormal, row, "EKG", kesimpulan || combined, "Temuan EKG perlu evaluasi", "Sedang", "rule-text", "Konsultasi dokter sesuai temuan EKG.");
        pushDisease(disease, row, "Temuan EKG", "Terdeteksi", "Sedang", 50, kesimpulan || combined, "Konsultasi dokter sesuai temuan EKG.", "rule-text");
      }
    }

    const kategoriLower = kategori.toLowerCase();
    if (kategori && !["fit", "normal", "sehat"].includes(kategoriLower) && !contains(kategoriLower, ["fit"])) {
      pushAbnormal(abnormal, row, "Kategori", kategori, kategori, contains(kategoriLower, ["unfit"]) ? "Tinggi" : "Sedang", "rule-category", saran);
    }

    // If there is an explicit not-normal conclusion but no keyword matched, keep it visible.
    if (
      kesimpulan &&
      !contains(kesimpulan.toLowerCase(), ["tidak ditemukan kelainan", "dalam batas normal", "normal"]) &&
      !abnormal.some((x) => x.NAMA === name && x.MCU_ID === mcu)
    ) {
      pushAbnormal(abnormal, row, "Kesimpulan", kesimpulan, "Perlu perhatian berdasarkan kesimpulan MCU", "Rendah", "rule-summary", saran);
      pushDisease(disease, row, "Perlu perhatian", "Terdeteksi", "Rendah", 30, kesimpulan, saran || "Review oleh dokter pemeriksa.", "rule-summary");
    }
  }

  delete (abnormal as any)._seen;
  delete (disease as any)._seen;

  return { abnormal, disease };
}

const IGNORE_COMPARE = new Set([
  "NAMA",
  "Nama",
  "name",
  "participant_name",
  "MCU_ID",
  "NOMCU",
  "NO MCU",
  "NO.MCU",
  "NO",
  "NIK",
  "JK",
  "TGLLAHIR",
  "USIA",
  "DEPT",
  "DEPARTEMEN",
  "PAKET",
  "Nama PT",
  "PROGRAM_TYPE",
  "_AI_MCU_FIELD_MAPPING",
  "_AI_MCU_MAPPING_KEYS",
  "_AI_MCU_MAPPING_SAVED_AT",
]);

function rowKey(row: Dict) {
  return norm(row.MCU_ID || row.NOMCU || row["NO MCU"] || row["NO.MCU"] || row.NO || row.NIK || row.NAMA);
}

function compareText(value: any) {
  const text = clean(value);
  if (!text) return "";
  const number = Number(text.replace(/,/g, "."));
  if (Number.isFinite(number)) return String(number);
  return text.replace(/\s+/g, " ").toLowerCase();
}

function comparableKeys(previousRows: Dict[], currentRows: Dict[]) {
  const keys = new Set<string>();

  for (const row of [...previousRows, ...currentRows]) {
    for (const key of Object.keys(row || {})) {
      if (!key || key.startsWith("_") || IGNORE_COMPARE.has(key)) continue;
      keys.add(key);
    }
  }

  return Array.from(keys).sort();
}

function buildComparison(previousRows: Dict[], currentRows: Dict[], thresholdPct = 10) {
  const oldMap = new Map<string, Dict>();
  for (const oldRow of previousRows) {
    const key = rowKey(oldRow);
    if (key && !oldMap.has(key)) oldMap.set(key, oldRow);
  }

  const keys = comparableKeys(previousRows, currentRows);
  const comparisonAll: any[] = [];
  const comparisonChanged: any[] = [];
  const comparisonSignif: any[] = [];
  const changedLong: any[] = [];

  for (const current of currentRows) {
    const key = rowKey(current);
    const oldRow = key ? oldMap.get(key) : undefined;
    const wide: Dict = {
      NAMA: rowName(current),
      MCU_ID: rowMcuId(current),
    };

    let changedCount = 0;
    let significantCount = 0;

    for (const param of keys) {
      const oldValue = oldRow ? oldRow[param] : "";
      const newValue = current[param];

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

      wide[`${param} (Lalu)`] = clean(oldValue);
      wide[`${param} (Ini)`] = clean(newValue);
      wide[`${param} Delta`] = delta === null ? (changed ? "Berubah" : "Stabil") : Number(delta.toFixed(4));
      wide[`${param} DeltaPct`] = pct === null ? "" : Number(pct.toFixed(2));
      wide[`${param} Status`] = status;

      if (changed) {
        changedCount += 1;
        if (significant) significantCount += 1;
        changedLong.push({
          NAMA: rowName(current),
          MCU_ID: rowMcuId(current),
          PARAMETER: param,
          NILAI_LALU: clean(oldValue),
          NILAI_BARU: clean(newValue),
          DELTA: wide[`${param} Delta`],
          DELTA_PCT: wide[`${param} DeltaPct`],
          STATUS: status,
          SIGNIFIKAN: significant ? "YES" : "NO",
        });
      }
    }

    wide.__changedCount = changedCount;
    wide.__significantCount = significantCount;
    comparisonAll.push(wide);
    if (changedCount > 0) comparisonChanged.push(wide);
    if (significantCount > 0) comparisonSignif.push(wide);
  }

  return { comparisonAll, comparisonChanged, comparisonSignif, changedLong, parameterCount: keys.length };
}

function firstMapping(rows: any[]) {
  for (const row of rows || []) {
    if (isObject(row?.field_mapping) && Object.keys(row.field_mapping).length) return row.field_mapping;
    if (isObject(row?.row_data?._AI_MCU_FIELD_MAPPING) && Object.keys(row.row_data._AI_MCU_FIELD_MAPPING).length) return row.row_data._AI_MCU_FIELD_MAPPING;
  }
  return {};
}

function mappedKeyCount(mapping: any) {
  if (!isObject(mapping)) return 0;
  return Object.entries(mapping).filter(([, value]) => clean(value)).length;
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
    const globalMapping = firstMapping(rawRows);

    const roleCounts = rawRows.reduce((acc: Dict, row: any) => {
      const role = clean(row.dataset_role) || "(empty)";
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});

    let currentDbRows = rawRows.filter((r: any) => ["new", "current", "baru"].includes(clean(r.dataset_role).toLowerCase()));
    const previousDbRows = rawRows.filter((r: any) => ["old", "previous", "lama"].includes(clean(r.dataset_role).toLowerCase()));

    if (!currentDbRows.length) {
      currentDbRows = rawRows.filter((r: any) => !["old", "previous", "lama"].includes(clean(r.dataset_role).toLowerCase()));
    }

    if (!currentDbRows.length && rawRows.length) currentDbRows = rawRows;

    const toNormalized = (r: any) => {
      const rowMapping = isObject(r.field_mapping) && Object.keys(r.field_mapping).length ? r.field_mapping : globalMapping;
      const mapped = applyFieldMapping(r.row_data || {}, rowMapping);
      return normalizeRow(mapped, {
        participant_name: r.participant_name,
        mcu_id: r.mcu_id,
        nik: r.nik,
        id: r.id,
      });
    };

    const currentRows = currentDbRows.map(toNormalized);
    const previousRows = previousDbRows.map(toNormalized);

    if (!currentRows.length) {
      return fail("Database ini belum punya row MCU yang bisa dianalisis.", 404, {
        debug: { sourceId, rawRowCount: rawRows.length, roleCounts },
      });
    }

    const ruleResult = numericAndTextRules(currentRows);
    const comparison = buildComparison(previousRows, currentRows, thresholdPct);

    const participantsWithDetected = new Set(ruleResult.disease.map((r) => `${r.NAMA}|${r.MCU_ID}`));
    const participantsWithNoFinding = currentRows
      .filter((row) => {
        const key = `${rowName(row)}|${rowMcuId(row)}`;
        const combined = evidenceText(row).toLowerCase();
        return !participantsWithDetected.has(key) && contains(combined, ["tidak ditemukan kelainan", "dalam batas normal", "hasil pemeriksaan tidak ditemukan kelainan"]);
      })
      .map((row) => ({
        NAMA: rowName(row),
        MCU_ID: rowMcuId(row),
        CONDITION: "Tidak ditemukan kelainan bermakna",
        STATUS: "Tidak terdeteksi",
        SEVERITY: "-",
        SCORE: "-",
        EVIDENCE: clean(row.KESIMPULAN) || "Hasil pemeriksaan tidak ditemukan kelainan.",
        NEXTSTEP: clean(row.SARAN) || "Pemeriksaan kesehatan berkala.",
        SOURCE: "rule-normal-summary",
      }));

    const diseaseRows = [...ruleResult.disease, ...participantsWithNoFinding];

    const prioritasRows = ruleResult.abnormal
      .filter((r) => ["Tinggi", "Sedang"].includes(r.SEVERITY))
      .map((r) => ({
        NAMA: r.NAMA,
        MCU_ID: r.MCU_ID,
        PRIORITAS: r.SEVERITY,
        PARAMETER: r.PARAMETER,
        TEMUAN: r.INTERPRETASI,
        SARAN: r.SARAN,
      }));

    const summaryPayload = {
      totalCurrent: currentRows.length,
      totalPrevious: previousRows.length,
      parameterCount: comparison.parameterCount,
      comparisonAll: comparison.comparisonAll.length,
      comparisonChanged: comparison.comparisonChanged.length,
      comparisonSignif: comparison.comparisonSignif.length,
      changedParameters: comparison.changedLong.length,
      thresholdPct,
      abnormalRows: ruleResult.abnormal.length,
      diseaseRows: diseaseRows.length,
      diseaseDetected: diseaseRows.filter((r) => r.STATUS === "Terdeteksi").length,
    };

    const sheetsPayload = {
      Rekap_Analisis: currentRows,
      Abnormal_Summary: ruleResult.abnormal,
      Perbandingan_All: comparison.comparisonAll,
      Perbandingan_Changed: comparison.comparisonChanged,
      Perbandingan_Signif: comparison.comparisonSignif,
      Perbandingan_Long: comparison.changedLong,
      Interpretasi_Penyakit: diseaseRows,
      Prioritas: prioritasRows,
    };

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
        ruleMode: "next-route-numeric-and-text-based-v2-with-aliases",
      },
      summary: summaryPayload,

      // Original workbook-style names
      Rekap_Analisis: currentRows,
      Abnormal_Summary: ruleResult.abnormal,
      Perbandingan_All: comparison.comparisonAll,
      Perbandingan_Changed: comparison.comparisonChanged,
      Perbandingan_Signif: comparison.comparisonSignif,
      Perbandingan_Long: comparison.changedLong,
      Interpretasi_Penyakit: diseaseRows,
      Prioritas: prioritasRows,
      previousRows,

      // Backward-compatible aliases for older/newer React pages
      sheets: sheetsPayload,
      data: sheetsPayload,
      result: sheetsPayload,
      rekapAnalisis: currentRows,
      abnormalSummary: ruleResult.abnormal,
      abnormalRows: ruleResult.abnormal,
      comparisonAll: comparison.comparisonAll,
      comparisonChanged: comparison.comparisonChanged,
      comparisonSignif: comparison.comparisonSignif,
      comparisonLong: comparison.changedLong,
      interpretasiPenyakit: diseaseRows,
      diseaseRows,
      diseaseInterpretation: diseaseRows,
      interpretationRows: diseaseRows,
      priorityRows: prioritasRows,
    });
  } catch (error: any) {
    return fail(error?.message || "Analisis MCU gagal.", 500);
  }
}

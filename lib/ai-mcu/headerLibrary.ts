export type AiMcuMappingGroup =
  | "Identitas"
  | "Fisik"
  | "Laboratorium"
  | "Urine"
  | "Penunjang"
  | "Output PDF";

export type AiMcuMappingField = {
  key: string;
  label: string;
  group: AiMcuMappingGroup;
  required?: boolean;
  aliases: string[];
};

export const AI_MCU_MAPPING_GROUPS: AiMcuMappingGroup[] = [
  "Identitas",
  "Fisik",
  "Laboratorium",
  "Urine",
  "Penunjang",
  "Output PDF",
];

export const AI_MCU_MAPPING_FIELDS: AiMcuMappingField[] = [
  // Identitas
  { key: "NAMA", label: "Nama Peserta", group: "Identitas", required: true, aliases: ["nama", "nama peserta", "nama karyawan", "nama lengkap", "employee name", "patient name", "name"] },
  { key: "NOMCU", label: "No MCU", group: "Identitas", required: true, aliases: ["nomcu", "no mcu", "no.mcu", "no_mcu", "nomor mcu", "mcu id", "mcu_id", "barcode", "no peserta", "no urut", "no"] },
  { key: "MCU_ID", label: "MCU ID", group: "Identitas", aliases: ["mcu_id", "mcu id", "nomcu", "no mcu", "no.mcu", "barcode"] },
  { key: "NIK", label: "NIK / NRP / ID", group: "Identitas", aliases: ["nik", "ktp", "nik ktp", "nik/nrp/id", "nrp", "id karyawan", "employee id", "no ktp"] },
  { key: "JK", label: "Jenis Kelamin", group: "Identitas", aliases: ["jk", "jenis kelamin", "gender", "sex", "kelamin"] },
  { key: "TGLLAHIR", label: "Tanggal Lahir", group: "Identitas", aliases: ["tgllahir", "tanggal lahir", "tgl lahir", "birth date", "dob", "date of birth"] },
  { key: "USIA", label: "Usia", group: "Identitas", aliases: ["usia", "umur", "age"] },
  { key: "DEPT", label: "Departemen / Bagian", group: "Identitas", aliases: ["dept", "departemen", "department", "bagian", "unit", "divisi", "dept/bagian", "dept bagian"] },
  { key: "DEPARTEMEN", label: "Departemen", group: "Identitas", aliases: ["departemen", "department", "dept", "bagian", "unit", "divisi"] },
  { key: "PAKET", label: "Paket MCU", group: "Identitas", aliases: ["paket", "paket mcu", "package", "paket pemeriksaan"] },
  { key: "Nama PT", label: "Nama Perusahaan / Instansi", group: "Identitas", aliases: ["nama pt", "perusahaan", "company", "company name", "instansi", "nama perusahaan"] },

  // Fisik
  { key: "FS:TB", label: "Tinggi Badan", group: "Fisik", aliases: ["fs:tb", "fs tb", "tb", "tinggi badan", "tinggi", "height", "body height"] },
  { key: "TB", label: "Tinggi Badan - alias", group: "Fisik", aliases: ["tb", "tinggi badan", "height", "fs:tb", "fs tb"] },
  { key: "FS:BB", label: "Berat Badan", group: "Fisik", aliases: ["fs:bb", "fs bb", "bb", "berat badan", "berat", "weight", "body weight"] },
  { key: "BB", label: "Berat Badan - alias", group: "Fisik", aliases: ["bb", "berat badan", "weight", "fs:bb", "fs bb"] },
  { key: "FS:BMI", label: "BMI / IMT", group: "Fisik", aliases: ["fs:bmi", "fs bmi", "bmi", "imt", "index massa tubuh", "indeks massa tubuh"] },
  { key: "BMI", label: "BMI - alias", group: "Fisik", aliases: ["bmi", "imt", "fs:bmi", "fs bmi"] },
  { key: "FS:Tensi", label: "Tekanan Darah / Tensi", group: "Fisik", aliases: ["fs:tensi", "fs tensi", "tensi", "td", "tekanan darah", "blood pressure", "sistole/diastole", "sistolik diastolik"] },
  { key: "TD", label: "Tekanan Darah - alias", group: "Fisik", aliases: ["td", "tensi", "tekanan darah", "blood pressure", "fs:tensi", "fs tensi"] },
  { key: "SISTOLIK", label: "Tekanan Darah Sistolik", group: "Fisik", aliases: ["sistolik", "sistole", "systolic", "sistole td", "sistol"] },
  { key: "DIASTOLIK", label: "Tekanan Darah Diastolik", group: "Fisik", aliases: ["diastolik", "diastole", "diastolic", "diastole td", "diastol"] },
  { key: "FS:Nadi", label: "Nadi", group: "Fisik", aliases: ["fs:nadi", "fs nadi", "nadi", "pulse", "heart rate", "hr"] },
  { key: "NADI", label: "Nadi - alias", group: "Fisik", aliases: ["nadi", "pulse", "heart rate", "hr", "fs:nadi"] },
  { key: "FS:Nafas", label: "Nafas / Respirasi", group: "Fisik", aliases: ["fs:nafas", "fs nafas", "nafas", "napas", "rr", "respirasi", "respiration", "respiratory rate"] },
  { key: "FS:ButaWarna", label: "Buta Warna", group: "Fisik", aliases: ["fs:butawarna", "buta warna", "color blind", "ishihara"] },
  { key: "VISUS_OD", label: "Visus OD / Mata Kanan", group: "Fisik", aliases: ["visus od", "mata kanan", "od", "visus kanan", "right eye"] },
  { key: "VISUS_OS", label: "Visus OS / Mata Kiri", group: "Fisik", aliases: ["visus os", "mata kiri", "os", "visus kiri", "left eye"] },

  // Laboratorium hematologi
  { key: "DL:Hb", label: "Hemoglobin / Hb", group: "Laboratorium", aliases: ["dl:hb", "dl hb", "hb", "hemoglobin", "haemoglobin"] },
  { key: "HB", label: "Hemoglobin - alias", group: "Laboratorium", aliases: ["hb", "hemoglobin", "dl:hb", "dl hb"] },
  { key: "DL:Leu", label: "Leukosit", group: "Laboratorium", aliases: ["dl:leu", "dl leu", "leu", "leukosit", "leukocyte", "wbc", "white blood cell"] },
  { key: "LEUKOSIT", label: "Leukosit - alias", group: "Laboratorium", aliases: ["leukosit", "leu", "wbc", "dl:leu"] },
  { key: "DL:Ht", label: "Hematokrit / Ht", group: "Laboratorium", aliases: ["dl:ht", "dl ht", "ht", "hematokrit", "hematocrit", "hct"] },
  { key: "DL:Trom", label: "Trombosit", group: "Laboratorium", aliases: ["dl:trom", "dl trom", "trom", "trombosit", "platelet", "plt"] },
  { key: "TROMBOSIT", label: "Trombosit - alias", group: "Laboratorium", aliases: ["trombosit", "platelet", "plt", "dl:trom"] },
  { key: "DL:Eri", label: "Eritrosit", group: "Laboratorium", aliases: ["dl:eri", "dl eri", "eri", "eritrosit", "erythrocyte", "rbc"] },
  { key: "LED", label: "LED / ESR", group: "Laboratorium", aliases: ["led", "laju endap darah", "esr"] },

  // Laboratorium gula & lipid
  { key: "GD:GDP", label: "Gula Darah Puasa / GDP", group: "Laboratorium", aliases: ["gd:gdp", "gd gdp", "gdp", "gula darah puasa", "glukosa puasa", "fasting glucose", "fbs"] },
  { key: "GDP", label: "GDP - alias", group: "Laboratorium", aliases: ["gdp", "gula darah puasa", "gd:gdp", "fbs"] },
  { key: "GD:Sewaktu", label: "Gula Darah Sewaktu / GDS", group: "Laboratorium", aliases: ["gd:sewaktu", "gd sewaktu", "gds", "gula darah sewaktu", "glukosa sewaktu", "random glucose", "rbs"] },
  { key: "GDS", label: "GDS - alias", group: "Laboratorium", aliases: ["gds", "gula darah sewaktu", "gd:sewaktu", "random glucose", "rbs"] },
  { key: "HBA1C", label: "HbA1c", group: "Laboratorium", aliases: ["hba1c", "hb a1c", "a1c"] },
  { key: "LD:Chol", label: "Kolesterol Total", group: "Laboratorium", aliases: ["ld:chol", "ld chol", "chol", "kolesterol", "kolesterol total", "cholesterol", "total cholesterol"] },
  { key: "CHOL", label: "Kolesterol - alias", group: "Laboratorium", aliases: ["chol", "kolesterol", "kolesterol total", "ld:chol"] },
  { key: "LD:HDL", label: "HDL", group: "Laboratorium", aliases: ["ld:hdl", "ld hdl", "hdl", "hdl cholesterol"] },
  { key: "HDL", label: "HDL - alias", group: "Laboratorium", aliases: ["hdl", "ld:hdl"] },
  { key: "LD:LDL", label: "LDL", group: "Laboratorium", aliases: ["ld:ldl", "ld ldl", "ldl", "ldl cholesterol"] },
  { key: "LDL", label: "LDL - alias", group: "Laboratorium", aliases: ["ldl", "ld:ldl"] },
  { key: "LD:Trig", label: "Trigliserida", group: "Laboratorium", aliases: ["ld:trig", "ld trig", "trig", "trigliserida", "triglyceride", "tg"] },
  { key: "TRIG", label: "Trigliserida - alias", group: "Laboratorium", aliases: ["trig", "trigliserida", "triglyceride", "ld:trig", "tg"] },

  // Laboratorium ginjal, hati, hepatitis
  { key: "FK:Ureum", label: "Ureum", group: "Laboratorium", aliases: ["fk:ureum", "fk ureum", "ureum", "urea", "bun"] },
  { key: "UREUM", label: "Ureum - alias", group: "Laboratorium", aliases: ["ureum", "fk:ureum", "urea", "bun"] },
  { key: "FK:Kreatinin", label: "Kreatinin", group: "Laboratorium", aliases: ["fk:kreatinin", "fk kreatinin", "kreatinin", "creatinine", "creat"] },
  { key: "KREATININ", label: "Kreatinin - alias", group: "Laboratorium", aliases: ["kreatinin", "creatinine", "fk:kreatinin"] },
  { key: "FK:AsamUrat", label: "Asam Urat", group: "Laboratorium", aliases: ["fk:asamurat", "fk asamurat", "asam urat", "uric acid", "au"] },
  { key: "ASAM_URAT", label: "Asam Urat - alias", group: "Laboratorium", aliases: ["asam urat", "uric acid", "fk:asamurat"] },
  { key: "FH:SGOT", label: "SGOT / AST", group: "Laboratorium", aliases: ["fh:sgot", "fh sgot", "sgot", "ast"] },
  { key: "SGOT", label: "SGOT - alias", group: "Laboratorium", aliases: ["sgot", "ast", "fh:sgot"] },
  { key: "FH:SGPT", label: "SGPT / ALT", group: "Laboratorium", aliases: ["fh:sgpt", "fh sgpt", "sgpt", "alt"] },
  { key: "SGPT", label: "SGPT - alias", group: "Laboratorium", aliases: ["sgpt", "alt", "fh:sgpt"] },
  { key: "BILIRUBIN", label: "Bilirubin", group: "Laboratorium", aliases: ["bilirubin", "bilirubin total", "total bilirubin"] },
  { key: "HP:HBsAg", label: "HBsAg", group: "Laboratorium", aliases: ["hp:hbsag", "hp hbsag", "hbsag", "hbs ag"] },
  { key: "HBSAG", label: "HBsAg - alias", group: "Laboratorium", aliases: ["hbsag", "hp:hbsag"] },
  { key: "ANTI_HBS", label: "Anti HBs", group: "Laboratorium", aliases: ["anti hbs", "antihbs", "anti-hbs"] },
  { key: "ANTI_HCV", label: "Anti HCV", group: "Laboratorium", aliases: ["anti hcv", "antihcv", "anti-hcv"] },

  // Urine
  { key: "UR:Warna", label: "Urine - Warna", group: "Urine", aliases: ["ur:warna", "ur warna", "warna urine", "urine warna", "warna urin"] },
  { key: "UR:Kejernihan", label: "Urine - Kejernihan", group: "Urine", aliases: ["ur:kejernihan", "kejernihan urine", "urine kejernihan", "clarity"] },
  { key: "UR:pH", label: "Urine - pH", group: "Urine", aliases: ["ur:ph", "ph urine", "urine ph", "pH"] },
  { key: "UR:BeratJenis", label: "Urine - Berat Jenis", group: "Urine", aliases: ["ur:beratjenis", "berat jenis urine", "bj urine", "specific gravity"] },
  { key: "UR:Prot", label: "Urine - Protein", group: "Urine", aliases: ["ur:prot", "protein urine", "urine protein", "protein urin"] },
  { key: "UR:Glu", label: "Urine - Glukosa", group: "Urine", aliases: ["ur:glu", "glukosa urine", "urine glukosa", "glucose urine"] },
  { key: "UR:Keton", label: "Urine - Keton", group: "Urine", aliases: ["ur:keton", "keton urine", "urine keton", "ketone"] },
  { key: "UR:Bilirubin", label: "Urine - Bilirubin", group: "Urine", aliases: ["ur:bilirubin", "bilirubin urine"] },
  { key: "UR:Urobilinogen", label: "Urine - Urobilinogen", group: "Urine", aliases: ["ur:urobilinogen", "urobilinogen"] },
  { key: "UR:Eritrosit", label: "Urine - Eritrosit", group: "Urine", aliases: ["ur:eritrosit", "eritrosit urine", "rbc urine"] },
  { key: "UR:Leukosit", label: "Urine - Leukosit", group: "Urine", aliases: ["ur:leukosit", "leukosit urine", "wbc urine"] },
  { key: "UR:Nitrit", label: "Urine - Nitrit", group: "Urine", aliases: ["ur:nitrit", "nitrit", "nitrite"] },
  { key: "UR:Bakteri", label: "Urine - Bakteri", group: "Urine", aliases: ["ur:bakteri", "bakteri urine", "urine bakteri", "bacteria"] },

  // Penunjang
  { key: "Thorax Foto", label: "Thorax Foto", group: "Penunjang", aliases: ["thorax foto", "foto thorax", "rontgen thorax", "xray thorax", "x-ray thorax", "chest xray", "thorax"] },
  { key: "Hasilthorax", label: "Hasil Thorax", group: "Penunjang", aliases: ["hasilthorax", "hasil thorax", "kesan thorax", "interpretasi thorax", "xray result"] },
  { key: "EKG", label: "EKG / ECG", group: "Penunjang", aliases: ["ekg", "ecg", "electrocardiography", "elektrokardiografi"] },
  { key: "HasilEKG", label: "Hasil EKG", group: "Penunjang", aliases: ["hasil ekg", "hasil ecg", "kesan ekg", "interpretasi ekg"] },
  { key: "AUDIOMETRI", label: "Audiometri", group: "Penunjang", aliases: ["audiometri", "audiometry", "hearing test"] },
  { key: "SPIROMETRI", label: "Spirometri", group: "Penunjang", aliases: ["spirometri", "spirometry", "fungsi paru"] },
  { key: "USG", label: "USG", group: "Penunjang", aliases: ["usg", "ultrasound", "hasil usg"] },
  { key: "PAPSMEAR", label: "Pap Smear", group: "Penunjang", aliases: ["pap smear", "papsmear", "pap-smear"] },
  { key: "TREADMILL", label: "Treadmill", group: "Penunjang", aliases: ["treadmill", "stress test", "exercise test"] },

  // Output PDF / Analyzer
  { key: "KATEGORI", label: "Kategori / Fit Status", group: "Output PDF", aliases: ["kategori", "category", "fit status", "status fit", "status", "kelaikan"] },
  { key: "KESIMPULAN", label: "Kesimpulan", group: "Output PDF", aliases: ["kesimpulan", "conclusion", "resume", "summary"] },
  { key: "SARAN", label: "Saran", group: "Output PDF", aliases: ["saran", "recommendation", "rekomendasi", "next step", "anjuran"] },
];

export function normalizeAiMcuHeader(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\-./]+/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

export function buildAiMcuAutoMapping(headers: string[], fields: AiMcuMappingField[] = AI_MCU_MAPPING_FIELDS) {
  const mapping: Record<string, string> = {};
  const normalizedHeaders = headers.map((header) => ({
    raw: header,
    norm: normalizeAiMcuHeader(header),
  }));

  for (const field of fields) {
    const aliases = [field.key, field.label, ...field.aliases]
      .map(normalizeAiMcuHeader)
      .filter(Boolean);

    let found = "";

    for (const header of normalizedHeaders) {
      if (aliases.includes(header.norm)) {
        found = header.raw;
        break;
      }
    }

    if (!found) {
      for (const header of normalizedHeaders) {
        if (
          aliases.some(
            (alias) =>
              alias.length >= 3 &&
              header.norm.length >= 3 &&
              (header.norm.includes(alias) || alias.includes(header.norm))
          )
        ) {
          found = header.raw;
          break;
        }
      }
    }

    if (found && !mapping[field.key]) {
      mapping[field.key] = found;
    }
  }

  return mapping;
}

export function getAiMcuFieldByKey(key: string) {
  return AI_MCU_MAPPING_FIELDS.find((field) => field.key === key);
}

export function isAiMcuClinicalField(field: AiMcuMappingField) {
  return field.group === "Fisik" || field.group === "Laboratorium" || field.group === "Urine" || field.group === "Penunjang";
}

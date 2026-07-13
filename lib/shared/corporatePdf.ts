export type CorporatePdfSectionCode =
  | "COVER"
  | "CONCLUSION"
  | "PHYSICAL"
  | "LAB"
  | "PROFILE_PHOTO"
  | "XRAY_THORAX"
  | "XRAY_THORAX_IMAGE"
  | "EKG"
  | "EKG_IMAGE"
  | "TREADMILL"
  | "TREADMILL_IMAGE"
  | "SPIROMETRY"
  | "SPIROMETRY_IMAGE"
  | "AUDIOMETRY"
  | "AUDIOMETRY_IMAGE"
  | "USG"
  | "USG_IMAGE";

export type CorporatePdfSectionDefinition = {
  code: CorporatePdfSectionCode;
  label: string;
  group: "utama" | "penunjang" | "lampiran";
  required?: boolean;
  defaultEnabled?: boolean;
};

export const CORPORATE_PDF_SECTIONS: CorporatePdfSectionDefinition[] = [
  { code: "COVER", label: "Cover dan Data Pasien", group: "utama", required: true, defaultEnabled: true },
  { code: "CONCLUSION", label: "Kesimpulan dan Fit Status", group: "utama", required: true, defaultEnabled: true },
  { code: "PHYSICAL", label: "Pemeriksaan Fisik", group: "utama", defaultEnabled: true },
  { code: "LAB", label: "Laboratorium", group: "utama", defaultEnabled: true },
  { code: "PROFILE_PHOTO", label: "Foto Profil Peserta", group: "lampiran", defaultEnabled: true },
  { code: "XRAY_THORAX", label: "Thorax Foto", group: "penunjang", defaultEnabled: true },
  { code: "XRAY_THORAX_IMAGE", label: "Lampiran Foto Thorax", group: "lampiran", defaultEnabled: true },
  { code: "EKG", label: "Elektrokardiografi", group: "penunjang", defaultEnabled: true },
  { code: "EKG_IMAGE", label: "Lampiran EKG", group: "lampiran", defaultEnabled: true },
  { code: "TREADMILL", label: "Treadmill", group: "penunjang", defaultEnabled: true },
  { code: "TREADMILL_IMAGE", label: "Lampiran Treadmill", group: "lampiran", defaultEnabled: true },
  { code: "SPIROMETRY", label: "Spirometri", group: "penunjang", defaultEnabled: true },
  { code: "SPIROMETRY_IMAGE", label: "Lampiran Spirogram", group: "lampiran", defaultEnabled: true },
  { code: "AUDIOMETRY", label: "Audiometri", group: "penunjang", defaultEnabled: true },
  { code: "AUDIOMETRY_IMAGE", label: "Lampiran Audiogram", group: "lampiran", defaultEnabled: true },
  { code: "USG", label: "USG", group: "penunjang", defaultEnabled: true },
  { code: "USG_IMAGE", label: "Lampiran USG", group: "lampiran", defaultEnabled: true },
];

export type CorporateAssetType =
  | "PROFILE_PHOTO"
  | "XRAY_THORAX_IMAGE"
  | "EKG_IMAGE"
  | "TREADMILL_IMAGE"
  | "SPIROMETRY_IMAGE"
  | "AUDIOMETRY_IMAGE"
  | "USG_IMAGE";

export const CORPORATE_ASSET_TYPES: Array<{
  code: CorporateAssetType;
  label: string;
  rowField: string;
  fileToken: string[];
}> = [
  { code: "PROFILE_PHOTO", label: "Foto Profile", rowField: "PhotoUrl", fileToken: ["profile", "profil", "foto", "photo", "id"] },
  { code: "XRAY_THORAX_IMAGE", label: "Foto Rontgen / Thorax", rowField: "Link Foto Rontgen", fileToken: ["rontgen", "thorax", "xray", "x-ray", "chest"] },
  { code: "EKG_IMAGE", label: "Lampiran EKG", rowField: "Link EKG", fileToken: ["ekg", "ecg", "elektrokardiografi", "elektrokardiographi"] },
  { code: "TREADMILL_IMAGE", label: "Lampiran Treadmill", rowField: "Link Treadmill", fileToken: ["treadmill", "treadmil"] },
  { code: "SPIROMETRY_IMAGE", label: "Lampiran Spirogram", rowField: "Link Spirometri", fileToken: ["spirometri", "spirometry", "spiro", "spirogram"] },
  { code: "AUDIOMETRY_IMAGE", label: "Lampiran Audiogram", rowField: "Link Audiometri", fileToken: ["audiometri", "audiometry", "audio", "audiogram"] },
  { code: "USG_IMAGE", label: "Lampiran USG", rowField: "Link USG", fileToken: ["usg", "ultrasound"] },
];

export const CORPORATE_SIGNATORY_FIELDS = [
  { key: "coordinator", label: "Koordinator MCU", rowField: "Koordinator MCU" },
  { key: "physical", label: "Penanggung Jawab Pemeriksaan Fisik", rowField: "Dokter MCU" },
  { key: "lab", label: "Penanggung Jawab Laboratorium", rowField: "Penanggung Jawab Laboratorium" },
  { key: "radiology", label: "Penanggung Jawab Rontgen / Thorax", rowField: "Penanggung Jawab Rontgen" },
  { key: "ekg", label: "Penanggung Jawab EKG", rowField: "Penanggung Jawab EKG" },
  { key: "treadmill", label: "Penanggung Jawab Treadmill", rowField: "Penanggung Jawab Treadmill" },
  { key: "spirometry", label: "Penanggung Jawab Spirometri", rowField: "Penanggung Jawab Spirometri" },
  { key: "audiometry", label: "Penanggung Jawab Audiometri", rowField: "Penanggung Jawab Audiometri" },
  { key: "usg", label: "Penanggung Jawab USG", rowField: "Penanggung Jawab USG" },
] as const;

export const CORPORATE_SUPPORT_CONFIG = {
  XRAY_THORAX: {
    sheetName: "RONTGEN",
    resultField: "Hasil Thorax",
    conclusionField: "Thorax Foto",
    imageField: "Link Foto Rontgen",
    doctorField: "Penanggung Jawab Rontgen",
    resultAliases: ["Hasilthorax", "Hasil Thorax", "Hasil Thorax Foto", "Hasil Rontgen", "HASIL RONTGEN", "HASIL THORAX FOTO", "Result Thorax", "Result Rontgen"],
    conclusionAliases: ["Thorax Foto", "Rontgen Thorax", "Foto Thorax", "HASIL RONTGEN", "HASIL THORAX FOTO", "RONTGEN", "Kesimpulan Rontgen", "Kesimpulan Thorax", "Kesan Rontgen", "Kesan Thorax"],
  },
  EKG: {
    sheetName: "EKG",
    resultField: "Hasil EKG",
    conclusionField: "Elektrokardiographi",
    imageField: "Link EKG",
    doctorField: "Penanggung Jawab EKG",
    resultAliases: ["HasilEKG", "Hasil EKG", "Result EKG", "Hasil Elektrokardiografi", "Hasil Elektrokardiographi", "Result Elektrokardiografi", "Result Elektrokardiographi"],
    conclusionAliases: ["Elektrokardiographi", "Elektrokardiografi", "EKG", "ECG", "HASIL EKG", "Kesimpulan EKG", "Interpretasi EKG"],
  },
  TREADMILL: {
    sheetName: "TREADMILL",
    resultField: "Hasil Treadmill",
    conclusionField: "KESIMPULAN TREADMILL",
    imageField: "Link Treadmill",
    doctorField: "Penanggung Jawab Treadmill",
    resultAliases: ["HasilTreadmil", "Hasil Treadmil", "HasilTreadmill", "Hasil Treadmill", "HASIL TREADMILL", "Treadmill"],
    conclusionAliases: ["KESIMPULAN TREADMILL", "Kesimpulan Treadmill", "Interpretasi Treadmill"],
  },
  SPIROMETRY: {
    sheetName: "SPIROMETRI",
    resultField: "Hasil Spirometri",
    conclusionField: "KESIMPULAN SPIROMETRI",
    imageField: "Link Spirometri",
    doctorField: "Penanggung Jawab Spirometri",
    resultAliases: ["Hasil Spirometri", "Hasil Spiro", "Spirometri", "Spirometry", "SPIRO"],
    conclusionAliases: ["KESIMPULAN SPIROMETRI", "Kesimpulan Spirometri", "Interpretasi Spirometri", "Kesan Spirometri"],
  },
  AUDIOMETRY: {
    sheetName: "AUDIOMETRI",
    resultField: "Hasil Audiometri",
    conclusionField: "AUDIOMETRI",
    imageField: "Link Audiometri",
    doctorField: "Penanggung Jawab Audiometri",
    resultAliases: ["HasilAudiometri", "Hasil Audiometri", "HASIL AUDIOMETRI", "Hasil Audio"],
    conclusionAliases: ["AUDIOMETRI", "Audiometri", "AUDIO", "Kesimpulan Audiometri", "Interpretasi Audiometri"],
  },
  USG: {
    sheetName: "USG",
    resultField: "Hasil USG",
    conclusionField: "USG",
    imageField: "Link USG",
    doctorField: "Penanggung Jawab USG",
    resultAliases: ["HasilUSG", "Hasil USG", "Result USG"],
    conclusionAliases: ["USG", "USG ABDOMEN", "Hasil USG", "HASIL USG", "HASIL USG ABDOMEN", "KESAN USG", "KESIMPULAN USG"],
  },
} as const;

const IDENTITY_KEYS = new Set([
  "no", "nomcu", "no mcu", "no.mcu", "mcu_id", "nama", "name", "nik", "nik/nrp/id", "nrp", "id",
  "jk", "jenis kelamin", "gender", "sex", "tgllahir", "tgl lahir", "tanggal lahir", "dob", "usia", "umur", "age",
  "nama pt", "perusahaan", "company", "departemen", "department", "dept", "bagian", "dept/bagian", "jabatan", "position",
  "paket", "tanggal mcu", "tgl mcu", "tglmcu", "tanggal pemeriksaan", "medical_record_no", "no_mr", "no mr", "no. medical record",
]);

const SUMMARY_KEYS = new Set(["kategori", "fit_status", "fit status", "status", "kelayakan", "kesimpulan", "saran", "rekomendasi"]);
const LAB_PREFIXES = ["dl:", "hj:", "ld:", "gd:", "fg:", "fk:", "fh:", "hp:", "ur:"];
const PHYSICAL_PREFIXES = ["fs:"];

export function cleanCellValue(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text || ["-", "null", "undefined", "nan"].includes(text.toLowerCase())) return "";
  return text;
}

export function normalizeLookup(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function normalizeCode(value: unknown): string {
  const raw = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return String(Number(raw));
  return raw.replace(/[^A-Z0-9]+/g, "");
}

export function pickRowValue(row: Record<string, unknown>, aliases: readonly string[]): string {
  const entries = Object.entries(row || {});
  for (const alias of aliases) {
    const direct = cleanCellValue(row[alias]);
    if (direct) return direct;
    const target = normalizeLookup(alias);
    const found = entries.find(([key]) => normalizeLookup(key) === target);
    if (found) {
      const value = cleanCellValue(found[1]);
      if (value) return value;
    }
  }
  return "";
}


// CORPORATE_SUPPORT_TEXT_PARSER_V408
// Memecah satu sel gabungan menjadi area Hasil dan Kesimpulan secara otomatis.
type SupportTextBucket = "result" | "conclusion";
type SupportTextRule = { label: string; display: string; bucket: SupportTextBucket };

const COMMON_SUPPORT_RULES: SupportTextRule[] = [
  { label: "hasil pemeriksaan", display: "Hasil pemeriksaan", bucket: "result" },
  { label: "hasil", display: "Hasil", bucket: "result" },
  { label: "result", display: "Result", bucket: "result" },
  { label: "temuan", display: "Temuan", bucket: "result" },
  { label: "findings", display: "Findings", bucket: "result" },
  { label: "kesimpulan", display: "Kesimpulan", bucket: "conclusion" },
  { label: "kesan", display: "Kesan", bucket: "conclusion" },
  { label: "interpretasi", display: "Interpretasi", bucket: "conclusion" },
  { label: "impression", display: "Impression", bucket: "conclusion" },
  { label: "diagnosis", display: "Diagnosis", bucket: "conclusion" },
];

const SUPPORT_TEXT_RULES: Record<string, SupportTextRule[]> = {
  XRAY_THORAX: [
    { label: "sinus costophrenicus", display: "Sinus costophrenicus", bucket: "result" },
    { label: "diafragma", display: "Diafragma", bucket: "result" },
    { label: "pulmo", display: "Pulmo", bucket: "result" },
    { label: "cor", display: "Cor", bucket: "result" },
  ],
  EKG: [
    { label: "heart rate", display: "Heart rate", bucket: "result" },
    { label: "frekuensi", display: "Frekuensi", bucket: "result" },
    { label: "irama", display: "Irama", bucket: "result" },
    { label: "axis", display: "Axis", bucket: "result" },
    { label: "aksis", display: "Aksis", bucket: "result" },
    { label: "pr interval", display: "PR interval", bucket: "result" },
    { label: "qrs duration", display: "QRS duration", bucket: "result" },
    { label: "qt/qtc", display: "QT/QTc", bucket: "result" },
    { label: "st-t", display: "ST-T", bucket: "result" },
  ],
  TREADMILL: [
    { label: "kelas fungsional", display: "Kelas fungsional", bucket: "conclusion" },
    { label: "kapasitas kerja fisik", display: "Kapasitas kerja fisik", bucket: "conclusion" },
    { label: "klasifikasi kebugaran", display: "Klasifikasi kebugaran", bucket: "conclusion" },
    { label: "respons iskemik", display: "Respons iskemik", bucket: "result" },
    { label: "respon iskemik", display: "Respon iskemik", bucket: "result" },
    { label: "ischemic response", display: "Ischemic response", bucket: "result" },
  ],
  SPIROMETRY: [
    { label: "fev1/fvc", display: "FEV1/FVC", bucket: "result" },
    { label: "fev1", display: "FEV1", bucket: "result" },
    { label: "fvc", display: "FVC", bucket: "result" },
    { label: "pef", display: "PEF", bucket: "result" },
    { label: "pola ventilasi", display: "Pola ventilasi", bucket: "conclusion" },
  ],
  AUDIOMETRY: [
    { label: "telinga kanan", display: "Telinga kanan", bucket: "result" },
    { label: "telinga kiri", display: "Telinga kiri", bucket: "result" },
    { label: "ambang dengar", display: "Ambang dengar", bucket: "result" },
    { label: "audiogram", display: "Audiogram", bucket: "result" },
  ],
  USG: [
    { label: "vesica fellea", display: "Vesica fellea", bucket: "result" },
    { label: "vesica urinaria", display: "Vesica urinaria", bucket: "result" },
    { label: "ginjal kanan", display: "Ginjal kanan", bucket: "result" },
    { label: "ginjal kiri", display: "Ginjal kiri", bucket: "result" },
    { label: "pancreas", display: "Pancreas", bucket: "result" },
    { label: "hepar", display: "Hepar", bucket: "result" },
    { label: "lien", display: "Lien", bucket: "result" },
    { label: "prostat", display: "Prostat", bucket: "result" },
    { label: "uterus", display: "Uterus", bucket: "result" },
    { label: "ovarium", display: "Ovarium", bucket: "result" },
  ],
};

function escapeSupportRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSupportSource(value: unknown) {
  return cleanCellValue(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function supportComparable(value: unknown) {
  return normalizeSupportSource(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function pushUniqueLine(target: string[], value: string) {
  const line = value.trim().replace(/^[\s:：;,-]+/, "").trim();
  if (!line) return;
  const key = supportComparable(line);
  if (!key || target.some((existing) => supportComparable(existing) === key)) return;
  target.push(line);
}

function splitCombinedSupportText(code: string, source: string) {
  const rules = [...(SUPPORT_TEXT_RULES[code] || []), ...COMMON_SUPPORT_RULES];
  const unique = new Map<string, SupportTextRule>();
  for (const rule of rules) {
    const key = rule.label.toLowerCase();
    if (!unique.has(key)) unique.set(key, rule);
  }
  const ordered = Array.from(unique.values()).sort((a, b) => b.label.length - a.label.length);
  const byLabel = new Map(ordered.map((rule) => [rule.label.toLowerCase(), rule]));
  const pattern = ordered.map((rule) => escapeSupportRegExp(rule.label)).join("|");
  if (!pattern) return { result: "", conclusion: "", recognized: false };

  // Label harus diikuti tanda titik dua. Ini mencegah kata biasa di dalam kalimat
  // dianggap sebagai nama parameter.
  const regex = new RegExp(`(^|[^A-Za-z0-9])(${pattern})\\s*[:：]\\s*`, "gim");
  const matches: Array<{ rawStart: number; valueStart: number; rule: SupportTextRule }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    const rule = byLabel.get(String(match[2] || "").toLowerCase());
    if (!rule) continue;
    matches.push({ rawStart: match.index, valueStart: regex.lastIndex, rule });
  }
  if (!matches.length) return { result: "", conclusion: "", recognized: false };

  const resultLines: string[] = [];
  const conclusionLines: string[] = [];
  const preamble = source.slice(0, matches[0].rawStart).trim();
  if (preamble) pushUniqueLine(resultLines, preamble);

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const end = index + 1 < matches.length ? matches[index + 1].rawStart : source.length;
    const value = source.slice(current.valueStart, end).trim().replace(/^[\s:：;,-]+/, "").trim();
    if (!value) continue;
    const line = `${current.rule.display} : ${value}`;
    pushUniqueLine(current.rule.bucket === "conclusion" ? conclusionLines : resultLines, line);
  }

  return {
    result: resultLines.join("\n"),
    conclusion: conclusionLines.join("\n"),
    recognized: Boolean(resultLines.length || conclusionLines.length),
  };
}

export function parseSupportExamination(row: Record<string, unknown>, code: string) {
  const config = supportConfigForCode(code);
  if (!config) return { result: "", conclusion: "" };

  const directResult = normalizeSupportSource(pickRowValue(row, config.resultAliases));
  const directConclusion = normalizeSupportSource(pickRowValue(row, config.conclusionAliases));
  const sameValue = Boolean(
    directResult && directConclusion && supportComparable(directResult) === supportComparable(directConclusion)
  );

  // Jika data vendor hanya menyediakan satu kolom gabungan, pecah berdasarkan
  // label yang ada di dalam isi sel.
  const combined = sameValue
    ? directResult
    : directResult && !directConclusion
      ? directResult
      : directConclusion && !directResult
        ? directConclusion
        : "";

  if (combined) {
    const parsed = splitCombinedSupportText(code, combined);
    if (parsed.recognized) {
      return {
        result: parsed.result,
        conclusion: parsed.conclusion,
      };
    }
  }

  // Jangan menggandakan teks yang sama ke bagian Hasil dan Kesimpulan.
  if (sameValue) return { result: directResult, conclusion: "" };
  return { result: directResult, conclusion: directConclusion };
}

export function parameterCategory(key: string): "identity" | "summary" | "physical" | "lab" | "support" | "attachment" | "other" {
  const lower = key.trim().toLowerCase();
  const norm = lower.replace(/\s+/g, " ");
  if (IDENTITY_KEYS.has(norm)) return "identity";
  if (SUMMARY_KEYS.has(norm)) return "summary";
  // CORPORATE_LIPE_PHYSICAL_ALIAS_V416
  // Beberapa workbook memakai LIPE / FS:LiPe untuk Lingkar Perut.
  if (["lipe", "lingkarperut", "waistcircumference", "waist"].includes(normalizeLookup(key))) return "physical";
  if (PHYSICAL_PREFIXES.some((prefix) => lower.startsWith(prefix))) return "physical";
  if (LAB_PREFIXES.some((prefix) => lower.startsWith(prefix))) return "lab";
  if (CORPORATE_ASSET_TYPES.some((item) => normalizeLookup(item.rowField) === normalizeLookup(key))) return "attachment";
  for (const config of Object.values(CORPORATE_SUPPORT_CONFIG)) {
    if ([...config.resultAliases, ...config.conclusionAliases].some((alias) => normalizeLookup(alias) === normalizeLookup(key))) {
      return "support";
    }
  }
  return "other";
}

export function isPhysicalParameter(key: string): boolean {
  return parameterCategory(key) === "physical";
}

export function isLabParameter(key: string): boolean {
  return parameterCategory(key) === "lab";
}

export function isRequiredParameter(key: string): boolean {
  const category = parameterCategory(key);
  return category === "identity" || category === "summary";
}

export function assetFieldForType(type: string): string {
  return CORPORATE_ASSET_TYPES.find((item) => item.code === type)?.rowField || "";
}

export function supportConfigForCode(code: string) {
  return (CORPORATE_SUPPORT_CONFIG as Record<string, (typeof CORPORATE_SUPPORT_CONFIG)[keyof typeof CORPORATE_SUPPORT_CONFIG]>)[code];
}

export function sectionHasText(row: Record<string, unknown>, code: string): boolean {
  const config = supportConfigForCode(code);
  if (!config) return false;
  return Boolean(pickRowValue(row, config.resultAliases) || pickRowValue(row, config.conclusionAliases));
}

export function sectionHasImage(row: Record<string, unknown>, code: string): boolean {
  const asset = CORPORATE_ASSET_TYPES.find((item) => item.code === code);
  if (!asset) return false;
  return Boolean(pickRowValue(row, [asset.rowField]));
}

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
    conclusionField: "HASIL SPIROMETRI",
    imageField: "Link Spirometri",
    doctorField: "Penanggung Jawab Spirometri",
    resultAliases: ["Hasil Spirometri", "Hasil Spiro", "Spirometri", "Spirometry", "SPIRO"],
    conclusionAliases: ["HASIL SPIROMETRI", "Kesimpulan Spirometri", "Interpretasi Spirometri"],
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

export function parameterCategory(key: string): "identity" | "summary" | "physical" | "lab" | "support" | "attachment" | "other" {
  const lower = key.trim().toLowerCase();
  const norm = lower.replace(/\s+/g, " ");
  if (IDENTITY_KEYS.has(norm)) return "identity";
  if (SUMMARY_KEYS.has(norm)) return "summary";
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

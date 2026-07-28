// WELLNESS_COMPANY_ISOLATION_V126C_FINAL
// WELLNESS_PARTICIPANT_ALL_FORMS_EXISTING_GS_V398_HELPER
// WELLNESS_LOCAL_DATE_JAKARTA_V126M13_2
// Server helper for the existing Google Apps Script webhook v370.
// It supports:
// - action=uploadEvidence for Google Drive upload
// - row append to the existing Form Responses sheet

export function cleanGsValue(value: any) {
  return String(value ?? "").trim();
}

const JAKARTA_OFFSET_MS_V126M13 = 7 * 60 * 60 * 1000;

export function jakartaDateKeyV126M13(value: Date = new Date()) {
  const safeValue =
    value instanceof Date && !Number.isNaN(value.getTime())
      ? value
      : new Date();
  const shifted = new Date(
    safeValue.getTime() + JAKARTA_OFFSET_MS_V126M13,
  );
  return shifted.toISOString().slice(0, 10);
}

export function jakartaTimestampV126M13(value: Date = new Date()) {
  const safeValue =
    value instanceof Date && !Number.isNaN(value.getTime())
      ? value
      : new Date();
  const shifted = new Date(
    safeValue.getTime() + JAKARTA_OFFSET_MS_V126M13,
  );
  return shifted.toISOString().replace(/Z$/, "+07:00");
}

export function getWellnessWebhookUrl() {
  return cleanGsValue(process.env.WELLNESS_GOOGLE_SHEET_WEBHOOK_URL);
}

export function getWellnessWebhookSecret() {
  return cleanGsValue(
    process.env.WELLNESS_GOOGLE_SHEET_WEBHOOK_SECRET ||
      process.env.WELLNESS_WEBHOOK_SECRET ||
      ""
  );
}

export function getWellnessSheetName() {
  return cleanGsValue(process.env.WELLNESS_GOOGLE_SHEET_TAB_NAME) || "Form Responses";
}

export async function postToWellnessWebhook(payload: any) {
  const url = getWellnessWebhookUrl();
  if (!url) {
    throw new Error("WELLNESS_GOOGLE_SHEET_WEBHOOK_URL belum diatur.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: getWellnessWebhookSecret(),
      ...payload,
    }),
  });

  const text = await response.text();
  let json: any = {};

  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { ok: false, message: text || "Invalid webhook response" };
  }

  if (!response.ok || json?.ok === false) {
    throw new Error(json?.message || `Webhook gagal: HTTP ${response.status}`);
  }

  return json;
}

export async function fileToBase64(fileLike: any) {
  if (!fileLike || typeof fileLike !== "object") return null;
  if (typeof fileLike.arrayBuffer !== "function") return null;

  const arrayBuffer = await fileLike.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!buffer.length) return null;

  return {
    dataBase64: buffer.toString("base64"),
    filename: cleanGsValue(fileLike.name) || `wellness-evidence-${Date.now()}`,
    contentType: cleanGsValue(fileLike.type) || "application/octet-stream",
    size: buffer.length,
  };
}

export function safeLogDate(value: any) {
  if (value instanceof Date) {
    return jakartaDateKeyV126M13(value);
  }

  const text = cleanGsValue(value);
  if (!text) return jakartaDateKeyV126M13();

  const exactDate = text.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (exactDate?.[1]) return exactDate[1];

  const localDateTime = text.match(
    /^(\d{4}-\d{2}-\d{2})[ T]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/,
  );
  if (localDateTime?.[1]) return localDateTime[1];

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return jakartaDateKeyV126M13(parsed);
  }

  const embeddedDate = text.match(/(\d{4}-\d{2}-\d{2})/);
  return embeddedDate?.[1] || jakartaDateKeyV126M13();
}

export function getCompanyName(participant: any, body?: any) {
  return (
    cleanGsValue(participant?.company) ||
    cleanGsValue(participant?.company_name) ||
    cleanGsValue(body?.company) ||
    "Tanpa Perusahaan"
  );
}

export async function uploadEvidenceToDrive(params: {
  file: any;
  participant: any;
  companyName?: string;
  category: "Nutrisi" | "Workout" | "Health Talk" | string;
  activeTab: string;
  fieldKey: string;
  logDate: string;
  marker: string;
}) {
  const converted = await fileToBase64(params.file);
  if (!converted) return null;

  return await postToWellnessWebhook({
    action: "uploadEvidence",
    filename: converted.filename,
    originalFilename: converted.filename,
    contentType: converted.contentType,
    dataBase64: converted.dataBase64,
    folderName: "wellness program",
    companyName: params.companyName || getCompanyName(params.participant),
    participantId: params.participant?.id,
    participant_id: params.participant?.id,
    participantCode: params.participant?.code,
    participant_code: params.participant?.code,
    participantName: params.participant?.name,
    participant_name: params.participant?.name,
    evidenceCategory: params.category,
    activeTab: params.activeTab,
    fieldKey: params.fieldKey,
    logDate: params.logDate,
    marker: params.marker,
  });
}

export function getDriveUrl(uploadResult: any) {
  return uploadResult?.driveUrl || uploadResult?.publicUrl || "";
}

export function getPreviewUrl(uploadResult: any) {
  return (
    uploadResult?.previewUrl ||
    uploadResult?.thumbnailUrl ||
    uploadResult?.publicUrl ||
    uploadResult?.driveUrl ||
    ""
  );
}

export function buildBaseFormRow(params: {
  participant: any;
  body?: any;
  logDate: string;
  logType: string;
  marker: string;
}) {
  const participant = params.participant || {};
  const body = params.body || {};
  const company = getCompanyName(participant, body);

  return {
    "Submission Date": jakartaTimestampV126M13(),
    "Pilih Nama Anda": participant.name || "",
    "Nama Peserta": participant.name || "",
    "Waktu Makan": "",
    "Add Options": "",
    "Upload Foto Makanan": "",
    "Preview Foto Makanan": "",
    "Melakukan Workout/Aktifitas Ringan?": "",
    "Jenis Workout/Aktifitas": "",
    "Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)": "",
    "Submission IP": "Harmony Health App",
    "Berapa Menit anda melakukan nya ?": "",
    "Berat badan Awal": participant.baseline_weight_kg || participant.weight_kg || "",
    "BB anda per hari ini (diisi sekali saja perminggu)": "",
    "Helper column BB jangan diubah": "",
    "BB Monitoring terbaru": "",
    "Lingkar Perut (cm)": participant.waist_cm || "",
    "BMI": participant.bmi || "",
    "Catatan Nutrisi": "",
    "Kalori Makanan": "",
    "Detected Foods": "",
    "Kalori Aktivitas": "",
    "Bukti Aktivitas": "",
    "Preview Bukti Aktivitas": "",
    "Healthtalk/Seminar": "",
    "Jenis Healthtalk": "",
    "Tanggal Healthtalk": "",
    "Bukti Healthtalk": "",
    "Preview Bukti Healthtalk": "",
    "Total Point": "",
    "Company ID": participant.wellness_company_id || participant.company_id || "",
    "Company": company,
    "Kelompok": participant.group_name || participant.kelompok || "",
    "Group Upload": "Portal Peserta",
    "Risk Cluster": participant.risk_cluster || "",
    "KODE": participant.code || "",
    "Participant ID": participant.id || "",
    "Log Date": params.logDate,
    "Log Type": params.logType,
    "Evidence Count": "",
    "Created By": "participant_portal",
    "Marker": params.marker,
  };
}

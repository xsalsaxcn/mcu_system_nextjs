// WELLNESS_COMPANY_ISOLATION_V126C_FINAL
// WELLNESS_PARTICIPANT_ALL_FORMS_EXISTING_GS_V398_HELPER
// Server helper for the existing Google Apps Script webhook v370.
// It supports:
// - action=uploadEvidence for Google Drive upload
// - row append to the existing Form Responses sheet

export function cleanGsValue(value: any) {
  return String(value ?? "").trim();
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
  const text = cleanGsValue(value);
  if (!text) return new Date().toISOString().slice(0, 10);

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text.slice(0, 10) || new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
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
    "Submission Date": new Date().toISOString(),
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

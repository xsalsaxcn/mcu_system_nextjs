// WELLNESS_GOOGLE_SHEET_RESPONSES_V406
// Read-only helper untuk dashboard/admin/portal membaca Form Responses Google Sheet.
// Nutrition dan Health Talk detail disimpan Google Sheet-only.
// Supabase tetap dipakai untuk session, peserta, master kalori, aktivitas, device.

function clean(value: any) {
  return String(value ?? "").trim();
}

function toNumberOrNull(value: any) {
  const text = clean(value);
  if (!text) return null;

  const numeric = Number(text.replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}

function getWebhookUrl() {
  return clean(process.env.WELLNESS_GOOGLE_SHEET_WEBHOOK_URL);
}

function getWebhookSecret() {
  return clean(
    process.env.WELLNESS_GOOGLE_SHEET_WEBHOOK_SECRET ||
      process.env.WELLNESS_WEBHOOK_SECRET ||
      ""
  );
}

function getSheetName() {
  return clean(process.env.WELLNESS_GOOGLE_SHEET_TAB_NAME) || "Form Responses";
}

function toIsoDate(value: any) {
  const text = clean(value);
  if (!text) return "";

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);

  return text.slice(0, 10);
}

function toTime(value: any) {
  const text = clean(value);
  if (!text) return "";

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const match = text.match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
}

function normalizeDrivePreview(value: any) {
  const text = clean(value);
  if (!text) return "";

  const match =
    text.match(/drive\.google\.com\/file\/d\/([^/]+)/i) ||
    text.match(/[?&]id=([^&]+)/i);

  if (match?.[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1200`;
  }

  return text;
}

function normalizeDriveView(value: any) {
  const text = clean(value);
  if (!text) return "";

  const match =
    text.match(/drive\.google\.com\/file\/d\/([^/]+)/i) ||
    text.match(/[?&]id=([^&]+)/i);

  if (match?.[1]) {
    return `https://drive.google.com/uc?export=view&id=${match[1]}`;
  }

  return text;
}

function splitHealthtalkAddOptions(value: any) {
  const text = clean(value);
  if (!text) {
    return {
      type: "",
      title: "",
    };
  }

  const parts = text.split(" - ").map((item) => clean(item)).filter(Boolean);

  return {
    type: parts[0] || "",
    title: parts.slice(1).join(" - ") || parts[0] || "",
  };
}

export async function fetchWellnessGoogleSheetRows(params?: {
  code?: string;
  participantId?: string | number;
  logType?: string;
  limit?: number;
}) {
  const url = getWebhookUrl();

  if (!url) {
    return {
      ok: false,
      rows: [],
      message: "WELLNESS_GOOGLE_SHEET_WEBHOOK_URL belum diisi.",
    };
  }

  const query = new URLSearchParams();
  query.set("action", "listRows");
  query.set("secret", getWebhookSecret());
  query.set("sheet", getSheetName());
  query.set("limit", String(params?.limit || 3000));

  if (params?.code) query.set("code", clean(params.code));
  if (params?.participantId) {
    query.set("participantId", clean(params.participantId));
  }
  if (params?.logType) query.set("logType", clean(params.logType));

  const endpoint = `${url}${url.includes("?") ? "&" : "?"}${query.toString()}`;

  const response = await fetch(endpoint, {
    method: "GET",
    cache: "no-store",
  });

  const text = await response.text();

  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {
      ok: false,
      message: text || "Invalid Google Sheet response",
    };
  }

  if (!response.ok || json?.ok === false) {
    return {
      ok: false,
      rows: [],
      message: json?.message || `Google Sheet HTTP ${response.status}`,
    };
  }

  return {
    ok: true,
    rows: Array.isArray(json.rows) ? json.rows : [],
    message: json.message || "",
  };
}

export function googleSheetRowsToFoodLogs(rows: any[] = []) {
  return rows
    .filter((row: any) => {
      const logType = clean(row["Log Type"]).toLowerCase();

      const hasFood =
        clean(row["Add Options"]) ||
        clean(row["Detected Foods"]) ||
        clean(row["Waktu Makan"]) ||
        clean(row["Kalori Makanan"]);

      return logType === "nutrition" || Boolean(hasFood);
    })
    .map((row: any) => {
      const submissionDate = row["Submission Date"];
      const logDate = toIsoDate(row["Log Date"] || submissionDate);
      const logTime = toTime(submissionDate);

      const foodDetail =
        clean(row["Detected Foods"]) ||
        clean(row["Add Options"]) ||
        clean(row["Catatan Nutrisi"]) ||
        "-";

      const foodName =
        clean(row["Add Options"]) ||
        clean(row["Detected Foods"]) ||
        "-";

      const calories = toNumberOrNull(row["Kalori Makanan"]);
      const point = toNumberOrNull(row["Total Point"]);

      const photoUrl =
        normalizeDrivePreview(row["Preview Foto Makanan"]) ||
        normalizeDrivePreview(row["Upload Foto Makanan"]);

      return {
        id: `sheet-food-${row._rowNumber || `${row["Participant ID"]}-${submissionDate}`}`,
        participant_id: toNumberOrNull(row["Participant ID"]),
        participant_code: clean(row["KODE"]),
        log_date: logDate,
        log_time: logTime,
        created_at: submissionDate || row["Log Date"] || "",
        meal_time: clean(row["Waktu Makan"]),
        meal_type: clean(row["Waktu Makan"]),
        meal_text: foodDetail,
        food_name: foodName,
        total_calories: calories,
        calories,
        photo_url: photoUrl,
        points: point || 0,
        source: "google_sheet",
        raw_payload: row,
      };
    });
}

export function googleSheetRowsToHealthtalkLogs(rows: any[] = []) {
  return rows
    .filter((row: any) => {
      const logType = clean(row["Log Type"]).toLowerCase();

      const hasHealthtalk =
        clean(row["Healthtalk/Seminar"]) ||
        clean(row["Jenis Healthtalk"]) ||
        clean(row["Tanggal Healthtalk"]) ||
        clean(row["Bukti Healthtalk"]) ||
        clean(row["Preview Bukti Healthtalk"]);

      return logType === "healthtalk" || Boolean(hasHealthtalk);
    })
    .map((row: any) => {
      const submissionDate = row["Submission Date"];
      const addOptions = splitHealthtalkAddOptions(row["Add Options"]);

      const logDate = toIsoDate(
        row["Tanggal Healthtalk"] ||
          row["Log Date"] ||
          submissionDate
      );

      const logTime = toTime(submissionDate);

      const type =
        clean(row["Jenis Healthtalk"]) ||
        addOptions.type ||
        "Health Talk";

      const title =
        addOptions.title ||
        clean(row["Healthtalk/Seminar"]) ||
        type ||
        "Health Talk / Seminar";

      const evidenceUrl =
        normalizeDriveView(row["Bukti Healthtalk"]) ||
        normalizeDriveView(row["Preview Bukti Healthtalk"]);

      const evidencePreviewUrl =
        normalizeDrivePreview(row["Preview Bukti Healthtalk"]) ||
        normalizeDrivePreview(row["Bukti Healthtalk"]);

      const point = toNumberOrNull(row["Total Point"]);

      return {
        id: `sheet-healthtalk-${row._rowNumber || `${row["Participant ID"]}-${submissionDate}`}`,
        participant_id: toNumberOrNull(row["Participant ID"]),
        participant_code: clean(row["KODE"]),
        log_date: logDate,
        event_date: logDate,
        log_time: logTime,
        created_at: submissionDate || row["Log Date"] || "",
        healthtalk_type: type,
        attendance_type: type,
        healthtalk_title: title,
        title,
        notes: clean(row["Catatan Nutrisi"]) || "",
        evidence_url: evidenceUrl,
        evidence_preview_url: evidencePreviewUrl,
        points: point || 0,
        source: "google_sheet",
        raw_payload: row,
      };
    });
}
// WELLNESS_GOOGLE_SHEET_RESPONSES_V411_NORMAL_LOCAL_DATE
// Read-only helper untuk dashboard/admin/portal membaca Form Responses Google Sheet.
// Fix utama:
// - tanggal dibaca sebagai local date, bukan UTC/toISOString agar tidak geser H-1
// - nutrition rows tidak lagi terdeteksi hanya dari Add Options
// - healthtalk rows dipisah jelas dari nutrition
// - dashboard dapat memakai Google Sheet sebagai source of truth

function clean(value: any) {
  return String(value ?? "").trim();
}

function toNumberOrNull(value: any) {
  const text = clean(value);
  if (!text) return null;

  const normalized = text
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function pad2(value: any) {
  return String(value).padStart(2, "0");
}

function dateKeyFromParts(year: any, month: any, day: any) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return "";
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return "";

  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function localDateKeyFromDate(date: Date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  return dateKeyFromParts(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  );
}

function monthNameToNumber(value: string) {
  const text = clean(value).toLowerCase();

  const map: Record<string, number> = {
    jan: 1,
    januari: 1,
    january: 1,
    feb: 2,
    februari: 2,
    february: 2,
    mar: 3,
    maret: 3,
    march: 3,
    apr: 4,
    april: 4,
    mei: 5,
    may: 5,
    jun: 6,
    juni: 6,
    june: 6,
    jul: 7,
    juli: 7,
    july: 7,
    agu: 8,
    ags: 8,
    agustus: 8,
    august: 8,
    sep: 9,
    september: 9,
    okt: 10,
    oktober: 10,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    des: 12,
    desember: 12,
    dec: 12,
    december: 12,
  };

  return map[text] || 0;
}

function toIsoDate(value: any) {
  if (!value) return "";

  if (value instanceof Date) {
    return localDateKeyFromDate(value);
  }

  const text = clean(value);
  if (!text) return "";

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return dateKeyFromParts(isoMatch[1], isoMatch[2], isoMatch[3]);
  }

  const idDateMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (idDateMatch) {
    // Untuk dashboard Indonesia, default parsing angka adalah DD/MM/YYYY.
    // Ini menghindari 02/07 dibaca sebagai Feb 07.
    return dateKeyFromParts(idDateMatch[3], idDateMatch[2], idDateMatch[1]);
  }

  const monthNameMatch = text.match(
    /^(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})/i
  );
  if (monthNameMatch) {
    const month = monthNameToNumber(monthNameMatch[2]);
    if (month) {
      return dateKeyFromParts(monthNameMatch[3], month, monthNameMatch[1]);
    }
  }

  const date = new Date(text);

  // Penting: jangan pakai date.toISOString().slice(0, 10).
  // Itu akan menggeser tanggal saat data Google Sheet berada di timezone Asia/Jakarta.
  return localDateKeyFromDate(date);
}

function toTime(value: any) {
  if (!value) return "";

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";

    return value.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  const text = clean(value);
  if (!text) return "";

  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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

function splitHealthtalkAddOptions(value: any) {
  const text = clean(value);
  if (!text) {
    return {
      type: "",
      title: "",
    };
  }

  const parts = text
    .split(" - ")
    .map((item) => clean(item))
    .filter(Boolean);

  return {
    type: parts[0] || "",
    title: parts.slice(1).join(" - ") || parts[0] || "",
  };
}

function rowLogType(row: any) {
  return clean(row?.["Log Type"] || row?.log_type).toLowerCase();
}

function isNutritionSheetRow(row: any) {
  const logType = rowLogType(row);

  if (logType === "healthtalk") return false;
  if (logType === "activity") return false;
  if (logType === "workout") return false;

  if (logType === "nutrition") return true;

  const hasNutritionSpecificField =
    clean(row["Waktu Makan"]) ||
    clean(row["Kalori Makanan"]) ||
    clean(row["Detected Foods"]) ||
    clean(row["Upload Foto Makanan"]) ||
    clean(row["Preview Foto Makanan"]);

  return Boolean(hasNutritionSpecificField);
}

function isHealthtalkSheetRow(row: any) {
  const logType = rowLogType(row);

  if (logType === "nutrition") return false;
  if (logType === "activity") return false;
  if (logType === "workout") return false;

  if (logType === "healthtalk") return true;

  const hasHealthtalkSpecificField =
    clean(row["Healthtalk/Seminar"]) ||
    clean(row["Jenis Healthtalk"]) ||
    clean(row["Tanggal Healthtalk"]) ||
    clean(row["Bukti Healthtalk"]) ||
    clean(row["Preview Bukti Healthtalk"]);

  return Boolean(hasHealthtalkSpecificField);
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
    .filter(isNutritionSheetRow)
    .map((row: any) => {
      const submissionDate = row["Submission Date"];
      const logDate = toIsoDate(row["Log Date"] || row["Tanggal"] || submissionDate);
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
        points: point !== null ? point : 5,
        source: "google_sheet",
        raw_payload: row,
      };
    });
}

export function googleSheetRowsToHealthtalkLogs(rows: any[] = []) {
  return rows
    .filter(isHealthtalkSheetRow)
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
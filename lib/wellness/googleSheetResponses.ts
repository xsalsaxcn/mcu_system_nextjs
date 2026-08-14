// WELLNESS_GOOGLE_SHEET_RESPONSES_V412_JAKARTA_DATE_NORMAL_FORM
// WELLNESS_LOCAL_DATE_JAKARTA_V126M13_2
// Read-only helper untuk dashboard/admin/portal membaca Form Responses Google Sheet.
// Fix utama:
// - semua Date dari Google Sheet dipaksa Asia/Jakarta
// - nutrition memakai Submission Date sebagai tanggal utama agar input hari ini tidak loncat H-1
// - healthtalk tetap memakai Tanggal Healthtalk jika tersedia
// - nutrition dan healthtalk dipisah jelas supaya tidak saling kebaca
// - menghindari data tiba-tiba muncul di tanggal lain karena UTC conversion

const JAKARTA_TIME_ZONE = "Asia/Jakarta";

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

function jakartaDateKeyFromDate(date: Date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((item) => item.type === "year")?.value;
  const month = parts.find((item) => item.type === "month")?.value;
  const day = parts.find((item) => item.type === "day")?.value;

  return dateKeyFromParts(year, month, day);
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
    return jakartaDateKeyFromDate(value);
  }

  const text = clean(value);
  if (!text) return "";

  // Format dari Apps Script baru: 2026-07-02 11:35:19
  const localDateTimeMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+\d{1,2}:\d{2}/);
  if (localDateTimeMatch) {
    return dateKeyFromParts(
      localDateTimeMatch[1],
      localDateTimeMatch[2],
      localDateTimeMatch[3]
    );
  }

  // Format tanggal murni: 2026-07-02
  const isoDateOnlyMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDateOnlyMatch) {
    return dateKeyFromParts(
      isoDateOnlyMatch[1],
      isoDateOnlyMatch[2],
      isoDateOnlyMatch[3]
    );
  }

  // Format ISO UTC dari Apps Script lama: 2026-07-02T04:35:19.000Z
  // Wajib dikonversi ke Asia/Jakarta, bukan timezone server Vercel.
  const isoDateTimeMatch = text.match(/^\d{4}-\d{2}-\d{2}T/);
  if (isoDateTimeMatch) {
    const date = new Date(text);
    return jakartaDateKeyFromDate(date);
  }

  // Format Indonesia: 02/07/2026
  const idDateMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (idDateMatch) {
    return dateKeyFromParts(idDateMatch[3], idDateMatch[2], idDateMatch[1]);
  }

  // Format: 02 Jul 2026
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
  return jakartaDateKeyFromDate(date);
}

function toTime(value: any) {
  if (!value) return "";

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";

    return value.toLocaleTimeString("id-ID", {
      timeZone: JAKARTA_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  const text = clean(value);
  if (!text) return "";

  // Format dari Apps Script baru: 2026-07-02 11:35:19
  const localMatch = text.match(/\s(\d{1,2}):(\d{2})/);
  if (localMatch) {
    return `${localMatch[1].padStart(2, "0")}:${localMatch[2]}`;
  }

  const simpleMatch = text.match(/^(\d{1,2}):(\d{2})/);
  if (simpleMatch) {
    return `${simpleMatch[1].padStart(2, "0")}:${simpleMatch[2]}`;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString("id-ID", {
    timeZone: JAKARTA_TIME_ZONE,
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

// WELLNESS_GOOGLE_SHEET_READ_WEBHOOK_SPLIT_V126M76
// Read/listRows may use a dedicated Apps Script deployment so the existing
// write/upload webhook can remain untouched.
function getWebhookUrl() {
  return (
    clean(process.env.WELLNESS_GOOGLE_SHEET_READ_WEBHOOK_URL) ||
    clean(process.env.WELLNESS_GOOGLE_SHEET_WEBHOOK_URL)
  );
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

  // listRows contract must explicitly return a rows array. A generic
  // webhook health response such as V370 (ok:true + message only) must not
  // be treated as a successful empty Sheet read.
  if (!Array.isArray(json?.rows)) {
    return {
      ok: false,
      rows: [],
      message:
        json?.message ||
        "Google Sheet listRows response tidak memiliki array rows.",
    };
  }

  return {
    ok: true,
    rows: json.rows,
    message: json.message || "",
  };
}

export function googleSheetRowsToFoodLogs(rows: any[] = []) {
  return rows
    .filter(isNutritionSheetRow)
    .map((row: any) => {
      const submissionDate = row["Submission Date"];
      const explicitLogDate = row["Log Date"] || row["Tanggal"];

      // Log Date adalah tanggal operasional yang dipilih peserta.
      // Submission Date hanya timestamp audit dan menjadi fallback untuk row lama.
      const logDate = toIsoDate(explicitLogDate || submissionDate);
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
        created_at: submissionDate || explicitLogDate || "",
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
// WELLNESS_COMPANY_ISOLATION_V126C_FINAL
import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getWellnessNakesUser } from "@/lib/wellness/nakesSession";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { calculateBmi, interpretBmi, weightDelta } from "@/lib/wellness/bmi";
import { classifyWellnessRisk, complianceStatus } from "@/lib/wellness/riskRules";
import { getAllowedWellnessParticipants, latestByDate } from "@/app/api/wellness/_utils";
import { getWellnessSheetName, postToWellnessWebhook } from "@/lib/wellness/googleSheetWebhook";

// WELLNESS_PARTICIPANT_CHARTS_V351_DASHBOARD
// WELLNESS_HISTORY_IMPORT_V352_DASHBOARD
// WELLNESS_EVIDENCE_GALLERY_PROGRESS_V364_API
// WELLNESS_DASHBOARD_NAKES_ACTIVITY_LOG_V379_API
// WELLNESS_NAKES_AGE_CAPTURE_V126M42_API
// WELLNESS_WORKOUT_CALORIES_ALIGN_V381_API
// Wellness-only dashboard API.
// Chart workout calories sekarang memakai kalkulasi yang sama dengan Log Activities,
// sehingga angka grafik dan tabel tidak mismatch.

function groupByParticipant(rows: any[] = []) {
  const map = new Map<number, any[]>();

  for (const row of rows) {
    const id = Number(row.participant_id);
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(row);
  }

  return map;
}

function sumCalories(rows: any[] = []) {
  return Math.round(
    rows.reduce((sum, row) => sum + Number(row.total_calories || row.calories || 0), 0) * 10
  ) / 10;
}

function pickNumber(...values: any[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;

    const numeric = Number(String(value).replace(",", "."));
    if (Number.isFinite(numeric)) return numeric;
  }

  return null;
}

function roundedDelta(current: any, baseline: any) {
  const currentNumber = pickNumber(current);
  const baselineNumber = pickNumber(baseline);

  if (currentNumber === null || baselineNumber === null) return null;

  return Math.round((currentNumber - baselineNumber) * 10) / 10;
}

function latestDate(...values: any[]): string | null {
  const valid = values.filter(Boolean).map(String).sort();
  return valid.length ? valid[valid.length - 1] : null;
}

function dateLabel(value: any, fallback = "-") {
  if (!value) return fallback;

  const text = String(value).slice(0, 10);
  const parts = text.split("-");

  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;

  return text || fallback;
}

function round1(value: any): number | null {
  const numeric = pickNumber(value);
  if (numeric === null) return null;

  return Math.round(numeric * 10) / 10;
}

function sortedByDate(rows: any[] = [], field = "log_date") {
  return [...(rows || [])].sort((a: any, b: any) =>
    String(a?.[field] || "").localeCompare(String(b?.[field] || ""))
  );
}

function historySource(row: any) {
  return (
    row?.visit_label ||
    {
      baseline_mcu: "Baseline MCU",
      mini_mcu: "Mini MCU",
      mini_mcu_week_4: "Mini MCU Week 4",
      mini_mcu_week_8: "Mini MCU Week 8",
      final_mcu: "Final MCU",
      baseline_checkup: "Pemeriksaan Awal",
      periodic_checkup: "Pemeriksaan Berkala",
      final_evaluation: "Evaluasi Akhir",
      clinical_follow_up: "Follow-up Klinis",
      custom_checkup: "Pemeriksaan NAKES",
    }[String(row?.history_type || "")] ||
    "Input NAKES / History MCU"
  );
}

function groupByEmployeeCode(rows: any[] = []) {
  const map = new Map<string, any[]>();

  for (const row of rows || []) {
    const code = String(row.employee_code || row.code || row.no_karyawan || "").trim();
    if (!code) continue;

    if (!map.has(code)) map.set(code, []);
    map.get(code)!.push(row);
  }

  return map;
}

function mergeUniqueRows(...lists: any[][]) {
  const map = new Map<string, any>();

  for (const list of lists || []) {
    for (const row of list || []) {
      const key = row?.id
        ? `id:${row.id}`
        : JSON.stringify([
            row?.employee_code,
            row?.checkup_date,
            row?.history_type,
            row?.visit_label,
          ]);

      map.set(key, row);
    }
  }

  return [...map.values()];
}

function firstClinicalHistory(rows: any[] = []) {
  const sorted = sortedByDate(rows, "checkup_date");

  return (
    sorted.find((row) => String(row?.history_type || "") === "baseline_mcu") ||
    sorted[0] ||
    null
  );
}

// WELLNESS_NAKES_EXISTING_AGE_HEIGHT_PREFILL_V126M79_3_API
function latestValidHistoryHeight(rows: any[] = []) {
  const sorted = [...(rows || [])].sort((a: any, b: any) => {
    const dateCompare = String(b?.checkup_date || "").localeCompare(String(a?.checkup_date || ""));
    if (dateCompare !== 0) return dateCompare;
    return Number(b?.id || 0) - Number(a?.id || 0);
  });

  for (const row of sorted) {
    const height = pickNumber(row?.height_cm);
    if (height !== null && height >= 120 && height <= 230) return height;
  }

  return null;
}

function latestValidHistoryAge(rows: any[] = []) {
  const sorted = [...(rows || [])].sort((a: any, b: any) => {
    const dateCompare = String(b?.checkup_date || "").localeCompare(String(a?.checkup_date || ""));
    if (dateCompare !== 0) return dateCompare;
    return Number(b?.id || 0) - Number(a?.id || 0);
  });

  for (const row of sorted) {
    const raw = row?.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : {};
    const age = pickNumber(raw?.age_years, raw?.usia, row?.age_years, row?.usia);
    if (age !== null && age >= 18 && age <= 119) return Math.round(age);
  }

  return null;
}

function firstValidNakesHeight(...values: any[]) {
  for (const value of values) {
    const height = pickNumber(value);
    if (height !== null && height >= 120 && height <= 230) return height;
  }
  return null;
}

function addChartPoint(points: any[], point: any) {
  const hasNumber = Object.entries(point).some(([key, value]) => {
    if (["label", "date", "source"].includes(key)) return false;
    return pickNumber(value) !== null;
  });

  if (!hasNumber) return;

  const normalized: any = {
    label: point.label || dateLabel(point.date),
    date: point.date || null,
    source: point.source || null,
  };

  for (const [key, value] of Object.entries(point)) {
    if (["label", "date", "source"].includes(key)) continue;
    normalized[key] = round1(value);
  }

  points.push(normalized);
}

function compactChart(points: any[], maxPoints = 14) {
  const clean = (points || []).filter(Boolean);

  if (clean.length <= maxPoints) return clean;

  const first = clean[0];
  const tail = clean.slice(-(maxPoints - 1));

  if (tail.some((item) => item === first)) return tail;

  return [first, ...tail];
}

function aggregateCaloriesByDate(rows: any[] = [], dateField = "log_date", valueField = "total_calories") {
  const map = new Map<string, number>();

  for (const row of rows || []) {
    const date = String(row?.[dateField] || "").slice(0, 10);
    if (!date) continue;

    const value = Number(row?.[valueField] || 0);
    if (!Number.isFinite(value)) continue;

    map.set(date, (map.get(date) || 0) + value);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      label: dateLabel(date),
      date,
      value: Math.round(value * 10) / 10,
      source: "Log harian",
    }));
}

function getActivityDate(row: any) {
  return String(
    row?.log_date ||
      row?.started_at ||
      row?.start_date_local ||
      row?.raw_payload?.start_date_local ||
      row?.raw_payload?.start_date ||
      row?.created_at ||
      ""
  ).slice(0, 10);
}

function getActivityName(row: any) {
  return String(
    row?.activity_name ||
      row?.activity_type ||
      row?.raw_payload?.sport_type ||
      row?.raw_payload?.type ||
      row?.raw_payload?.name ||
      "Aktivitas"
  ).trim();
}

function getActivityDuration(row: any) {
  const raw = row?.raw_payload || {};

  return pickNumber(
    row?.duration_minutes,
    row?.elapsed_minutes,
    raw?.duration_minutes,
    raw?.moving_time ? Number(raw.moving_time) / 60 : null,
    raw?.elapsed_time ? Number(raw.elapsed_time) / 60 : null
  );
}

function getActivityDistance(row: any) {
  const raw = row?.raw_payload || {};

  return pickNumber(
    row?.distance_km,
    raw?.distance_km,
    raw?.distance ? Number(raw.distance) / 1000 : null
  );
}

function defaultMet(activityName: any) {
  const name = String(activityName || "").toLowerCase();

  if (/run|lari|jog/.test(name)) return 7;
  if (/walk|jalan|brisk/.test(name)) return 3.8;
  if (/bike|cycling|sepeda/.test(name)) return 6;
  if (/swim|renang/.test(name)) return 7;
  if (/badminton/.test(name)) return 5.5;
  if (/strength|gym|workout|angkat|weight/.test(name)) return 4.5;
  if (/yoga|stretch/.test(name)) return 2.5;
  if (/lunge|squat|plank|push|sit up|sit-up|core/.test(name)) return 5;

  return 4;
}

function estimateCalories(row: any, participant: any) {
  const raw = row?.raw_payload || {};

  const direct = pickNumber(
    row?.calories,
    row?.activity_calories,
    row?.calories_burned,
    raw?.calories,
    raw?.activity_calories,
    raw?.calories_burned,
    raw?.kilocalories,
    raw?.active_kilocalories
  );

  if (direct !== null) return direct;

  const duration = getActivityDuration(row);
  const weight = pickNumber(
    participant?.current_weight_kg,
    participant?.weight_kg,
    participant?.initial_weight_kg,
    participant?.baseline_weight_kg,
    70
  );

  if (duration === null || weight === null) return null;

  const met = pickNumber(row?.met, raw?.met) || defaultMet(getActivityName(row));

  return Math.round((met * 3.5 * weight) / 200 * duration * 10) / 10;
}

// V381 FIX:
// Grafik Workout calories memakai kalkulasi yang sama dengan Log Activities.
// Sebelumnya grafik bisa memakai BB default 70 kg, sedangkan tabel memakai BB terbaru,
// sehingga contoh Forward lunge 90 menit menjadi 441 vs 630.
function aggregateActivityCaloriesByDate(rows: any[] = [], participant: any = {}) {
  const summary = buildActivitySummary(rows, participant);
  const map = new Map<string, number>();

  for (const item of summary || []) {
    const date = String(item.date || item.tanggal || "").slice(0, 10);
    if (!date) continue;

    const calories = pickNumber(item.calories);
    if (calories === null) continue;

    map.set(date, (map.get(date) || 0) + calories);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      label: dateLabel(date),
      date,
      value: Math.round(value * 10) / 10,
      source: "Workout log",
    }));
}

function aggregateDurationByDate(rows: any[] = []) {
  const map = new Map<string, number>();

  for (const row of rows || []) {
    const date = getActivityDate(row);
    if (!date) continue;

    const value = getActivityDuration(row);
    if (value === null || !Number.isFinite(value)) continue;

    map.set(date, (map.get(date) || 0) + value);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      label: dateLabel(date),
      date,
      value: Math.round(value * 10) / 10,
      source: "Workout harian",
    }));
}

function buildActivitySummary(rows: any[] = [], participant: any = {}) {
  const map = new Map<string, any>();

  for (const row of rows || []) {
    const date = getActivityDate(row);
    if (!date) continue;

    const name = getActivityName(row);
    const key = `${date}|${name.toLowerCase()}`;

    const current = map.get(key) || {
      date,
      activity_name: name,
      count: 0,
      duration_minutes: 0,
      calories: 0,
      distance_km: 0,
      sources: new Set<string>(),
    };

    current.count += 1;
    current.duration_minutes += getActivityDuration(row) || 0;
    current.calories += estimateCalories(row, participant) || 0;
    current.distance_km += getActivityDistance(row) || 0;
    current.sources.add(String(row?.source || row?.raw_payload?.source || "manual"));

    map.set(key, current);
  }

  return [...map.values()]
    .sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) ||
        String(a.activity_name).localeCompare(String(b.activity_name))
    )
    .map((item) => ({
      tanggal: item.date,
      date: item.date,
      nama_activities: item.activity_name,
      activity_name: item.activity_name,
      jumlah: item.count,
      count: item.count,
      duration_minutes: Math.round(item.duration_minutes * 10) / 10,
      calories: Math.round(item.calories * 10) / 10,
      distance_km: Math.round(item.distance_km * 100) / 100,
      source: [...item.sources].join(", "),
    }))
    .slice(0, 100);
}

function aggregatePointsByDate(rows: any[] = []) {
  const map = new Map<string, number>();

  for (const row of rows || []) {
    const date = String(row?.log_date || row?.created_at || "").slice(0, 10);
    if (!date) continue;

    const value = Number(row?.points || 0);
    if (!Number.isFinite(value)) continue;

    map.set(date, (map.get(date) || 0) + value);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      label: dateLabel(date),
      date,
      value: Math.round(value * 10) / 10,
      source: "Point harian",
    }));
}

function isImageEvidence(url: any) {
  const text = String(url || "").trim();

  if (!text) return false;
  if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(text)) return true;
  if (/drive\.google\.com\/uc\?/i.test(text)) return true;

  return false;
}

function normalizeEvidenceUrl(url: any) {
  const text = String(url || "").trim();

  if (!text) return "";

  const match =
    text.match(/drive\.google\.com\/file\/d\/([^/]+)/i) ||
    text.match(/[?&]id=([^&]+)/i);

  if (match?.[1]) return `https://drive.google.com/uc?export=view&id=${match[1]}`;

  return text;
}

function buildEvidenceGallery({ evidenceRows, foodRows, activityRows, healthtalkRows }: any) {
  const items: any[] = [];

  const add = (item: any) => {
    const url = normalizeEvidenceUrl(item?.evidence_url || item?.url || item?.photo_url);
    if (!url) return;

    const key = `${item.type || item.evidence_type || "evidence"}|${url}|${
      item.date || item.log_date || item.created_at || ""
    }`;

    if (items.some((existing) => existing.key === key || existing.url === url)) return;

    items.push({
      key,
      id: item.id || key,
      type: item.type || item.evidence_type || "Bukti",
      title: item.title || "Bukti Wellness",
      url,
      original_url: item.evidence_url || item.url || item.photo_url || url,
      image_preview_url: isImageEvidence(url) ? url : "",
      date: String(item.date || item.log_date || item.event_date || item.created_at || "").slice(0, 10),
      status: item.status || "pending",
      notes: item.notes || "",
      source_type: item.source_type || item.source || "manual",
    });
  };

  for (const row of evidenceRows || []) {
    add({
      id: row.id,
      type:
        row.evidence_type === "food_photo"
          ? "Foto makanan"
          : row.evidence_type === "activity_proof"
            ? "Bukti aktivitas"
            : row.evidence_type === "healthtalk_proof"
              ? "Bukti healthtalk"
              : row.evidence_type || "Bukti",
      title: row.title,
      evidence_url: row.evidence_url,
      date: row.log_date || row.created_at,
      status: row.status,
      notes: row.notes,
      source_type: row.source_type,
    });
  }

  for (const row of foodRows || []) {
    add({
      id: `food-${row.id}`,
      type: "Foto makanan",
      title: row.meal_time ? `Foto makanan ${row.meal_time}` : "Foto makanan",
      evidence_url: row.photo_url,
      date: row.log_date || row.created_at,
      status: "saved",
      notes: row.meal_text,
      source_type: "food_log",
    });
  }

  for (const row of activityRows || []) {
    const raw = row.raw_payload || {};

    add({
      id: `activity-${row.id}`,
      type: "Bukti aktivitas",
      title: row.activity_type ? `Bukti ${row.activity_type}` : "Bukti aktivitas",
      evidence_url: raw.evidence_url,
      date: row.log_date || row.created_at,
      status: "saved",
      notes: row.notes,
      source_type: "activity_log",
    });
  }

  for (const row of healthtalkRows || []) {
    add({
      id: `healthtalk-${row.id}`,
      type: "Bukti healthtalk",
      title: row.title || "Healthtalk / seminar",
      evidence_url: row.evidence_url,
      date: row.event_date || row.created_at,
      status: row.status || "pending",
      notes: row.notes,
      source_type: "healthtalk_log",
    });
  }

  return items
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 24);
}

function buildRecentResponses({ foodRows, weightRows, activityRows, healthtalkRows, pointRows }: any) {
  const pointMap = new Map<string, number>();

  for (const row of pointRows || []) {
    const key = `${row.source_type || ""}|${row.source_id || ""}`;
    pointMap.set(key, (pointMap.get(key) || 0) + Number(row.points || 0));
  }

  const items: any[] = [];

  for (const row of foodRows || []) {
    items.push({
      id: `food-${row.id}`,
      date: row.log_date,
      type: "Nutrisi",
      title: row.meal_time || "Input makanan",
      description: row.meal_text || "-",
      calories: row.total_calories || null,
      evidence_url: normalizeEvidenceUrl(row.photo_url),
      points: pointMap.get(`food_log|${row.id}`) || 0,
    });
  }

  for (const row of weightRows || []) {
    items.push({
      id: `weight-${row.id}`,
      date: row.log_date,
      type: "BB / Lingkar Perut",
      title: row.weight_kg ? `${row.weight_kg} kg` : "Input BB",
      description: [
        row.waist_cm ? `LP ${row.waist_cm} cm` : "",
        row.bmi ? `BMI ${row.bmi}` : "",
        row.notes || "",
      ]
        .filter(Boolean)
        .join(" · "),
      calories: null,
      evidence_url: "",
      points: pointMap.get(`weight_log|${row.id}`) || 0,
    });
  }

  for (const row of activityRows || []) {
    const raw = row.raw_payload || {};

    items.push({
      id: `activity-${row.id}`,
      date: getActivityDate(row),
      type: "Aktivitas",
      title: getActivityName(row),
      description: [
        getActivityDuration(row) ? `${getActivityDuration(row)} menit` : "",
        getActivityDistance(row) ? `${getActivityDistance(row)} km` : "",
        row.notes || "",
      ]
        .filter(Boolean)
        .join(" · "),
      calories: estimateCalories(row, {}),
      evidence_url: normalizeEvidenceUrl(raw.evidence_url),
      points:
        (pointMap.get(`activity_log|${row.id}`) || 0) +
        (pointMap.get(`activity_evidence|${row.id}`) || 0),
    });
  }

  for (const row of healthtalkRows || []) {
    items.push({
      id: `healthtalk-${row.id}`,
      date: row.event_date,
      type: "Healthtalk",
      title: row.title || "Healthtalk / seminar",
      description: [row.attendance_type || "", row.status || "", row.notes || ""]
        .filter(Boolean)
        .join(" · "),
      calories: null,
      evidence_url: normalizeEvidenceUrl(row.evidence_url),
      points: pointMap.get(`healthtalk_log|${row.id}`) || 0,
    });
  }

  return items
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 18);
}

function buildParticipantCharts(args: {
  participant: any;
  weightRows: any[];
  foodRows: any[];
  activityRows: any[];
  miniMcuRows: any[];
  historyRows: any[];
  pointRows?: any[];
  baselineWeight: any;
  baselineBmi: any;
  baselineSbp: any;
  baselineDbp: any;
  baselineHba1c: any;
  baselineGlucose: any;
  baselineWaist: any;
}) {
  const {
    participant,
    weightRows,
    foodRows,
    activityRows,
    miniMcuRows,
    historyRows,
    baselineWeight,
    baselineBmi,
    baselineSbp,
    baselineDbp,
    baselineHba1c,
    baselineGlucose,
    baselineWaist,
  } = args;

  const baselineDate = participant.baseline_mcu_date || participant.program_start_date || participant.created_at;

  const weightChart: any[] = [];
  const bmiChart: any[] = [];
  const waistChart: any[] = [];
  const bpChart: any[] = [];
  const hba1cChart: any[] = [];
  const glucoseChart: any[] = [];

  addChartPoint(weightChart, {
    label: "Baseline",
    date: baselineDate,
    source: "Baseline MCU",
    value: baselineWeight,
  });

  addChartPoint(bmiChart, {
    label: "Baseline",
    date: baselineDate,
    source: "Baseline MCU",
    value: baselineBmi,
  });

  addChartPoint(waistChart, {
    label: "Baseline",
    date: baselineDate,
    source: "Baseline MCU",
    value: baselineWaist,
  });

  addChartPoint(bpChart, {
    label: "Baseline",
    date: baselineDate,
    source: "Baseline MCU",
    sbp: baselineSbp,
    dbp: baselineDbp,
  });

  addChartPoint(hba1cChart, {
    label: "Baseline",
    date: baselineDate,
    source: "Baseline MCU",
    value: baselineHba1c,
  });

  addChartPoint(glucoseChart, {
    label: "Baseline",
    date: baselineDate,
    source: "Baseline MCU",
    value: baselineGlucose,
  });

  for (const row of sortedByDate(historyRows, "checkup_date")) {
    const label = row.visit_label || dateLabel(row.checkup_date);
    const source = historySource(row);

    addChartPoint(weightChart, {
      label,
      date: row.checkup_date,
      source,
      value: row.weight_kg,
    });

    addChartPoint(bmiChart, {
      label,
      date: row.checkup_date,
      source,
      value: row.bmi,
    });

    addChartPoint(waistChart, {
      label,
      date: row.checkup_date,
      source,
      value: row.waist_cm,
    });

    addChartPoint(bpChart, {
      label,
      date: row.checkup_date,
      source,
      sbp: row.systolic,
      dbp: row.diastolic,
    });

    addChartPoint(hba1cChart, {
      label,
      date: row.checkup_date,
      source,
      value: row.hba1c_percent,
    });

    addChartPoint(glucoseChart, {
      label,
      date: row.checkup_date,
      source,
      value: row.glucose_value,
    });
  }

  for (const row of sortedByDate(weightRows)) {
    addChartPoint(weightChart, {
      label: dateLabel(row.log_date),
      date: row.log_date,
      source: "Input BB",
      value: row.weight_kg,
    });

    addChartPoint(bmiChart, {
      label: dateLabel(row.log_date),
      date: row.log_date,
      source: "Input BB",
      value: row.bmi,
    });

    addChartPoint(waistChart, {
      label: dateLabel(row.log_date),
      date: row.log_date,
      source: "Input BB",
      value: row.waist_cm,
    });
  }

  for (const row of sortedByDate(miniMcuRows, "exam_date")) {
    addChartPoint(weightChart, {
      label: dateLabel(row.exam_date),
      date: row.exam_date,
      source: "Mini MCU",
      value: row.weight_kg,
    });

    addChartPoint(bmiChart, {
      label: dateLabel(row.exam_date),
      date: row.exam_date,
      source: "Mini MCU",
      value: row.bmi,
    });

    addChartPoint(waistChart, {
      label: dateLabel(row.exam_date),
      date: row.exam_date,
      source: "Mini MCU",
      value: row.waist_cm,
    });

    addChartPoint(bpChart, {
      label: dateLabel(row.exam_date),
      date: row.exam_date,
      source: "Mini MCU",
      sbp: row.sbp,
      dbp: row.dbp,
    });

    addChartPoint(hba1cChart, {
      label: dateLabel(row.exam_date),
      date: row.exam_date,
      source: "Mini MCU",
      value: row.hba1c,
    });

    addChartPoint(glucoseChart, {
      label: dateLabel(row.exam_date),
      date: row.exam_date,
      source: "Mini MCU",
      value: row.glucose,
    });
  }

  return {
    weight_kg: compactChart(weightChart),
    bmi: compactChart(bmiChart),
    waist_cm: compactChart(waistChart),
    blood_pressure: compactChart(bpChart),
    hba1c: compactChart(hba1cChart),
    glucose: compactChart(glucoseChart),
    nutrition_calories: compactChart(aggregateCaloriesByDate(foodRows, "log_date", "total_calories")),
    activity_calories: compactChart(aggregateActivityCaloriesByDate(activityRows, participant)),
    workout_minutes: compactChart(aggregateDurationByDate(activityRows)),
    points: compactChart(aggregatePointsByDate((args as any).pointRows || [])),
  };
}

async function safeSelect(supabase: any, table: string, queryBuilder: (query: any) => any) {
  try {
    const result = await queryBuilder(supabase.from(table).select("*"));
    if (result.error) return [];
    return result.data || [];
  } catch {
    return [];
  }
}



// WELLNESS_NAKES_SAVE_SHEET_HISTORY_V91
// WELLNESS_NAKES_NON_DESTRUCTIVE_SYNC_V126M32
const NAKES_SAVE_MARKER = "WELLNESS_NAKES_SAVE_SHEET_HISTORY_V91";
const NAKES_SYNC_MARKER = "WELLNESS_NAKES_NON_DESTRUCTIVE_SYNC_V126M32";

function cleanNakesValue(value: any) {
  return String(value ?? "").trim();
}

function nullableNakesText(value: any) {
  const text = cleanNakesValue(value);
  return text || null;
}

function nakesDate(value: any, fallback = new Date().toISOString().slice(0, 10)) {
  const text = cleanNakesValue(value);
  if (!text) return fallback;
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] || fallback;
}

function nakesParticipantName(participant: any) {
  return cleanNakesValue(
    participant?.participant_display_name ||
      participant?.participant_name ||
      participant?.name,
  );
}

function nakesSourceKey(params: {
  participantId: number;
  checkupDate: string;
  historyType: string;
  visitLabel: string;
  visitSequence: string;
  labNo: string;
}) {
  return [
    "nakes",
    params.participantId,
    params.checkupDate,
    params.historyType,
    params.visitSequence || params.labNo || params.visitLabel || "checkup",
  ].join(":");
}

function buildNakesSheetRow(params: {
  body: any;
  participant: any;
  user: any;
  historyRow: any;
  sourceKey: string;
  revision?: number;
  operation?: "create" | "update" | "retry";
  previousSheetRow?: number | null;
}) {
  const {
    body,
    participant,
    user,
    historyRow,
    sourceKey,
    revision = 1,
    operation = "create",
    previousSheetRow = null,
  } = params;
  const participantName = nakesParticipantName(participant);
  const companyName = cleanNakesValue(
    participant?.company_name || body?.company_name || historyRow?.company_name,
  );
  const groupName = cleanNakesValue(
    participant?.kelompok_name || participant?.old_group_name,
  );
  const groupUnitName = cleanNakesValue(
    participant?.group_unit_name || participant?.group_name,
  );

  return {
    "Submission Date": new Date().toISOString(),
    "Pilih Nama Anda": participantName,
    "Nama Peserta": participantName,
    "Berat badan Awal": participant?.baseline_weight_kg || participant?.initial_weight_kg || "",
    "BB anda per hari ini (diisi sekali saja perminggu)": historyRow?.weight_kg ?? "",
    "BB Monitoring terbaru": historyRow?.weight_kg ?? "",
    "Lingkar Perut (cm)": historyRow?.waist_cm ?? "",
    "BMI": historyRow?.bmi ?? "",
    "Company": companyName,
    "Kelompok": groupName,
    "Group Upload": groupUnitName,
    "Risk Cluster": historyRow?.risk_cluster || "",
    "KODE": participant?.code || body?.employee_code || "",
    "Participant ID": participant?.id || body?.participant_id || "",
    "Log Date": historyRow?.checkup_date || body?.checkup_date || "",
    "Log Type": "nakes_checkup",
    "Evidence Count": 0,
    "Created By": `nakes:${cleanNakesValue(user?.id) || "system"}`,
    "Marker": NAKES_SAVE_MARKER,

    "NAKES Sync Marker": NAKES_SYNC_MARKER,
    "NAKES History ID": historyRow?.id || "",
    "NAKES Submission Key": `${sourceKey}:r${revision}`,
    "NAKES Revision": revision,
    "NAKES Operation": operation,
    "NAKES Previous Sheet Row": previousSheetRow || "",
    "NAKES Source Key": sourceKey,
    "Jenis Pemeriksaan NAKES": historyRow?.history_type || "",
    "Label Pemeriksaan NAKES": historyRow?.visit_label || "",
    "Urutan Pemeriksaan NAKES": cleanNakesValue(body?.visit_sequence),
    "Nomor Lab NAKES": historyRow?.lab_no || "",
    "Usia NAKES (tahun)":
      historyRow?.raw_payload?.age_years ?? body?.age_years ?? "",
    "Tinggi Badan NAKES (cm)": historyRow?.height_cm ?? "",
    "Berat Badan NAKES (kg)": historyRow?.weight_kg ?? "",
    "Lingkar Perut NAKES (cm)": historyRow?.waist_cm ?? "",
    "Sistolik NAKES": historyRow?.systolic ?? "",
    "Diastolik NAKES": historyRow?.diastolic ?? "",
    "Nadi NAKES": historyRow?.pulse ?? "",
    "HbA1c NAKES (%)": historyRow?.hba1c_percent ?? "",
    "Gula Darah NAKES": historyRow?.glucose_value ?? "",
    "Kolesterol Total NAKES": historyRow?.cholesterol_total ?? "",
    "LDL NAKES": historyRow?.ldl ?? "",
    "HDL NAKES": historyRow?.hdl ?? "",
    "Trigliserida NAKES": historyRow?.triglyceride ?? "",
    "Asam Urat NAKES": historyRow?.uric_acid ?? "",
    "SGOT NAKES": historyRow?.sgot ?? "",
    "SGPT NAKES": historyRow?.sgpt ?? "",
    "Status Program NAKES": historyRow?.program_status || "",
    "Fokus Intervensi NAKES": historyRow?.intervention_focus || "",
    "Rencana Monitoring NAKES": historyRow?.monitoring_plan || "",
    "Catatan Validasi Medis NAKES": historyRow?.medical_validation_notes || "",
    "Tanggal Follow-up NAKES": historyRow?.next_followup_date || "",
    "Alert Klinis NAKES": cleanNakesValue(body?.clinical_alert),
  };
}

function nakesCoreHistoryPayload(payload: any) {
  return {
    company_name: payload.company_name,
    participant_id: payload.participant_id,
    employee_code: payload.employee_code,
    lab_no: payload.lab_no,
    checkup_date: payload.checkup_date,
    history_type: payload.history_type,
    visit_label: payload.visit_label,
    risk_cluster: payload.risk_cluster,
    risk_level: payload.risk_level,
    hba1c_percent: payload.hba1c_percent,
    glucose_value: payload.glucose_value,
    bp_raw: payload.bp_raw,
    systolic: payload.systolic,
    diastolic: payload.diastolic,
    bmi: payload.bmi,
    weight_kg: payload.weight_kg,
    height_cm: payload.height_cm,
    waist_cm: payload.waist_cm,
    intervention_focus: payload.intervention_focus,
    monitoring_plan: payload.monitoring_plan,
    medical_validation_notes: payload.medical_validation_notes,
    program_status: payload.program_status,
    raw_payload: payload.raw_payload,
    created_by: payload.created_by,
    updated_at: payload.updated_at,
  };
}

async function findExistingNakesHistory(
  supabase: any,
  participantId: number,
  checkupDate: string,
  historyType: string,
  sourceKey: string,
) {
  const { data, error } = await supabase
    .from("wellness_checkup_history")
    .select("*")
    .eq("participant_id", participantId)
    .eq("checkup_date", checkupDate)
    .eq("history_type", historyType)
    .order("id", { ascending: false })
    .limit(50);

  if (error) return null;

  return (
    (data || []).find(
      (row: any) => cleanNakesValue(row?.raw_payload?.nakes_source_key) === sourceKey,
    ) || null
  );
}

const NAKES_PRESERVE_FIELDS = [
  "company_id",
  "company_name",
  "employee_code",
  "participant_name",
  "sex",
  "department",
  "position",
  "lab_no",
  "checkup_date",
  "history_type",
  "visit_label",
  "risk_cluster",
  "risk_level",
  "hba1c_percent",
  "glucose_value",
  "bp_raw",
  "systolic",
  "diastolic",
  "pulse",
  "height_cm",
  "weight_kg",
  "bmi",
  "waist_cm",
  "cholesterol_total",
  "ldl",
  "hdl",
  "triglyceride",
  "uric_acid",
  "sgot",
  "sgpt",
  "criteria_count",
  "intervention_focus",
  "monitoring_plan",
  "medical_validation_notes",
  "program_status",
  "next_followup_date",
  "created_by",
] as const;

function nakesHistorySnapshot(row: any) {
  if (!row || typeof row !== "object") return null;

  const snapshot: Record<string, any> = {
    id: row?.id || null,
    archived_at: new Date().toISOString(),
  };

  for (const key of NAKES_PRESERVE_FIELDS) {
    snapshot[key] = row?.[key] ?? null;
  }

  return snapshot;
}

function preserveExistingNakesValues(existing: any, nextPayload: any) {
  if (!existing) return nextPayload;

  const merged = { ...nextPayload };

  for (const key of NAKES_PRESERVE_FIELDS) {
    const nextValue = merged[key];
    const previousValue = existing?.[key];

    if (
      (nextValue === null || nextValue === undefined || nextValue === "") &&
      previousValue !== null &&
      previousValue !== undefined &&
      previousValue !== ""
    ) {
      merged[key] = previousValue;
    }
  }

  return merged;
}

function appendNakesRevision(existingRaw: any, existingRow: any, nowIso: string) {
  const previous = Array.isArray(existingRaw?.nakes_revision_history)
    ? existingRaw.nakes_revision_history
    : [];
  const snapshot = nakesHistorySnapshot(existingRow);

  if (!snapshot) return previous;

  return [
    ...previous,
    {
      revision: Number(existingRaw?.nakes_revision || 1),
      archived_at: nowIso,
      values: snapshot,
    },
  ];
}

async function saveNakesSheetSyncState(params: {
  supabase: any;
  historyRow: any;
  rawPayload: any;
  sheetResult?: any;
  sheetError?: string;
  revision: number;
}) {
  const {
    supabase,
    historyRow,
    rawPayload,
    sheetResult,
    sheetError = "",
    revision,
  } = params;
  const attemptedAt = new Date().toISOString();
  const previousSyncHistory = Array.isArray(rawPayload?.google_sheet_sync_history)
    ? rawPayload.google_sheet_sync_history
    : [];
  const syncEntry = {
    attempted_at: attemptedAt,
    revision,
    ok: !sheetError,
    row_number: sheetResult?.rowNumber || null,
    sheet_name: sheetResult?.sheet || getWellnessSheetName(),
    error: sheetError || null,
  };
  const nextRawPayload = {
    ...rawPayload,
    google_sheet_last_attempt_at: attemptedAt,
    google_sheet_last_error: sheetError || null,
    google_sheet_sync_history: [...previousSyncHistory, syncEntry],
    ...(sheetError
      ? {}
      : {
          google_sheet_synced_at: attemptedAt,
          google_sheet_synced_revision: revision,
          google_sheet_row_number: sheetResult?.rowNumber || null,
          google_sheet_name: sheetResult?.sheet || getWellnessSheetName(),
        }),
  };

  await supabase
    .from("wellness_checkup_history")
    .update({ raw_payload: nextRawPayload, updated_at: attemptedAt })
    .eq("id", historyRow.id);

  historyRow.raw_payload = nextRawPayload;
  return nextRawPayload;
}

async function writeNakesHistory(params: {
  supabase: any;
  fullPayload: any;
  existingId?: number | null;
}) {
  const { supabase, fullPayload, existingId } = params;

  const execute = (payload: any) =>
    existingId
      ? supabase
          .from("wellness_checkup_history")
          .update(payload)
          .eq("id", existingId)
          .select("*")
          .single()
      : supabase
          .from("wellness_checkup_history")
          .insert(payload)
          .select("*")
          .single();

  const fullResult = await execute(fullPayload);
  if (!fullResult.error) {
    return { row: fullResult.data, compatibilityWarning: "" };
  }

  // Compatibility fallback only: use columns already present in the original
  // Wellness NAKES table. This never creates/alters any database object.
  const coreResult = await execute(nakesCoreHistoryPayload(fullPayload));
  if (coreResult.error) throw fullResult.error;

  return {
    row: coreResult.data,
    compatibilityWarning:
      "Sebagian parameter lanjutan disimpan di raw_payload karena kolom opsional belum tersedia.",
  };
}

export async function POST(req: NextRequest) {
  const user = getWellnessNakesUser(req) || getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const participantId = Number(body?.participant_id || 0);
  if (!(participantId > 0)) return fail("Peserta wajib dipilih.", 400);

  try {
    const supabase = getSupabaseAdmin();
    const allowedParticipants = await getAllowedWellnessParticipants(supabase, user);
    const participant = (allowedParticipants || []).find(
      (item: any) => Number(item?.id) === participantId,
    );

    if (!participant) {
      return fail("Peserta tidak ditemukan atau akses NAKES ditolak.", 404);
    }

    if (cleanNakesValue(body?.action) === "retry_google_sheet") {
      const historyId = Number(body?.history_id || 0);
      if (!(historyId > 0)) {
        return fail("History ID untuk retry Google Sheet wajib tersedia.", 400);
      }

      const { data: retryHistory, error: retryHistoryError } = await supabase
        .from("wellness_checkup_history")
        .select("*")
        .eq("id", historyId)
        .eq("participant_id", participantId)
        .single();

      if (retryHistoryError || !retryHistory) {
        return fail("History NAKES tidak ditemukan atau bukan milik peserta terpilih.", 404);
      }

      const retryRaw =
        retryHistory?.raw_payload && typeof retryHistory.raw_payload === "object"
          ? retryHistory.raw_payload
          : {};
      const retryRevision = Math.max(1, Number(retryRaw?.nakes_revision || 1));
      const retrySourceKey =
        cleanNakesValue(retryRaw?.nakes_source_key) ||
        nakesSourceKey({
          participantId,
          checkupDate: nakesDate(retryHistory?.checkup_date),
          historyType:
            cleanNakesValue(retryHistory?.history_type) || "periodic_checkup",
          visitLabel:
            cleanNakesValue(retryHistory?.visit_label) || "Pemeriksaan Berkala",
          visitSequence: cleanNakesValue(retryRaw?.visit_sequence),
          labNo: cleanNakesValue(retryHistory?.lab_no),
        });

      if (
        Number(retryRaw?.google_sheet_synced_revision || 0) === retryRevision &&
        Number(retryRaw?.google_sheet_row_number || 0) > 0
      ) {
        return ok({
          message: "Revisi data NAKES ini sudah tersinkron ke Google Sheet.",
          partial_success: false,
          saved_to_history: true,
          saved_to_graphs: true,
          participant: {
            id: participant?.id || participantId,
            code: participant?.code || retryHistory?.employee_code || "",
            name: nakesParticipantName(participant) || retryHistory?.participant_name || "",
            company_name: participant?.company_name || retryHistory?.company_name || "",
          },
          history: retryHistory,
          summary: {
            history_id: retryHistory?.id,
            visit_label: retryHistory?.visit_label || "",
            risk_cluster: retryHistory?.risk_cluster || "",
            program_status: retryHistory?.program_status || "",
            checkup_date: retryHistory?.checkup_date || "",
            revision: retryRevision,
            created: false,
            updated: true,
          },
          google_sheet: {
            ok: true,
            skipped: true,
            rowNumber: retryRaw?.google_sheet_row_number,
            sheet: retryRaw?.google_sheet_name || getWellnessSheetName(),
          },
        });
      }

      try {
        const retrySheetResult = await postToWellnessWebhook({
          sheet: getWellnessSheetName(),
          row: buildNakesSheetRow({
            body: retryRaw,
            participant,
            user,
            historyRow: retryHistory,
            sourceKey: retrySourceKey,
            revision: retryRevision,
            operation: "retry",
            previousSheetRow:
              Number(retryRaw?.google_sheet_row_number || 0) || null,
          }),
        });

        await saveNakesSheetSyncState({
          supabase,
          historyRow: retryHistory,
          rawPayload: retryRaw,
          sheetResult: retrySheetResult,
          revision: retryRevision,
        });

        return ok({
          message:
            "Data NAKES yang sudah tersimpan berhasil ditambahkan ke Google Sheet tanpa menghapus history lama.",
          partial_success: false,
          saved_to_history: true,
          saved_to_graphs: true,
          participant: {
            id: participant?.id || participantId,
            code: participant?.code || retryHistory?.employee_code || "",
            name: nakesParticipantName(participant) || retryHistory?.participant_name || "",
            company_name: participant?.company_name || retryHistory?.company_name || "",
          },
          history: retryHistory,
          summary: {
            history_id: retryHistory?.id,
            visit_label: retryHistory?.visit_label || "",
            risk_cluster: retryHistory?.risk_cluster || "",
            program_status: retryHistory?.program_status || "",
            checkup_date: retryHistory?.checkup_date || "",
            revision: retryRevision,
            created: false,
            updated: true,
          },
          google_sheet: { ok: true, ...retrySheetResult },
        });
      } catch (error: any) {
        const retryError =
          error?.message || "Google Sheet masih belum berhasil disinkronkan.";

        await saveNakesSheetSyncState({
          supabase,
          historyRow: retryHistory,
          rawPayload: retryRaw,
          sheetError: retryError,
          revision: retryRevision,
        }).catch(() => null);

        return ok({
          message:
            `Data NAKES tetap aman di history/laporan. Google Sheet masih belum tersinkron: ${retryError}`,
          partial_success: true,
          saved_to_history: true,
          saved_to_graphs: true,
          retry_safe: true,
          participant: {
            id: participant?.id || participantId,
            code: participant?.code || retryHistory?.employee_code || "",
            name: nakesParticipantName(participant) || retryHistory?.participant_name || "",
            company_name: participant?.company_name || retryHistory?.company_name || "",
          },
          history: retryHistory,
          summary: {
            history_id: retryHistory?.id,
            visit_label: retryHistory?.visit_label || "",
            risk_cluster: retryHistory?.risk_cluster || "",
            program_status: retryHistory?.program_status || "",
            checkup_date: retryHistory?.checkup_date || "",
            revision: retryRevision,
            created: false,
            updated: true,
          },
          google_sheet: { ok: false, message: retryError },
        });
      }
    }

    const checkupDate = nakesDate(body?.checkup_date);
    const historyType =
      cleanNakesValue(body?.history_type) || "periodic_checkup";
    const visitLabel =
      cleanNakesValue(body?.visit_label) || "Pemeriksaan Berkala";
    const visitSequence = cleanNakesValue(body?.visit_sequence);
    const labNo = cleanNakesValue(body?.lab_no);

    const sourceKey = nakesSourceKey({
      participantId,
      checkupDate,
      historyType,
      visitLabel,
      visitSequence,
      labNo,
    });

    const existing = await findExistingNakesHistory(
      supabase,
      participantId,
      checkupDate,
      historyType,
      sourceKey,
    );

    // Use the existing values as a fallback when a safe retry or partial
    // resubmission does not send every clinical field again.
    const heightCm = pickNumber(
      body?.height_cm,
      existing?.height_cm,
      participant?.height_cm,
    );
    const weightKg = pickNumber(body?.weight_kg, existing?.weight_kg);
    const bmi = pickNumber(
      body?.bmi,
      existing?.bmi,
      calculateBmi(weightKg, heightCm),
    );
    const systolic = pickNumber(body?.systolic, existing?.systolic);
    const diastolic = pickNumber(body?.diastolic, existing?.diastolic);
    const hba1c = pickNumber(body?.hba1c_percent, existing?.hba1c_percent);
    const glucose = pickNumber(body?.glucose_value, existing?.glucose_value);
    const risk = classifyWellnessRisk({
      hba1c,
      glucose,
      bmi,
      sbp: systolic,
      dbp: diastolic,
    });

    const existingRaw =
      existing?.raw_payload && typeof existing.raw_payload === "object"
        ? existing.raw_payload
        : {};

    const submittedAgeYears = pickNumber(body?.age_years, body?.usia);
    if (
      submittedAgeYears !== null &&
      (submittedAgeYears < 18 || submittedAgeYears > 119)
    ) {
      return fail("Usia peserta wajib diisi antara 18 sampai 119 tahun.", 400);
    }
    const ageYearsRaw = pickNumber(
      submittedAgeYears,
      existingRaw?.age_years,
      existingRaw?.usia,
      participant?.age_years,
      participant?.age,
      participant?.usia,
    );
    const ageYears =
      ageYearsRaw !== null && ageYearsRaw >= 18 && ageYearsRaw <= 119
        ? Math.round(ageYearsRaw)
        : null;
    if (ageYears === null) {
      return fail("Usia peserta wajib tersedia untuk menyimpan pemeriksaan NAKES.", 400);
    }

    const createdByNumber = Number(user?.id);
    const nowIso = new Date().toISOString();
    const companyId =
      Number(participant?.wellness_company_id || body?.company_id || 0) || null;
    const companyName = cleanNakesValue(
      participant?.company_name || body?.company_name,
    );
    const participantName = nakesParticipantName(participant);

    const previousRevision = existing
      ? Math.max(1, Number(existingRaw?.nakes_revision || 1))
      : 0;
    const revision = previousRevision + 1;
    const revisionHistory = appendNakesRevision(existingRaw, existing, nowIso);
    const nonBlankSubmittedRaw = Object.fromEntries(
      Object.entries(body || {}).filter(([, value]) =>
        value !== null && value !== undefined && value !== "",
      ),
    );
    const rawPayload = {
      ...existingRaw,
      ...nonBlankSubmittedRaw,
      age_years: ageYears,
      usia: ageYears,
      age_recorded_at: checkupDate,
      nakes_source_key: sourceKey,
      nakes_marker: NAKES_SAVE_MARKER,
      nakes_sync_marker: NAKES_SYNC_MARKER,
      nakes_revision: revision,
      nakes_revision_history: revisionHistory,
      participant_snapshot: {
        id: participant?.id,
        code: participant?.code,
        name: participantName,
        age_years: ageYears,
        company_name: companyName,
        kelompok_name: participant?.kelompok_name || "",
        group_unit_name: participant?.group_unit_name || "",
      },
      saved_from: "wellness_nakes_input",
      saved_at: nowIso,
    };

    const historyPayload: any = {
      company_id: companyId,
      company_name: companyName || null,
      participant_id: participantId,
      employee_code: cleanNakesValue(participant?.code || body?.employee_code) || null,
      participant_name: participantName || null,
      sex: nullableNakesText(participant?.gender || participant?.sex),
      department: nullableNakesText(participant?.department),
      position: nullableNakesText(participant?.position),
      lab_no: labNo || null,
      checkup_date: checkupDate,
      history_type: historyType,
      visit_label: visitLabel,
      risk_cluster:
        cleanNakesValue(
          body?.risk_cluster ||
            existing?.risk_cluster ||
            participant?.risk_cluster ||
            participant?.baseline_risk_group,
        ) || risk.group,
      risk_level: risk.level,
      hba1c_percent: hba1c,
      glucose_value: glucose,
      bp_raw:
        systolic !== null || diastolic !== null
          ? `${systolic ?? ""}/${diastolic ?? ""}`
          : null,
      systolic,
      diastolic,
      pulse: pickNumber(body?.pulse, existing?.pulse),
      height_cm: heightCm,
      weight_kg: weightKg,
      bmi,
      waist_cm: pickNumber(body?.waist_cm, existing?.waist_cm),
      cholesterol_total: pickNumber(body?.cholesterol_total, existing?.cholesterol_total),
      ldl: pickNumber(body?.ldl, existing?.ldl),
      hdl: pickNumber(body?.hdl, existing?.hdl),
      triglyceride: pickNumber(body?.triglyceride, existing?.triglyceride),
      uric_acid: pickNumber(body?.uric_acid, existing?.uric_acid),
      sgot: pickNumber(body?.sgot, existing?.sgot),
      sgpt: pickNumber(body?.sgpt, existing?.sgpt),
      criteria_count: risk.flags.length,
      intervention_focus: nullableNakesText(body?.intervention_focus),
      monitoring_plan: nullableNakesText(body?.monitoring_plan),
      medical_validation_notes: nullableNakesText(body?.medical_validation_notes),
      program_status: nullableNakesText(body?.program_status),
      next_followup_date: nullableNakesText(body?.follow_up_date),
      raw_payload: rawPayload,
      created_by:
        existing?.created_by ||
        (Number.isFinite(createdByNumber) && createdByNumber > 0
          ? createdByNumber
          : null),
      updated_at: nowIso,
    };

    Object.keys(historyPayload).forEach((key) => {
      if (historyPayload[key] === "" || historyPayload[key] === undefined) {
        historyPayload[key] = null;
      }
    });

    const nonDestructiveHistoryPayload = preserveExistingNakesValues(
      existing,
      historyPayload,
    );

    const historyWrite = await writeNakesHistory({
      supabase,
      fullPayload: nonDestructiveHistoryPayload,
      existingId: Number(existing?.id || 0) || null,
    });
    const historyRow = historyWrite.row;

    let sheetResult: any = null;
    let sheetError = "";
    const previousSheetRow = Number(existingRaw?.google_sheet_row_number || 0) || null;

    try {
      // The deployed webhook is append-only. Every revision is appended as a
      // new auditable row so an older Google Sheet value is never overwritten.
      sheetResult = await postToWellnessWebhook({
        sheet: getWellnessSheetName(),
        row: buildNakesSheetRow({
          body,
          participant,
          user,
          historyRow,
          sourceKey,
          revision,
          operation: existing ? "update" : "create",
          previousSheetRow,
        }),
      });

      await saveNakesSheetSyncState({
        supabase,
        historyRow,
        rawPayload: historyRow?.raw_payload || rawPayload,
        sheetResult,
        revision,
      });
    } catch (error: any) {
      sheetError = error?.message || "Google Sheet gagal disinkronkan.";

      await saveNakesSheetSyncState({
        supabase,
        historyRow,
        rawPayload: historyRow?.raw_payload || rawPayload,
        sheetError,
        revision,
      }).catch(() => null);
    }

    const summary = {
      history_id: historyRow?.id || null,
      visit_label: historyRow?.visit_label || visitLabel,
      risk_cluster: historyRow?.risk_cluster || risk.group,
      program_status: historyRow?.program_status || "",
      checkup_date: historyRow?.checkup_date || checkupDate,
      created: !existing,
      updated: Boolean(existing),
    };

    if (sheetError) {
      return ok({
        message:
          `Data NAKES aman tersimpan di history dan laporan. Google Sheet belum tersinkron dan dapat dicoba ulang tanpa menghapus data: ${sheetError}`,
        partial_success: true,
        saved_to_history: true,
        saved_to_graphs: true,
        retry_safe: true,
        participant: {
          id: participant?.id || participantId,
          code: participant?.code || body?.employee_code || "",
          name: participantName,
          company_name: companyName,
        },
        history: historyRow,
        summary: { ...summary, revision },
        google_sheet: { ok: false, message: sheetError },
        warning: historyWrite.compatibilityWarning || "",
      });
    }

    return ok({
      message:
        "Input NAKES berhasil disimpan ke history/laporan dan ditambahkan ke Google Sheet tanpa menghapus data sebelumnya.",
      partial_success: false,
      saved_to_history: true,
      saved_to_graphs: true,
      participant: {
        id: participant?.id || participantId,
        code: participant?.code || body?.employee_code || "",
        name: participantName,
        company_name: companyName,
      },
      history: historyRow,
      summary: { ...summary, revision },
      google_sheet: { ok: true, ...sheetResult },
      warning: historyWrite.compatibilityWarning || "",
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan input NAKES.", 500);
  }
}

export async function GET(req: NextRequest) {
  const user = getWellnessNakesUser(req) || getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  try {
    const supabase = getSupabaseAdmin();
    const participants = await getAllowedWellnessParticipants(supabase, user);
    const participantIds = participants.map((p: any) => Number(p.id)).filter(Boolean);
    const participantCodes = participants
      .map((p: any) => String(p.code || p.employee_code || "").trim())
      .filter(Boolean);

    if (!participantIds.length) {
      return ok({
        summary: {
          total: 0,
          active: 0,
          avg_bmi: 0,
          high_risk: 0,
          medium_risk: 0,
          need_followup: 0,
          compliance_rate: 0,
          total_food_calories_today: 0,
          total_activity_calories_today: 0,
          avg_weight_delta_kg: 0,
          improved_weight_count: 0,
          total_points: 0,
          evidence_count: 0,
          pending_evidence_count: 0,
        },
        rows: [],
      });
    }

    const today = new Date().toISOString().slice(0, 10);

    const [
      weightRes,
      foodRes,
      activityRes,
      groupRes,
      miniMcuRows,
      historyRows,
      historyRowsByCode,
      companies,
      groupUnits,
      evidenceRows,
      pointRows,
      healthtalkRows,
    ] = await Promise.all([
      supabase.from("wellness_weight_logs").select("*").in("participant_id", participantIds),
      supabase.from("wellness_food_logs").select("*").in("participant_id", participantIds),
      supabase.from("wellness_activity_logs").select("*").in("participant_id", participantIds),
      supabase.from("wellness_groups").select("*"),
      safeSelect(supabase, "wellness_mini_mcu_logs", (query) =>
        query.in("participant_id", participantIds)
      ),
      safeSelect(supabase, "wellness_checkup_history", (query) =>
        query.in("participant_id", participantIds).order("checkup_date", { ascending: true })
      ),
      [],
      safeSelect(supabase, "wellness_companies", (query) =>
        query.order("name", { ascending: true })
      ),
      safeSelect(supabase, "wellness_group_units", (query) =>
        query.order("name", { ascending: true })
      ),
      safeSelect(supabase, "wellness_daily_evidence", (query) =>
        query.in("participant_id", participantIds).order("log_date", { ascending: false })
      ),
      safeSelect(supabase, "wellness_point_logs", (query) =>
        query.in("participant_id", participantIds).order("log_date", { ascending: true })
      ),
      safeSelect(supabase, "wellness_healthtalk_logs", (query) =>
        query.in("participant_id", participantIds).order("event_date", { ascending: false })
      ),
    ]);

    if (weightRes.error) throw weightRes.error;
    if (foodRes.error) throw foodRes.error;
    if (activityRes.error) throw activityRes.error;

    const weightsByParticipant = groupByParticipant(weightRes.data || []);
    const foodsByParticipant = groupByParticipant(foodRes.data || []);
    const activitiesByParticipant = groupByParticipant(activityRes.data || []);
    const miniMcuByParticipant = groupByParticipant(miniMcuRows || []);
    const combinedHistoryRows = mergeUniqueRows(historyRows || []);
    const historyByParticipant = groupByParticipant(combinedHistoryRows);
    const evidenceByParticipant = groupByParticipant(evidenceRows || []);
    const pointsByParticipant = groupByParticipant(pointRows || []);
    const healthtalkByParticipant = groupByParticipant(healthtalkRows || []);
    const groupName = new Map((groupRes.data || []).map((g: any) => [Number(g.id), g.name || "-"]));
    const companyName = new Map(
      (companies || []).map((company: any) => [Number(company.id), company.name || "-"])
    );
    const groupUnitName = new Map(
      (groupUnits || []).map((unit: any) => [Number(unit.id), unit.name || "-"])
    );

    const rows = participants.map((participant: any) => {
      const weightRows = weightsByParticipant.get(Number(participant.id)) || [];
      const foodRows = foodsByParticipant.get(Number(participant.id)) || [];
      const activityRows = activitiesByParticipant.get(Number(participant.id)) || [];
      const miniMcuParticipantRows = miniMcuByParticipant.get(Number(participant.id)) || [];

      const historyParticipantRows =
        historyByParticipant.get(
          Number(participant.id),
        ) || [];

      const evidenceParticipantRows = evidenceByParticipant.get(Number(participant.id)) || [];
      const pointParticipantRows = pointsByParticipant.get(Number(participant.id)) || [];
      const healthtalkParticipantRows = healthtalkByParticipant.get(Number(participant.id)) || [];

      const latestWeight = latestByDate(weightRows) || null;
      const latestFood = latestByDate(foodRows) || null;
      const latestActivity = latestByDate(activityRows) || null;
      const latestMiniMcu = latestByDate(miniMcuParticipantRows, "exam_date") || null;
      const latestHistory = latestByDate(historyParticipantRows, "checkup_date") || null;
      const baselineHistory = firstClinicalHistory(historyParticipantRows);
      const nakesPrefillHeightCm = firstValidNakesHeight(
        latestValidHistoryHeight(historyParticipantRows),
        latestMiniMcu?.height_cm,
        participant?.height_cm,
      );
      const nakesPrefillAgeYears = latestValidHistoryAge(historyParticipantRows);

      const baselineWeight = pickNumber(participant.initial_weight_kg, baselineHistory?.weight_kg);
      const baselineBmi = pickNumber(
        participant.baseline_bmi,
        baselineHistory?.bmi,
        calculateBmi(baselineWeight, participant.height_cm)
      );

      const currentWeight = pickNumber(
        latestHistory?.weight_kg,
        latestMiniMcu?.weight_kg,
        latestWeight?.weight_kg,
        baselineWeight
      );

      const bmi = pickNumber(
        latestHistory?.bmi,
        latestMiniMcu?.bmi,
        latestWeight?.bmi,
        calculateBmi(currentWeight, participant.height_cm),
        baselineBmi
      );

      const delta = weightDelta(currentWeight, baselineWeight);

      const hba1c = pickNumber(
        latestHistory?.hba1c_percent,
        latestMiniMcu?.hba1c,
        participant.hba1c,
        participant.initial_hba1c,
        participant.hba1c_initial,
        participant.baseline_hba1c
      );

      const glucose = pickNumber(
        latestHistory?.glucose_value,
        latestMiniMcu?.glucose,
        participant.glucose,
        participant.gula_darah,
        participant.initial_glucose,
        participant.baseline_glucose
      );

      const sbp = pickNumber(
        latestHistory?.systolic,
        latestMiniMcu?.sbp,
        participant.sbp,
        participant.systolic_bp,
        participant.initial_sbp,
        participant.baseline_sbp,
        participant.blood_pressure_systolic
      );

      const dbp = pickNumber(
        latestHistory?.diastolic,
        latestMiniMcu?.dbp,
        participant.dbp,
        participant.diastolic_bp,
        participant.initial_dbp,
        participant.baseline_dbp,
        participant.blood_pressure_diastolic
      );

      const waist = pickNumber(
        latestHistory?.waist_cm,
        latestMiniMcu?.waist_cm,
        participant.waist_cm,
        participant.lingkar_perut,
        participant.initial_waist_cm,
        participant.baseline_waist_cm
      );

      const risk = classifyWellnessRisk({ hba1c, glucose, bmi, sbp, dbp });
      const latestEvidence = latestByDate(evidenceParticipantRows, "log_date") || null;
      const latestHealthtalk = latestByDate(healthtalkParticipantRows, "event_date") || null;

      const lastUploadDate = latestDate(
        latestWeight?.log_date,
        latestFood?.log_date,
        latestActivity?.log_date,
        latestMiniMcu?.exam_date,
        latestHistory?.checkup_date,
        latestEvidence?.log_date,
        latestHealthtalk?.event_date
      );

      const compliance = complianceStatus(lastUploadDate);

      const baselineSbp = pickNumber(
        participant.baseline_sbp,
        baselineHistory?.systolic,
        participant.initial_sbp,
        participant.sbp
      );

      const baselineDbp = pickNumber(
        participant.baseline_dbp,
        baselineHistory?.diastolic,
        participant.initial_dbp,
        participant.dbp
      );

      const baselineHba1c = pickNumber(
        participant.baseline_hba1c,
        baselineHistory?.hba1c_percent,
        participant.initial_hba1c,
        participant.hba1c_initial,
        participant.hba1c
      );

      const baselineGlucose = pickNumber(
        participant.baseline_glucose,
        baselineHistory?.glucose_value,
        participant.initial_glucose,
        participant.glucose,
        participant.gula_darah
      );

      const baselineWaist = pickNumber(
        participant.baseline_waist_cm,
        baselineHistory?.waist_cm,
        participant.initial_waist_cm,
        participant.waist_cm,
        participant.lingkar_perut
      );

      const participantForCalories = {
        ...participant,
        current_weight_kg: currentWeight,
        baseline_weight_kg: baselineWeight,
        weight_kg: currentWeight,
      };

      const parameterCharts = buildParticipantCharts({
        participant: participantForCalories,
        weightRows,
        foodRows,
        activityRows,
        miniMcuRows: miniMcuParticipantRows,
        historyRows: historyParticipantRows,
        pointRows: pointParticipantRows,
        baselineWeight,
        baselineBmi,
        baselineSbp,
        baselineDbp,
        baselineHba1c,
        baselineGlucose,
        baselineWaist,
      });

      const evidenceGallery = buildEvidenceGallery({
        evidenceRows: evidenceParticipantRows,
        foodRows,
        activityRows,
        healthtalkRows: healthtalkParticipantRows,
      });

      const recentResponses = buildRecentResponses({
        foodRows,
        weightRows,
        activityRows,
        healthtalkRows: healthtalkParticipantRows,
        pointRows: pointParticipantRows,
      });

      const activitySummary = buildActivitySummary(activityRows, participantForCalories);

      const totalPoints =
        Math.round(
          pointParticipantRows.reduce((sum: number, row: any) => sum + Number(row.points || 0), 0) *
            10
        ) / 10;

      const pendingEvidence = evidenceGallery.filter(
        (item: any) => String(item.status || "").toLowerCase() === "pending"
      ).length;

      return {
        id: participant.id,
        participant_id: participant.id,
        name: participant.name,
        code: participant.code,
        gender: participant.gender,
        company_name: companyName.get(Number(participant.wellness_company_id)) || "-",
        group_name:
          groupUnitName.get(Number(participant.wellness_group_unit_id)) ||
          groupUnitName.get(Number(participant.wellness_kelompok_id)) ||
          groupName.get(Number(participant.group_id)) ||
          "-",
        old_group_name: groupName.get(Number(participant.group_id)) || "-",
        height_cm: participant.height_cm,
        nakes_prefill_height_cm: nakesPrefillHeightCm,
        nakes_prefill_age_years: nakesPrefillAgeYears,
        birth_date:
          participant.birth_date ||
          participant.date_of_birth ||
          participant.birthdate ||
          participant.dob ||
          participant.tanggal_lahir ||
          null,
        initial_weight_kg: participant.initial_weight_kg,
        target_weight_kg: participant.target_weight_kg,
        baseline_weight_kg: baselineWeight ?? null,
        baseline_bmi: baselineBmi,
        baseline_sbp: baselineSbp,
        baseline_dbp: baselineDbp,
        baseline_hba1c: baselineHba1c,
        baseline_glucose: baselineGlucose,
        baseline_waist_cm: baselineWaist,
        baseline_risk_group: participant.baseline_risk_group || null,
        current_weight_kg: currentWeight ?? null,
        weight_delta_kg: delta,
        bmi_delta: roundedDelta(bmi, baselineBmi),
        waist_cm: waist,
        waist_delta_cm: roundedDelta(waist, baselineWaist),
        hba1c,
        hba1c_delta: roundedDelta(hba1c, baselineHba1c),
        glucose,
        glucose_delta: roundedDelta(glucose, baselineGlucose),
        sbp,
        dbp,
        sbp_delta: roundedDelta(sbp, baselineSbp),
        dbp_delta: roundedDelta(dbp, baselineDbp),
        bmi,
        bmi_status: latestWeight?.bmi_status || interpretBmi(bmi),
        risk_level: risk.level,
        risk_label: risk.label,
        risk_group_name: participant.baseline_risk_group || risk.group,
        risk_flags: risk.flags,
        need_followup:
          risk.needFollowup || compliance === "Drop risk" || compliance === "Tidak aktif",
        compliance_status: compliance,
        latest_weight_date: latestWeight?.log_date || null,
        latest_food_date: latestFood?.log_date || null,
        latest_activity_date: latestActivity?.log_date || null,
        latest_mini_mcu_date: latestMiniMcu?.exam_date || null,
        latest_history_date: latestHistory?.checkup_date || null,
        latest_upload_date: lastUploadDate,
        food_logs_count: foodRows.length,
        weight_logs_count: weightRows.length,
        activity_logs_count: activityRows.length,
        mini_mcu_logs_count: miniMcuParticipantRows.length,
        history_logs_count: historyParticipantRows.length,
        calories_today: sumCalories(foodRows.filter((row) => row.log_date === today)),
        activity_calories_today:
          Math.round(
            activityRows
              .filter((row) => getActivityDate(row) === today)
              .reduce((sum, row) => sum + Number(estimateCalories(row, participantForCalories) || 0), 0) *
              10
          ) / 10,
        parameter_charts: parameterCharts,
        evidence_gallery: evidenceGallery,
        recent_responses: recentResponses,
        activity_summary: activitySummary,
        activity_history: activitySummary,
        total_points: totalPoints,
        evidence_count: evidenceGallery.length,
        pending_evidence_count: pendingEvidence,
        latest_evidence_date: latestEvidence?.log_date || latestHealthtalk?.event_date || null,
      };
    });

    const bmiValues = rows.map((row) => Number(row.bmi || 0)).filter((value) => value > 0);
    const compliantRows = rows.filter((row) => row.compliance_status === "Baik").length;
    const weightDeltaValues = rows
      .map((row) => Number(row.weight_delta_kg))
      .filter((value) => Number.isFinite(value));

    return ok({
      summary: {
        total: rows.length,
        active: rows.length,
        avg_bmi: bmiValues.length
          ? Math.round((bmiValues.reduce((a, b) => a + b, 0) / bmiValues.length) * 10) /
            10
          : 0,
        high_risk: rows.filter((row) => row.risk_level === "high").length,
        medium_risk: rows.filter((row) => row.risk_level === "medium").length,
        need_followup: rows.filter((row) => row.need_followup).length,
        compliance_rate: rows.length ? Math.round((compliantRows / rows.length) * 100) : 0,
        total_food_calories_today: sumCalories(
          rows.map((row) => ({ total_calories: row.calories_today }))
        ),
        total_activity_calories_today: sumCalories(
          rows.map((row) => ({ calories: row.activity_calories_today }))
        ),
        avg_weight_delta_kg: weightDeltaValues.length
          ? Math.round(
              (weightDeltaValues.reduce((a, b) => a + b, 0) / weightDeltaValues.length) * 10
            ) / 10
          : 0,
        improved_weight_count: rows.filter((row) => Number(row.weight_delta_kg) < 0).length,
        total_points:
          Math.round(rows.reduce((sum, row) => sum + Number(row.total_points || 0), 0) * 10) /
          10,
        evidence_count: rows.reduce((sum, row) => sum + Number(row.evidence_count || 0), 0),
        pending_evidence_count: rows.reduce(
          (sum, row) => sum + Number(row.pending_evidence_count || 0),
          0
        ),
      },
      rows,
    });
  } catch (error: any) {
    return fail(
      error?.message || "Gagal memuat dashboard Wellness. Pastikan SQL wellness sudah dijalankan.",
      500
    );
  }
}
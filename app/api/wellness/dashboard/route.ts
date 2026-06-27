import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { calculateBmi, interpretBmi, weightDelta } from "@/lib/wellness/bmi";
import { classifyWellnessRisk, complianceStatus } from "@/lib/wellness/riskRules";
import { getAllowedWellnessParticipants, latestByDate } from "@/app/api/wellness/_utils";

// WELLNESS_PARTICIPANT_CHARTS_V351_DASHBOARD
// Wellness-only: grafik parameter per peserta diambil dari baseline, history MCU, weight logs, food logs, activity logs, dan mini MCU logs.
// WELLNESS_HISTORY_IMPORT_V352_DASHBOARD
// WELLNESS_EVIDENCE_GALLERY_PROGRESS_V364_API
// WELLNESS_INLINE_IMAGE_SHEET_V366_API_NO_APPROVAL

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
  return Math.round(rows.reduce((sum, row) => sum + Number(row.total_calories || row.calories || 0), 0) * 10) / 10;
}

function pickNumber(...values: any[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const numeric = Number(value);
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
  return [...(rows || [])].sort((a: any, b: any) => String(a?.[field] || "").localeCompare(String(b?.[field] || "")));
}

function historySource(row: any) {
  return row?.visit_label || {
    baseline_mcu: "Baseline MCU",
    mini_mcu: "Mini MCU",
    mini_mcu_week_4: "Mini MCU Week 4",
    mini_mcu_week_8: "Mini MCU Week 8",
    final_mcu: "Final MCU",
  }[String(row?.history_type || "")] || "History MCU";
}

function firstClinicalHistory(rows: any[] = []) {
  const sorted = sortedByDate(rows, "checkup_date");
  return sorted.find((row) => String(row?.history_type || "") === "baseline_mcu") || sorted[0] || null;
}

function addChartPoint(points: any[], point: any) {
  const hasNumber = Object.entries(point).some(([key, value]) => key !== "label" && key !== "date" && key !== "source" && pickNumber(value) !== null);
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
    .map(([date, value]) => ({ label: dateLabel(date), date, value: Math.round(value * 10) / 10, source: "Log harian" }));
}

function aggregateDurationByDate(rows: any[] = []) {
  const map = new Map<string, number>();
  for (const row of rows || []) {
    const date = String(row?.log_date || "").slice(0, 10);
    if (!date) continue;
    const value = Number(row?.duration_minutes || 0);
    if (!Number.isFinite(value)) continue;
    map.set(date, (map.get(date) || 0) + value);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ label: dateLabel(date), date, value: Math.round(value * 10) / 10, source: "Workout harian" }));
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
    .map(([date, value]) => ({ label: dateLabel(date), date, value: Math.round(value * 10) / 10, source: "Point harian" }));
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
  const match = text.match(/drive\.google\.com\/file\/d\/([^/]+)/i) || text.match(/[?&]id=([^&]+)/i);
  if (match?.[1]) return `https://drive.google.com/uc?export=view&id=${match[1]}`;
  return text;
}

function buildEvidenceGallery({ evidenceRows, foodRows, activityRows, healthtalkRows }: any) {
  const items: any[] = [];
  const add = (item: any) => {
    const url = normalizeEvidenceUrl(item?.evidence_url || item?.url || item?.photo_url);
    if (!url) return;
    const key = `${item.type || item.evidence_type || "evidence"}|${url}|${item.date || item.log_date || item.created_at || ""}`;
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
      status: "saved",
      notes: item.notes || "",
      source_type: item.source_type || item.source || "manual",
    });
  };

  for (const row of evidenceRows || []) {
    add({
      id: row.id,
      type: row.evidence_type === "food_photo" ? "Foto makanan" : row.evidence_type === "activity_proof" ? "Bukti aktivitas" : row.evidence_type === "healthtalk_proof" ? "Bukti healthtalk" : row.evidence_type || "Bukti",
      title: row.title,
      evidence_url: row.evidence_url,
      date: row.log_date || row.created_at,
      status: "saved",
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
      status: "saved",
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
      description: [row.waist_cm ? `LP ${row.waist_cm} cm` : "", row.bmi ? `BMI ${row.bmi}` : "", row.notes || ""].filter(Boolean).join(" · "),
      calories: null,
      evidence_url: "",
      points: pointMap.get(`weight_log|${row.id}`) || 0,
    });
  }
  for (const row of activityRows || []) {
    const raw = row.raw_payload || {};
    items.push({
      id: `activity-${row.id}`,
      date: row.log_date,
      type: "Aktivitas",
      title: row.activity_type || "Aktivitas",
      description: [row.duration_minutes ? `${row.duration_minutes} menit` : "", row.distance_km ? `${row.distance_km} km` : "", row.notes || ""].filter(Boolean).join(" · "),
      calories: row.calories || null,
      evidence_url: normalizeEvidenceUrl(raw.evidence_url),
      points: (pointMap.get(`activity_log|${row.id}`) || 0) + (pointMap.get(`activity_evidence|${row.id}`) || 0),
    });
  }
  for (const row of healthtalkRows || []) {
    items.push({
      id: `healthtalk-${row.id}`,
      date: row.event_date,
      type: "Healthtalk",
      title: row.title || "Healthtalk / seminar",
      description: [row.attendance_type || "", row.notes || ""].filter(Boolean).join(" · "),
      calories: null,
      evidence_url: normalizeEvidenceUrl(row.evidence_url),
      points: pointMap.get(`healthtalk_log|${row.id}`) || 0,
    });
  }
  return items.sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 18);
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

  addChartPoint(weightChart, { label: "Baseline", date: baselineDate, source: "Baseline MCU", value: baselineWeight });
  addChartPoint(bmiChart, { label: "Baseline", date: baselineDate, source: "Baseline MCU", value: baselineBmi });
  addChartPoint(waistChart, { label: "Baseline", date: baselineDate, source: "Baseline MCU", value: baselineWaist });
  addChartPoint(bpChart, { label: "Baseline", date: baselineDate, source: "Baseline MCU", sbp: baselineSbp, dbp: baselineDbp });
  addChartPoint(hba1cChart, { label: "Baseline", date: baselineDate, source: "Baseline MCU", value: baselineHba1c });
  addChartPoint(glucoseChart, { label: "Baseline", date: baselineDate, source: "Baseline MCU", value: baselineGlucose });

  for (const row of sortedByDate(historyRows, "checkup_date")) {
    const label = row.visit_label || dateLabel(row.checkup_date);
    const source = historySource(row);
    addChartPoint(weightChart, { label, date: row.checkup_date, source, value: row.weight_kg });
    addChartPoint(bmiChart, { label, date: row.checkup_date, source, value: row.bmi });
    addChartPoint(waistChart, { label, date: row.checkup_date, source, value: row.waist_cm });
    addChartPoint(bpChart, { label, date: row.checkup_date, source, sbp: row.systolic, dbp: row.diastolic });
    addChartPoint(hba1cChart, { label, date: row.checkup_date, source, value: row.hba1c_percent });
    addChartPoint(glucoseChart, { label, date: row.checkup_date, source, value: row.glucose_value });
  }

  for (const row of sortedByDate(weightRows)) {
    addChartPoint(weightChart, { label: dateLabel(row.log_date), date: row.log_date, source: "Input BB", value: row.weight_kg });
    addChartPoint(bmiChart, { label: dateLabel(row.log_date), date: row.log_date, source: "Input BB", value: row.bmi });
    addChartPoint(waistChart, { label: dateLabel(row.log_date), date: row.log_date, source: "Input BB", value: row.waist_cm });
  }

  for (const row of sortedByDate(miniMcuRows, "exam_date")) {
    addChartPoint(weightChart, { label: dateLabel(row.exam_date), date: row.exam_date, source: "Mini MCU", value: row.weight_kg });
    addChartPoint(bmiChart, { label: dateLabel(row.exam_date), date: row.exam_date, source: "Mini MCU", value: row.bmi });
    addChartPoint(waistChart, { label: dateLabel(row.exam_date), date: row.exam_date, source: "Mini MCU", value: row.waist_cm });
    addChartPoint(bpChart, { label: dateLabel(row.exam_date), date: row.exam_date, source: "Mini MCU", sbp: row.sbp, dbp: row.dbp });
    addChartPoint(hba1cChart, { label: dateLabel(row.exam_date), date: row.exam_date, source: "Mini MCU", value: row.hba1c });
    addChartPoint(glucoseChart, { label: dateLabel(row.exam_date), date: row.exam_date, source: "Mini MCU", value: row.glucose });
  }

  return {
    weight_kg: compactChart(weightChart),
    bmi: compactChart(bmiChart),
    waist_cm: compactChart(waistChart),
    blood_pressure: compactChart(bpChart),
    hba1c: compactChart(hba1cChart),
    glucose: compactChart(glucoseChart),
    nutrition_calories: compactChart(aggregateCaloriesByDate(foodRows, "log_date", "total_calories")),
    activity_calories: compactChart(aggregateCaloriesByDate(activityRows, "log_date", "calories")),
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

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  try {
    const supabase = getSupabaseAdmin();
    const participants = await getAllowedWellnessParticipants(supabase, user);
    const participantIds = participants.map((p: any) => Number(p.id)).filter(Boolean);

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
        },
        rows: [],
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const [weightRes, foodRes, activityRes, groupRes, miniMcuRows, historyRows, companies, groupUnits, evidenceRows, pointRows, healthtalkRows] = await Promise.all([
      supabase.from("wellness_weight_logs").select("*").in("participant_id", participantIds),
      supabase.from("wellness_food_logs").select("*").in("participant_id", participantIds),
      supabase.from("wellness_activity_logs").select("*").in("participant_id", participantIds),
      supabase.from("wellness_groups").select("*"),
      safeSelect(supabase, "wellness_mini_mcu_logs", (query) => query.in("participant_id", participantIds)),
      safeSelect(supabase, "wellness_checkup_history", (query) => query.in("participant_id", participantIds)),
      safeSelect(supabase, "wellness_companies", (query) => query.order("name", { ascending: true })),
      safeSelect(supabase, "wellness_group_units", (query) => query.order("name", { ascending: true })),
      safeSelect(supabase, "wellness_daily_evidence", (query) => query.in("participant_id", participantIds).order("log_date", { ascending: false })),
      safeSelect(supabase, "wellness_point_logs", (query) => query.in("participant_id", participantIds).order("log_date", { ascending: true })),
      safeSelect(supabase, "wellness_healthtalk_logs", (query) => query.in("participant_id", participantIds).order("event_date", { ascending: false })),
    ]);

    if (weightRes.error) throw weightRes.error;
    if (foodRes.error) throw foodRes.error;
    if (activityRes.error) throw activityRes.error;

    const weightsByParticipant = groupByParticipant(weightRes.data || []);
    const foodsByParticipant = groupByParticipant(foodRes.data || []);
    const activitiesByParticipant = groupByParticipant(activityRes.data || []);
    const miniMcuByParticipant = groupByParticipant(miniMcuRows || []);
    const historyByParticipant = groupByParticipant(historyRows || []);
    const evidenceByParticipant = groupByParticipant(evidenceRows || []);
    const pointsByParticipant = groupByParticipant(pointRows || []);
    const healthtalkByParticipant = groupByParticipant(healthtalkRows || []);
    const groupName = new Map((groupRes.data || []).map((g: any) => [Number(g.id), g.name || "-"]));
    const companyName = new Map((companies || []).map((company: any) => [Number(company.id), company.name || "-"]));
    const groupUnitName = new Map((groupUnits || []).map((unit: any) => [Number(unit.id), unit.name || "-"]));

    const rows = participants.map((participant: any) => {
      const weightRows = weightsByParticipant.get(Number(participant.id)) || [];
      const foodRows = foodsByParticipant.get(Number(participant.id)) || [];
      const activityRows = activitiesByParticipant.get(Number(participant.id)) || [];
      const miniMcuParticipantRows = miniMcuByParticipant.get(Number(participant.id)) || [];
      const historyParticipantRows = historyByParticipant.get(Number(participant.id)) || [];
      const evidenceParticipantRows = evidenceByParticipant.get(Number(participant.id)) || [];
      const pointParticipantRows = pointsByParticipant.get(Number(participant.id)) || [];
      const healthtalkParticipantRows = healthtalkByParticipant.get(Number(participant.id)) || [];
      const latestWeight = latestByDate(weightRows) || null;
      const latestFood = latestByDate(foodRows) || null;
      const latestActivity = latestByDate(activityRows) || null;
      const latestMiniMcu = latestByDate(miniMcuParticipantRows, "exam_date") || null;
      const latestHistory = latestByDate(historyParticipantRows, "checkup_date") || null;
      const baselineHistory = firstClinicalHistory(historyParticipantRows);
      const baselineWeight = pickNumber(participant.initial_weight_kg, baselineHistory?.weight_kg);
      const baselineBmi = pickNumber(participant.baseline_bmi, baselineHistory?.bmi, calculateBmi(baselineWeight, participant.height_cm));
      const currentWeight = pickNumber(latestHistory?.weight_kg, latestMiniMcu?.weight_kg, latestWeight?.weight_kg, baselineWeight);
      const bmi = pickNumber(latestHistory?.bmi, latestMiniMcu?.bmi, latestWeight?.bmi, calculateBmi(currentWeight, participant.height_cm), baselineBmi);
      const delta = weightDelta(currentWeight, baselineWeight);
      const hba1c = pickNumber(latestHistory?.hba1c_percent, latestMiniMcu?.hba1c, participant.hba1c, participant.initial_hba1c, participant.hba1c_initial, participant.baseline_hba1c);
      const glucose = pickNumber(latestHistory?.glucose_value, latestMiniMcu?.glucose, participant.glucose, participant.gula_darah, participant.initial_glucose, participant.baseline_glucose);
      const sbp = pickNumber(latestHistory?.systolic, latestMiniMcu?.sbp, participant.sbp, participant.systolic_bp, participant.initial_sbp, participant.baseline_sbp, participant.blood_pressure_systolic);
      const dbp = pickNumber(latestHistory?.diastolic, latestMiniMcu?.dbp, participant.dbp, participant.diastolic_bp, participant.initial_dbp, participant.baseline_dbp, participant.blood_pressure_diastolic);
      const waist = pickNumber(latestHistory?.waist_cm, latestMiniMcu?.waist_cm, participant.waist_cm, participant.lingkar_perut, participant.initial_waist_cm, participant.baseline_waist_cm);
      const risk = classifyWellnessRisk({ hba1c, glucose, bmi, sbp, dbp });
      const latestEvidence = latestByDate(evidenceParticipantRows, "log_date") || null;
      const latestHealthtalk = latestByDate(healthtalkParticipantRows, "event_date") || null;
      const lastUploadDate = latestDate(latestWeight?.log_date, latestFood?.log_date, latestActivity?.log_date, latestMiniMcu?.exam_date, latestHistory?.checkup_date, latestEvidence?.log_date, latestHealthtalk?.event_date);
      const compliance = complianceStatus(lastUploadDate);
      const baselineSbp = pickNumber(participant.baseline_sbp, baselineHistory?.systolic, participant.initial_sbp, participant.sbp);
      const baselineDbp = pickNumber(participant.baseline_dbp, baselineHistory?.diastolic, participant.initial_dbp, participant.dbp);
      const baselineHba1c = pickNumber(participant.baseline_hba1c, baselineHistory?.hba1c_percent, participant.initial_hba1c, participant.hba1c_initial, participant.hba1c);
      const baselineGlucose = pickNumber(participant.baseline_glucose, baselineHistory?.glucose_value, participant.initial_glucose, participant.glucose, participant.gula_darah);
      const baselineWaist = pickNumber(participant.baseline_waist_cm, baselineHistory?.waist_cm, participant.initial_waist_cm, participant.waist_cm, participant.lingkar_perut);
      const parameterCharts = buildParticipantCharts({
        participant,
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

      const evidenceGallery = buildEvidenceGallery({ evidenceRows: evidenceParticipantRows, foodRows, activityRows, healthtalkRows: healthtalkParticipantRows });
      const recentResponses = buildRecentResponses({ foodRows, weightRows, activityRows, healthtalkRows: healthtalkParticipantRows, pointRows: pointParticipantRows });
      const totalPoints = Math.round(pointParticipantRows.reduce((sum: number, row: any) => sum + Number(row.points || 0), 0) * 10) / 10;
      return {
        id: participant.id,
        participant_id: participant.id,
        name: participant.name,
        code: participant.code,
        gender: participant.gender,
        company_name: companyName.get(Number(participant.wellness_company_id)) || "-",
        group_name: groupUnitName.get(Number(participant.wellness_group_unit_id)) || groupUnitName.get(Number(participant.wellness_kelompok_id)) || groupName.get(Number(participant.group_id)) || "-",
        old_group_name: groupName.get(Number(participant.group_id)) || "-",
        height_cm: participant.height_cm,
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
        need_followup: risk.needFollowup || compliance === "Drop risk" || compliance === "Tidak aktif",
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
        activity_calories_today: sumCalories(activityRows.filter((row) => row.log_date === today)),
        parameter_charts: parameterCharts,
        evidence_gallery: evidenceGallery,
        recent_responses: recentResponses,
        total_points: totalPoints,
        evidence_count: evidenceGallery.length,
        latest_evidence_date: latestEvidence?.log_date || latestHealthtalk?.event_date || null,
      };
    });

    const bmiValues = rows.map((row) => Number(row.bmi || 0)).filter((value) => value > 0);
    const compliantRows = rows.filter((row) => row.compliance_status === "Baik").length;
    const weightDeltaValues = rows.map((row) => Number(row.weight_delta_kg)).filter((value) => Number.isFinite(value));

    return ok({
      summary: {
        total: rows.length,
        active: rows.length,
        avg_bmi: bmiValues.length ? Math.round((bmiValues.reduce((a, b) => a + b, 0) / bmiValues.length) * 10) / 10 : 0,
        high_risk: rows.filter((row) => row.risk_level === "high").length,
        medium_risk: rows.filter((row) => row.risk_level === "medium").length,
        need_followup: rows.filter((row) => row.need_followup).length,
        compliance_rate: rows.length ? Math.round((compliantRows / rows.length) * 100) : 0,
        total_food_calories_today: sumCalories(rows.map((row) => ({ total_calories: row.calories_today }))),
        total_activity_calories_today: sumCalories(rows.map((row) => ({ calories: row.activity_calories_today }))),
        avg_weight_delta_kg: weightDeltaValues.length ? Math.round((weightDeltaValues.reduce((a, b) => a + b, 0) / weightDeltaValues.length) * 10) / 10 : 0,
        improved_weight_count: rows.filter((row) => Number(row.weight_delta_kg) < 0).length,
        total_points: Math.round(rows.reduce((sum, row) => sum + Number(row.total_points || 0), 0) * 10) / 10,
        evidence_count: rows.reduce((sum, row) => sum + Number(row.evidence_count || 0), 0),
      },
      rows,
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat dashboard Wellness. Pastikan SQL wellness sudah dijalankan.", 500);
  }
}

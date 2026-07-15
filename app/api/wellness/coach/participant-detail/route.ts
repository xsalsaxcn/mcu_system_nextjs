import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchWellnessGoogleSheetRows,
  googleSheetRowsToFoodLogs,
  googleSheetRowsToHealthtalkLogs,
} from "@/lib/wellness/googleSheetResponses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// WELLNESS_COACH_PARTICIPANT_DETAIL_V55
// Read-only detail endpoint for assigned coach participants.
// No schema migration and no access outside coach assignments.

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) throw new Error("Supabase admin env is missing.");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function clean(value: any) {
  return String(value ?? "").trim();
}

function parseNumber(value: any): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = clean(value);
  if (!text || text === "-") return null;

  const normalized = /^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text)
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function asNumber(value: any): number {
  return parseNumber(value) ?? 0;
}

function nullableNumber(...values: any[]): number | null {
  for (const value of values) {
    const n = parseNumber(value);
    if (n !== null) return n;
  }
  return null;
}

function dateKey(value: any) {
  return clean(value).slice(0, 10);
}

function dateLabel(value: any) {
  const text = dateKey(value);
  const parts = text.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : text || "-";
}

function participantIds(row: any) {
  return [
    row?.wellness_group_unit_id,
    row?.group_unit_id,
    row?.group_id,
    row?.wellness_group_id,
  ]
    .map(clean)
    .filter(Boolean);
}

function participantNames(row: any) {
  return [
    row?.group_name,
    row?.group_unit_name,
    row?.risk_group,
    row?.risk_category,
    row?.category,
    row?.group,
  ]
    .map((value) => clean(value).toLowerCase())
    .filter(Boolean);
}

function canAccessParticipant(row: any, assignments: any[]) {
  const allowedIds = new Set(
    (assignments || []).map((item) => clean(item.wellness_group_unit_id)).filter(Boolean)
  );
  const allowedNames = new Set(
    (assignments || []).map((item) => clean(item.group_name).toLowerCase()).filter(Boolean)
  );

  return (
    participantIds(row).some((id) => allowedIds.has(id)) ||
    participantNames(row).some((name) => allowedNames.has(name))
  );
}

async function getCoach(request: NextRequest, supabase: any) {
  const token = request.cookies.get("wellness_coach_session")?.value || "";
  if (!token) return null;

  const { data, error } = await supabase
    .from("wellness_coach_auth_sessions")
    .select("*, coach:wellness_coach_users(*)")
    .eq("session_token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data?.coach || data.coach.is_active === false) return null;
  return data.coach;
}

async function safeSelect(
  supabase: any,
  table: string,
  builder: (query: any) => any
): Promise<any[]> {
  try {
    const result = await builder(supabase.from(table).select("*"));
    return result?.error ? [] : result?.data || [];
  } catch {
    return [];
  }
}

function mergeRows(...lists: any[][]) {
  const map = new Map<string, any>();

  for (const list of lists) {
    for (const row of list || []) {
      const key = row?.id
        ? `id:${row.id}`
        : JSON.stringify([
            row?.participant_id,
            row?.participant_code,
            row?.log_date,
            row?.event_date,
            row?.title,
            row?.healthtalk_title,
            row?.food_name,
          ]);
      map.set(key, row);
    }
  }

  return [...map.values()];
}

function aggregateByDate(rows: any[], valueGetter: (row: any) => number, dateGetter: (row: any) => string) {
  const map = new Map<string, number>();

  for (const row of rows || []) {
    const date = dateKey(dateGetter(row));
    if (!date) continue;
    const value = valueGetter(row);
    if (!Number.isFinite(value)) continue;
    map.set(date, (map.get(date) || 0) + value);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([date, value]) => ({
      date,
      label: dateLabel(date),
      value: Math.round(value * 10) / 10,
    }));
}

function compactClinicalPoints(rows: any[], getter: (row: any) => number | null) {
  const map = new Map<string, any>();

  for (const row of rows || []) {
    const date = dateKey(row?.checkup_date || row?.exam_date || row?.log_date || row?.created_at);
    if (!date) continue;
    const value = getter(row);
    if (value === null || !Number.isFinite(value)) continue;
    map.set(date, { date, label: dateLabel(date), value: Math.round(value * 10) / 10 });
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-20);
}

function compactBloodPressure(rows: any[]) {
  const map = new Map<string, any>();

  for (const row of rows || []) {
    const date = dateKey(row?.checkup_date || row?.exam_date || row?.created_at);
    if (!date) continue;
    const systolic = nullableNumber(row?.systolic, row?.sbp, row?.systolic_bp);
    const diastolic = nullableNumber(row?.diastolic, row?.dbp, row?.diastolic_bp);
    if (systolic === null && diastolic === null) continue;
    map.set(date, {
      date,
      label: dateLabel(date),
      value: systolic,
      secondary: diastolic,
    });
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-20);
}

function activityCalories(row: any) {
  return asNumber(
    row?.calories ??
      row?.total_calories ??
      row?.calories_burned ??
      row?.activity_calories ??
      row?.raw_payload?.health_connect_calories ??
      row?.raw_payload?.google_fit_calories_expended ??
      row?.raw_payload?.calories
  );
}

function activitySteps(row: any) {
  return asNumber(
    row?.steps ?? row?.total_steps ?? row?.raw_payload?.health_connect_steps ?? row?.raw_payload?.google_fit_steps
  );
}

function foodCalories(row: any) {
  return asNumber(
    row?.total_calories ??
      row?.calories ??
      row?.estimated_calories ??
      row?.raw_payload?.["Kalori Makanan"]
  );
}

function healthtalkPoint(row: any) {
  const explicit = nullableNumber(
    row?.points,
    row?.point,
    row?.total_points,
    row?.raw_payload?.["Total Point"]
  );
  if (explicit !== null) return explicit;

  const type = clean(row?.healthtalk_type || row?.attendance_type || row?.type).toLowerCase();
  const hasEvidence = Boolean(clean(row?.evidence_url || row?.evidence_preview_url));
  if (/offline|luring|onsite|tatap muka/.test(type)) return hasEvidence ? 20 : 0;
  if (/online|daring|webinar|zoom/.test(type)) return 10;
  return 0;
}

function pointCategory(row: any) {
  const text = [row?.source_type, row?.point_key, row?.description]
    .map(clean)
    .join(" ")
    .toLowerCase();

  if (/health.?talk|seminar/.test(text)) return "healthtalk";
  if (/activity|workout|step/.test(text)) return "activity";
  if (/food|nutrition|nutrisi/.test(text)) return "nutrition";
  return "other";
}

export async function GET(request: NextRequest) {
  try {
    const participantId = asNumber(request.nextUrl.searchParams.get("participant_id"));
    if (!participantId) {
      return NextResponse.json({ ok: false, message: "participant_id wajib diisi." }, { status: 400 });
    }

    const supabase = adminClient();
    const coach = await getCoach(request, supabase);
    if (!coach) {
      return NextResponse.json({ ok: false, message: "Session coach belum aktif." }, { status: 401 });
    }

    const { data: assignments, error: assignmentError } = await supabase
      .from("wellness_coach_group_assignments")
      .select("*")
      .eq("coach_user_id", coach.id)
      .eq("is_active", true);

    if (assignmentError) throw assignmentError;

    const { data: participant, error: participantError } = await supabase
      .from("wellness_participants")
      .select("*")
      .eq("id", participantId)
      .maybeSingle();

    if (participantError || !participant) {
      return NextResponse.json({ ok: false, message: "Peserta tidak ditemukan." }, { status: 404 });
    }

    if (!canAccessParticipant(participant, assignments || [])) {
      return NextResponse.json({ ok: false, message: "Peserta tidak termasuk assigned group coach." }, { status: 403 });
    }

    const code = clean(participant.code || participant.employee_code || participant.no_karyawan);

    const [activityRows, foodRows, weightRows, clinicalRows, historyById, historyByCode, miniMcuRows, pointRows, healthtalkRows] = await Promise.all([
      safeSelect(supabase, "wellness_activity_logs", (q) => q.eq("participant_id", participantId).order("log_date", { ascending: true }).limit(2000)),
      safeSelect(supabase, "wellness_food_logs", (q) => q.eq("participant_id", participantId).order("log_date", { ascending: true }).limit(2000)),
      safeSelect(supabase, "wellness_weight_logs", (q) => q.eq("participant_id", participantId).order("log_date", { ascending: true }).limit(1000)),
      safeSelect(supabase, "wellness_clinical_history", (q) => q.eq("participant_id", participantId).limit(1000)),
      safeSelect(supabase, "wellness_checkup_history", (q) => q.eq("participant_id", participantId).order("checkup_date", { ascending: true }).limit(1000)),
      code
        ? safeSelect(supabase, "wellness_checkup_history", (q) => q.eq("employee_code", code).order("checkup_date", { ascending: true }).limit(1000))
        : Promise.resolve([]),
      safeSelect(supabase, "wellness_mini_mcu_logs", (q) => q.eq("participant_id", participantId).order("exam_date", { ascending: true }).limit(1000)),
      safeSelect(supabase, "wellness_point_logs", (q) => q.eq("participant_id", participantId).order("log_date", { ascending: true }).limit(3000)),
      safeSelect(supabase, "wellness_healthtalk_logs", (q) => q.eq("participant_id", participantId).order("event_date", { ascending: true }).limit(1000)),
    ]);

    const sheetResult = await fetchWellnessGoogleSheetRows({
      participantId,
      code,
      limit: 2000,
    }).catch(() => ({ ok: false, rows: [] as any[] }));

    const sheetFoodRows = googleSheetRowsToFoodLogs(sheetResult.rows || []).filter((row: any) => {
      return asNumber(row.participant_id) === participantId || (code && clean(row.participant_code) === code);
    });
    const sheetHealthtalkRows = googleSheetRowsToHealthtalkLogs(sheetResult.rows || []).filter((row: any) => {
      return asNumber(row.participant_id) === participantId || (code && clean(row.participant_code) === code);
    });

    const mergedFoodRows = mergeRows(foodRows, sheetFoodRows);
    const mergedHealthtalkRows = mergeRows(healthtalkRows, sheetHealthtalkRows);
    const clinicalAll = mergeRows(clinicalRows, historyById, historyByCode, miniMcuRows);

    const pointBreakdown = { nutrition: 0, activity: 0, healthtalk: 0, other: 0 };
    for (const row of pointRows) {
      const category = pointCategory(row);
      pointBreakdown[category as keyof typeof pointBreakdown] += asNumber(row?.points);
    }

    if (pointBreakdown.nutrition === 0) {
      pointBreakdown.nutrition = mergedFoodRows.reduce((sum, row) => {
        const explicit = nullableNumber(row?.points, row?.point, row?.total_points, row?.raw_payload?.["Total Point"]);
        return sum + (explicit === null ? 5 : explicit);
      }, 0);
    }
    if (pointBreakdown.healthtalk === 0) {
      pointBreakdown.healthtalk = mergedHealthtalkRows.reduce((sum, row) => sum + healthtalkPoint(row), 0);
    }

    const totalPoints = Object.values(pointBreakdown).reduce((sum, value) => sum + value, 0);

    const nutritionChart = aggregateByDate(mergedFoodRows, foodCalories, (row) => row?.log_date || row?.created_at);
    const workoutChart = aggregateByDate(activityRows, activityCalories, (row) => row?.log_date || row?.started_at || row?.created_at);
    const stepChart = aggregateByDate(activityRows, activitySteps, (row) => row?.log_date || row?.started_at || row?.created_at);
    const pointChart = aggregateByDate(
      pointRows,
      (row) => asNumber(row?.points),
      (row) => row?.log_date || row?.event_date || row?.created_at
    );

    if (pointChart.length === 0) {
      const derivedPointRows = [
        ...mergedFoodRows.map((row) => ({
          date: row?.log_date || row?.created_at,
          points: nullableNumber(row?.points, row?.point, row?.total_points) ?? 5,
        })),
        ...mergedHealthtalkRows.map((row) => ({
          date: row?.event_date || row?.log_date || row?.created_at,
          points: healthtalkPoint(row),
        })),
      ];
      pointChart.push(...aggregateByDate(derivedPointRows, (row) => asNumber(row.points), (row) => row.date));
    }

    const charts = {
      nutrition_calories: nutritionChart,
      workout_calories: workoutChart,
      steps: stepChart,
      weight_kg: compactClinicalPoints(
        mergeRows(weightRows, clinicalAll),
        (row) => nullableNumber(row?.weight_kg, row?.weight, row?.body_weight)
      ),
      bmi: compactClinicalPoints(
        mergeRows(weightRows, clinicalAll),
        (row) => nullableNumber(row?.bmi)
      ),
      waist_cm: compactClinicalPoints(
        mergeRows(weightRows, clinicalAll),
        (row) => nullableNumber(row?.waist_cm, row?.waist_circumference)
      ),
      hba1c: compactClinicalPoints(
        clinicalAll,
        (row) => nullableNumber(row?.hba1c_percent, row?.hba1c, row?.hba1c_value)
      ),
      glucose: compactClinicalPoints(
        clinicalAll,
        (row) => nullableNumber(row?.glucose_value, row?.blood_glucose, row?.fasting_glucose)
      ),
      blood_pressure: compactBloodPressure(clinicalAll),
      points: pointChart,
    };

    const latestWeight = charts.weight_kg.at(-1)?.value ?? null;
    const latestBmi = charts.bmi.at(-1)?.value ?? null;
    const latestBp = charts.blood_pressure.at(-1) || null;

    const healthtalks = mergedHealthtalkRows
      .map((row: any) => ({
        id: row.id,
        date: dateKey(row?.event_date || row?.log_date || row?.created_at),
        title: clean(row?.title || row?.healthtalk_title || "Health Talk"),
        type: clean(row?.healthtalk_type || row?.attendance_type || "-"),
        points: healthtalkPoint(row),
        evidence_url: clean(row?.evidence_url || row?.evidence_preview_url),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      ok: true,
      participant: {
        id: participant.id,
        name: clean(participant.name || participant.employee_name || participant.full_name || "-"),
        code: clean(participant.code || participant.employee_code || participant.no_karyawan || "-"),
      },
      summary: {
        total_points: Math.round(totalPoints),
        healthtalk_count: healthtalks.length,
        nutrition_log_count: mergedFoodRows.length,
        workout_log_count: activityRows.length,
        total_steps: activityRows.reduce((sum, row) => sum + activitySteps(row), 0),
        total_workout_calories: Math.round(activityRows.reduce((sum, row) => sum + activityCalories(row), 0)),
        latest_weight_kg: latestWeight,
        latest_bmi: latestBmi,
        latest_systolic: latestBp?.value ?? null,
        latest_diastolic: latestBp?.secondary ?? null,
      },
      point_breakdown: pointBreakdown,
      charts,
      healthtalks,
      google_sheet: {
        ok: Boolean(sheetResult.ok),
        nutrition_count: sheetFoodRows.length,
        healthtalk_count: sheetHealthtalkRows.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal memuat detail peserta." },
      { status: 500 }
    );
  }
}

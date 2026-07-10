import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) {
    throw new Error("Supabase admin env is missing.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getRaw(row: any) {
  const raw = row?.raw_payload;

  if (!raw) return {};

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  if (typeof raw === "object") return raw;

  return {};
}

function firstValue(...values: any[]) {
  for (const value of values) {
    const text = clean(value);
    if (text) return value;
  }

  return "";
}

function firstNumber(...values: any[]) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }

  return 0;
}

function dateValue(row: any) {
  return clean(
    row?.updated_at ||
      row?.created_at ||
      row?.log_date ||
      row?.event_date ||
      row?.exam_date
  );
}

function sortNewest(a: any, b: any) {
  return dateValue(b).localeCompare(dateValue(a));
}

function normalizeFood(row: any) {
  const raw = getRaw(row);
  const original = raw?.original_payload || raw?.original || {};

  return {
    ...row,
    food_name: firstValue(
      row?.food_name,
      row?.meal_text,
      row?.title,
      raw?.food_name,
      raw?.foodName,
      raw?.makanan,
      raw?.original_food_name,
      original?.food_name,
      original?.foodName,
      original?.makanan,
      "Food log"
    ),
    meal_type: firstValue(
      row?.meal_type,
      row?.meal_time,
      raw?.meal_type,
      raw?.mealType,
      raw?.meal_time,
      original?.meal_type,
      original?.mealType,
      "-"
    ),
    portion: firstValue(
      row?.portion,
      raw?.portion,
      raw?.porsi,
      original?.portion,
      original?.porsi,
      "-"
    ),
    calories: firstNumber(
      row?.calories,
      row?.total_calories,
      raw?.calories,
      raw?.matched_calories,
      raw?.total_calories,
      original?.calories,
      original?.matched_calories
    ),
    photo_url: firstValue(
      row?.photo_url,
      row?.evidence_url,
      raw?.photo_url,
      raw?.photoUrl,
      raw?.evidence_url,
      raw?.image_url,
      original?.photo_url,
      original?.photoUrl,
      original?.evidence_url
    ),
    notes: firstValue(
      row?.notes,
      raw?.notes,
      raw?.catatan,
      original?.notes,
      original?.catatan
    ),
    log_date: clean(row?.log_date || raw?.log_date || original?.log_date || row?.created_at).slice(0, 10),
    normalized_source: clean(row?.source || raw?.source || "food_log"),
  };
}

function activitySteps(row: any) {
  const raw = getRaw(row);
  const original = raw?.original_payload || raw?.original || {};

  return firstNumber(
    row?.steps,
    row?.total_steps,
    raw?.steps,
    raw?.total_steps,
    raw?.health_connect_steps,
    raw?.google_fit_steps,
    original?.steps,
    original?.total_steps,
    original?.health_connect_steps,
    original?.google_fit_steps
  );
}

function activityCalories(row: any) {
  const raw = getRaw(row);
  const original = raw?.original_payload || raw?.original || {};

  return firstNumber(
    row?.calories,
    row?.total_calories,
    raw?.calories,
    raw?.total_calories,
    raw?.health_connect_calories,
    raw?.google_fit_calories,
    raw?.google_fit_calories_expended,
    original?.calories,
    original?.total_calories,
    original?.google_fit_calories,
    original?.google_fit_calories_expended
  );
}

function activityDistance(row: any) {
  const raw = getRaw(row);
  const original = raw?.original_payload || raw?.original || {};

  return firstNumber(
    row?.distance_km,
    row?.distance,
    raw?.distance_km,
    raw?.distance,
    raw?.google_fit_distance_km,
    raw?.health_connect_distance_km,
    original?.distance_km,
    original?.google_fit_distance_km
  );
}

function activityDuration(row: any) {
  const raw = getRaw(row);
  const original = raw?.original_payload || raw?.original || {};

  return firstNumber(
    row?.duration_minutes,
    row?.active_minutes,
    raw?.duration_minutes,
    raw?.active_minutes,
    raw?.google_fit_active_minutes,
    raw?.health_connect_active_minutes,
    original?.duration_minutes,
    original?.active_minutes
  );
}

function normalizeActivity(row: any) {
  const raw = getRaw(row);
  const original = raw?.original_payload || raw?.original || {};

  return {
    ...row,
    activity_name: firstValue(
      row?.activity_name,
      row?.activity_type,
      raw?.activity_name,
      raw?.activity_type,
      original?.activity_name,
      original?.activity_type,
      "Activity"
    ),
    normalized_steps: activitySteps(row),
    normalized_calories: activityCalories(row),
    normalized_distance_km: activityDistance(row),
    normalized_duration_minutes: activityDuration(row),
    normalized_source: clean(
      row?.source ||
        raw?.source ||
        original?.source ||
        "manual"
    ),
    normalized_date: clean(row?.log_date || raw?.log_date || original?.log_date || row?.created_at).slice(0, 10),
  };
}

function normalizeHealthTalk(row: any) {
  const raw = getRaw(row);

  return {
    ...row,
    title: firstValue(row?.title, raw?.title, raw?.topic, "Health Talk"),
    notes: firstValue(row?.notes, row?.description, raw?.notes, raw?.description),
    event_date: clean(row?.event_date || raw?.event_date || row?.created_at).slice(0, 10),
  };
}

function normalizeCheckup(row: any) {
  const raw = getRaw(row);

  return {
    ...row,
    bmi: firstNumber(row?.bmi, row?.imt, raw?.bmi, raw?.imt),
    systolic: firstNumber(row?.systolic, row?.sistole, raw?.systolic, raw?.sistole),
    diastolic: firstNumber(row?.diastolic, row?.diastole, raw?.diastolic, raw?.diastole),
    weight_kg: firstNumber(row?.weight_kg, row?.weight, row?.bb, raw?.weight_kg, raw?.weight, raw?.bb),
    exam_date: clean(row?.exam_date || row?.log_date || raw?.exam_date || raw?.log_date || row?.created_at).slice(0, 10),
    summary: firstValue(row?.summary, row?.notes, raw?.summary, raw?.notes, raw?.kesimpulan),
    risk_category: firstValue(row?.risk_category, raw?.risk_category, raw?.risk_group),
  };
}

async function safeSelectByParticipant(
  supabase: any,
  table: string,
  participantId: number,
  limit = 200
) {
  const result = await supabase
    .from(table)
    .select("*")
    .eq("participant_id", participantId)
    .limit(limit);

  if (result.error) {
    return {
      ok: false,
      table,
      error: result.error.message,
      data: [],
    };
  }

  return {
    ok: true,
    table,
    error: null,
    data: result.data || [],
  };
}

export async function GET(request: NextRequest) {
  try {
    const participantId = asNumber(request.nextUrl.searchParams.get("participant_id"));

    if (!participantId) {
      return NextResponse.json(
        { ok: false, message: "participant_id wajib diisi." },
        { status: 400 }
      );
    }

    const supabase = adminClient();

    const foodResult = await safeSelectByParticipant(
      supabase,
      "wellness_food_logs",
      participantId,
      200
    );

    const activityResult = await safeSelectByParticipant(
      supabase,
      "wellness_activity_logs",
      participantId,
      250
    );

    const healthTalkResult = await safeSelectByParticipant(
      supabase,
      "wellness_healthtalk_logs",
      participantId,
      150
    );

    const checkupResult = await safeSelectByParticipant(
      supabase,
      "wellness_checkup_history",
      participantId,
      150
    );

    const integrationResult = await safeSelectByParticipant(
      supabase,
      "wellness_integrations",
      participantId,
      50
    );

    const nutritionLogs = (foodResult.data || [])
      .map(normalizeFood)
      .sort(sortNewest);

    const activityLogs = (activityResult.data || [])
      .map(normalizeActivity)
      .sort(sortNewest);

    const healthTalkLogs = (healthTalkResult.data || [])
      .map(normalizeHealthTalk)
      .sort(sortNewest);

    const clinicalHistory = (checkupResult.data || [])
      .map(normalizeCheckup)
      .sort(sortNewest);

    const integrations = (integrationResult.data || []).sort(sortNewest);

    const latestGoogleFit = activityLogs.find((row: any) =>
      clean(row.normalized_source).toLowerCase().includes("google")
    );

    const latestHealthConnect = activityLogs.find((row: any) =>
      clean(row.normalized_source).toLowerCase().includes("health")
    );

    const latestAnyActivity = activityLogs[0] || null;

    const googleIntegration = integrations.find((row: any) =>
      clean(row.provider || row.source || row.integration_type || row.type)
        .toLowerCase()
        .includes("google")
    );

    const healthConnectIntegration = integrations.find((row: any) =>
      clean(row.provider || row.source || row.integration_type || row.type)
        .toLowerCase()
        .includes("health")
    );

    const totals = activityLogs.reduce(
      (acc: any, row: any) => {
        acc.steps += asNumber(row.normalized_steps);
        acc.calories += asNumber(row.normalized_calories);
        acc.distance_km += asNumber(row.normalized_distance_km);
        acc.duration_minutes += asNumber(row.normalized_duration_minutes);
        return acc;
      },
      {
        steps: 0,
        calories: 0,
        distance_km: 0,
        duration_minutes: 0,
      }
    );

    return NextResponse.json({
      ok: true,
      participant_id: participantId,
      nutrition_logs: nutritionLogs,
      activity_logs: activityLogs,
      healthtalk_logs: healthTalkLogs,
      clinical_history: clinicalHistory,
      integrations,
      device_summary: {
        latest_any_activity: latestAnyActivity,
        latest_google_fit: latestGoogleFit || null,
        latest_health_connect: latestHealthConnect || null,
        google_integration: googleIntegration || null,
        health_connect_integration: healthConnectIntegration || null,
        total_activity_rows: activityLogs.length,
        totals,
      },
      diagnostics: {
        food: foodResult,
        activity: activityResult,
        healthTalk: healthTalkResult,
        checkup: checkupResult,
        integrations: integrationResult,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal mengambil direct history." },
      { status: 500 }
    );
  }
}

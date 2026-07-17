// WELLNESS_DASHBOARD_NAKES_ACTIVITY_LOG_V377_PORTAL_ME
// WELLNESS_PARTICIPANT_SINGLE_FITNESS_SOURCE_V79F

import { NextRequest, NextResponse } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { clearPortalCookie, getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import { filterActivityRowsByFitnessSource, loadParticipantControlMap } from "@/lib/wellness/participantControls";

export const runtime = "nodejs";

function clean(value: any) {
  return String(value ?? "").trim();
}

function pickNumber(...values: any[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const numeric = Number(String(value).replace(",", "."));
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function getActivityDate(row: any) {
  return String(row?.log_date || row?.started_at || row?.raw_payload?.start_date_local || row?.raw_payload?.start_date || row?.created_at || "").slice(0, 10);
}

function getActivityName(row: any) {
  return clean(row?.activity_name || row?.activity_type || row?.raw_payload?.sport_type || row?.raw_payload?.type || row?.raw_payload?.name || "Aktivitas");
}

function getActivityDuration(row: any) {
  const raw = row?.raw_payload || {};
  return pickNumber(row?.duration_minutes, row?.elapsed_minutes, raw?.duration_minutes, raw?.moving_time ? Number(raw.moving_time) / 60 : null, raw?.elapsed_time ? Number(raw.elapsed_time) / 60 : null);
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
  return 4;
}

function estimateCalories(row: any, participant: any) {
  const raw = row?.raw_payload || {};
  const direct = pickNumber(row?.calories, row?.activity_calories, row?.calories_burned, raw?.calories, raw?.activity_calories, raw?.calories_burned, raw?.kilocalories, raw?.active_kilocalories);
  if (direct !== null) return direct;
  const duration = getActivityDuration(row);
  const weight = pickNumber(participant?.current_weight_kg, participant?.initial_weight_kg, participant?.weight_kg, participant?.baseline_weight_kg, 70);
  if (duration === null || weight === null) return null;
  const met = pickNumber(row?.met, raw?.met) || defaultMet(getActivityName(row));
  return Math.round((met * 3.5 * weight / 200 * duration) * 10) / 10;
}

function getActivityDistance(row: any) {
  const raw = row?.raw_payload || {};
  return pickNumber(row?.distance_km, raw?.distance_km, raw?.distance ? Number(raw.distance) / 1000 : null);
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
      tanggal: date,
      activity_name: name,
      nama_activities: name,
      count: 0,
      jumlah: 0,
      duration_minutes: 0,
      calories: 0,
      distance_km: 0,
      sources: new Set<string>(),
    };
    current.count += 1;
    current.jumlah = current.count;
    current.duration_minutes += getActivityDuration(row) || 0;
    current.calories += estimateCalories(row, participant) || 0;
    current.distance_km += getActivityDistance(row) || 0;
    current.sources.add(String(row?.source || row?.raw_payload?.source || "manual"));
    map.set(key, current);
  }
  return [...map.values()]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.activity_name).localeCompare(String(b.activity_name)))
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
    }));
}

function mergeUniqueRows(...lists: any[][]) {
  const map = new Map<string, any>();
  for (const list of lists || []) {
    for (const row of list || []) {
      const key = row?.id ? `id:${row.id}` : JSON.stringify([row?.employee_code, row?.checkup_date, row?.history_type, row?.visit_label]);
      map.set(key, row);
    }
  }
  return [...map.values()];
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const participant = await getParticipantFromPortalSession(supabase, req);
    if (!participant) return fail("OTP/session peserta belum aktif.", 401);

    const { data: integrations } = await supabase
      .from("wellness_integrations")
      .select("provider,provider_user_id,scope,connected_at,last_sync_at,is_active")
      .eq("participant_id", participant.id);

    const { data: activities } = await supabase
      .from("wellness_activity_logs")
      .select("*")
      .eq("participant_id", participant.id)
      .order("log_date", { ascending: false })
      .limit(100);

    const { data: historyById } = await supabase
      .from("wellness_checkup_history")
      .select("*")
      .eq("participant_id", participant.id)
      .order("checkup_date", { ascending: false })
      .limit(50);

    let historyByCode: any[] = [];
    const code = clean(participant.code || participant.employee_code || participant.no_karyawan);
    if (code) {
      const { data } = await supabase
        .from("wellness_checkup_history")
        .select("*")
        .eq("employee_code", code)
        .order("checkup_date", { ascending: false })
        .limit(50);
      historyByCode = data || [];
    }

    const clinical_history = mergeUniqueRows(historyById || [], historyByCode || [])
      .sort((a, b) => String(b.checkup_date || b.created_at || "").localeCompare(String(a.checkup_date || a.created_at || "")));

    const controlMap = await loadParticipantControlMap(supabase, [participant.id]);
    const fitnessSettings = controlMap.get(Number(participant.id)) ||
      participant.wellness_control || {
        participant_id: Number(participant.id),
        session_enabled: true,
        fitness_enabled: false,
        fitness_source: "none",
        connected_providers: [],
        active_providers: [],
        has_multiple_active_providers: false,
        source_connected: false,
      };
    const selectedActivities = filterActivityRowsByFitnessSource(
      activities || [],
      controlMap,
    );
    const activity_summary = buildActivitySummary(selectedActivities, participant);

    return ok({
      participant: { ...participant, wellness_control: fitnessSettings },
      fitness_settings: fitnessSettings,
      integrations: integrations || [],
      activities: selectedActivities,
      activity_summary,
      clinical_history,
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat portal peserta.", 500);
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearPortalCookie(res);
  return res;
}

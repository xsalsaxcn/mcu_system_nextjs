import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { calculateBmi, interpretBmi, weightDelta } from "@/lib/wellness/bmi";
import { classifyWellnessRisk, complianceStatus } from "@/lib/wellness/riskRules";
import { getAllowedWellnessParticipants, latestByDate } from "@/app/api/wellness/_utils";

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

function latestDate(...values: any[]): string | null {
  const valid = values.filter(Boolean).map(String).sort();
  return valid.length ? valid[valid.length - 1] : null;
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
        },
        rows: [],
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const [weightRes, foodRes, activityRes, groupRes] = await Promise.all([
      supabase.from("wellness_weight_logs").select("*").in("participant_id", participantIds),
      supabase.from("wellness_food_logs").select("*").in("participant_id", participantIds),
      supabase.from("wellness_activity_logs").select("*").in("participant_id", participantIds),
      supabase.from("wellness_groups").select("*"),
    ]);

    if (weightRes.error) throw weightRes.error;
    if (foodRes.error) throw foodRes.error;
    if (activityRes.error) throw activityRes.error;

    const weightsByParticipant = groupByParticipant(weightRes.data || []);
    const foodsByParticipant = groupByParticipant(foodRes.data || []);
    const activitiesByParticipant = groupByParticipant(activityRes.data || []);
    const groupName = new Map((groupRes.data || []).map((g: any) => [Number(g.id), g.name || "-"]));

    const rows = participants.map((participant: any) => {
      const weightRows = weightsByParticipant.get(Number(participant.id)) || [];
      const foodRows = foodsByParticipant.get(Number(participant.id)) || [];
      const activityRows = activitiesByParticipant.get(Number(participant.id)) || [];
      const latestWeight = latestByDate(weightRows) || null;
      const latestFood = latestByDate(foodRows) || null;
      const latestActivity = latestByDate(activityRows) || null;
      const currentWeight = latestWeight?.weight_kg ?? participant.initial_weight_kg;
      const bmi = latestWeight?.bmi ?? calculateBmi(currentWeight, participant.height_cm);
      const delta = weightDelta(currentWeight, participant.initial_weight_kg);
      const hba1c = pickNumber(participant.hba1c, participant.initial_hba1c, participant.hba1c_initial, participant.baseline_hba1c);
      const glucose = pickNumber(participant.glucose, participant.gula_darah, participant.initial_glucose, participant.baseline_glucose);
      const sbp = pickNumber(participant.sbp, participant.systolic_bp, participant.initial_sbp, participant.baseline_sbp, participant.blood_pressure_systolic);
      const dbp = pickNumber(participant.dbp, participant.diastolic_bp, participant.initial_dbp, participant.baseline_dbp, participant.blood_pressure_diastolic);
      const waist = pickNumber(participant.waist_cm, participant.lingkar_perut, participant.initial_waist_cm, participant.baseline_waist_cm);
      const risk = classifyWellnessRisk({ hba1c, glucose, bmi, sbp, dbp });
      const lastUploadDate = latestDate(latestWeight?.log_date, latestFood?.log_date, latestActivity?.log_date);
      const compliance = complianceStatus(lastUploadDate);

      return {
        id: participant.id,
        participant_id: participant.id,
        name: participant.name,
        code: participant.code,
        gender: participant.gender,
        group_name: groupName.get(Number(participant.group_id)) || "-",
        height_cm: participant.height_cm,
        initial_weight_kg: participant.initial_weight_kg,
        target_weight_kg: participant.target_weight_kg,
        current_weight_kg: currentWeight ?? null,
        weight_delta_kg: delta,
        waist_cm: waist,
        hba1c,
        glucose,
        sbp,
        dbp,
        bmi,
        bmi_status: latestWeight?.bmi_status || interpretBmi(bmi),
        risk_level: risk.level,
        risk_label: risk.label,
        risk_group_name: risk.group,
        risk_flags: risk.flags,
        need_followup: risk.needFollowup || compliance === "Drop risk" || compliance === "Tidak aktif",
        compliance_status: compliance,
        latest_weight_date: latestWeight?.log_date || null,
        latest_food_date: latestFood?.log_date || null,
        latest_activity_date: latestActivity?.log_date || null,
        latest_upload_date: lastUploadDate,
        food_logs_count: foodRows.length,
        weight_logs_count: weightRows.length,
        activity_logs_count: activityRows.length,
        calories_today: sumCalories(foodRows.filter((row) => row.log_date === today)),
        activity_calories_today: sumCalories(activityRows.filter((row) => row.log_date === today)),
      };
    });

    const bmiValues = rows.map((row) => Number(row.bmi || 0)).filter((value) => value > 0);
    const compliantRows = rows.filter((row) => row.compliance_status === "Baik").length;

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
      },
      rows,
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat dashboard Wellness. Pastikan SQL wellness sudah dijalankan.", 500);
  }
}

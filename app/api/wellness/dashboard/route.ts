import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { calculateBmi, interpretBmi, weightDelta } from "@/lib/wellness/bmi";
import { classifyWellnessRisk, complianceStatus } from "@/lib/wellness/riskRules";
import { getAllowedWellnessParticipants, latestByDate } from "@/app/api/wellness/_utils";

// WELLNESS_SETTINGS_PARAMETER_V350_DASHBOARD

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
    const [weightRes, foodRes, activityRes, groupRes, miniMcuRows, companies, groupUnits] = await Promise.all([
      supabase.from("wellness_weight_logs").select("*").in("participant_id", participantIds),
      supabase.from("wellness_food_logs").select("*").in("participant_id", participantIds),
      supabase.from("wellness_activity_logs").select("*").in("participant_id", participantIds),
      supabase.from("wellness_groups").select("*"),
      safeSelect(supabase, "wellness_mini_mcu_logs", (query) => query.in("participant_id", participantIds)),
      safeSelect(supabase, "wellness_companies", (query) => query.order("name", { ascending: true })),
      safeSelect(supabase, "wellness_group_units", (query) => query.order("name", { ascending: true })),
    ]);

    if (weightRes.error) throw weightRes.error;
    if (foodRes.error) throw foodRes.error;
    if (activityRes.error) throw activityRes.error;

    const weightsByParticipant = groupByParticipant(weightRes.data || []);
    const foodsByParticipant = groupByParticipant(foodRes.data || []);
    const activitiesByParticipant = groupByParticipant(activityRes.data || []);
    const miniMcuByParticipant = groupByParticipant(miniMcuRows || []);
    const groupName = new Map((groupRes.data || []).map((g: any) => [Number(g.id), g.name || "-"]));
    const companyName = new Map((companies || []).map((company: any) => [Number(company.id), company.name || "-"]));
    const groupUnitName = new Map((groupUnits || []).map((unit: any) => [Number(unit.id), unit.name || "-"]));

    const rows = participants.map((participant: any) => {
      const weightRows = weightsByParticipant.get(Number(participant.id)) || [];
      const foodRows = foodsByParticipant.get(Number(participant.id)) || [];
      const activityRows = activitiesByParticipant.get(Number(participant.id)) || [];
      const miniMcuParticipantRows = miniMcuByParticipant.get(Number(participant.id)) || [];
      const latestWeight = latestByDate(weightRows) || null;
      const latestFood = latestByDate(foodRows) || null;
      const latestActivity = latestByDate(activityRows) || null;
      const latestMiniMcu = latestByDate(miniMcuParticipantRows, "exam_date") || null;
      const baselineWeight = participant.initial_weight_kg;
      const baselineBmi = pickNumber(participant.baseline_bmi, calculateBmi(participant.initial_weight_kg, participant.height_cm));
      const currentWeight = pickNumber(latestMiniMcu?.weight_kg, latestWeight?.weight_kg, participant.initial_weight_kg);
      const bmi = pickNumber(latestMiniMcu?.bmi, latestWeight?.bmi, calculateBmi(currentWeight, participant.height_cm), baselineBmi);
      const delta = weightDelta(currentWeight, baselineWeight);
      const hba1c = pickNumber(latestMiniMcu?.hba1c, participant.hba1c, participant.initial_hba1c, participant.hba1c_initial, participant.baseline_hba1c);
      const glucose = pickNumber(latestMiniMcu?.glucose, participant.glucose, participant.gula_darah, participant.initial_glucose, participant.baseline_glucose);
      const sbp = pickNumber(latestMiniMcu?.sbp, participant.sbp, participant.systolic_bp, participant.initial_sbp, participant.baseline_sbp, participant.blood_pressure_systolic);
      const dbp = pickNumber(latestMiniMcu?.dbp, participant.dbp, participant.diastolic_bp, participant.initial_dbp, participant.baseline_dbp, participant.blood_pressure_diastolic);
      const waist = pickNumber(latestMiniMcu?.waist_cm, participant.waist_cm, participant.lingkar_perut, participant.initial_waist_cm, participant.baseline_waist_cm);
      const risk = classifyWellnessRisk({ hba1c, glucose, bmi, sbp, dbp });
      const lastUploadDate = latestDate(latestWeight?.log_date, latestFood?.log_date, latestActivity?.log_date, latestMiniMcu?.exam_date);
      const compliance = complianceStatus(lastUploadDate);
      const baselineSbp = pickNumber(participant.baseline_sbp, participant.initial_sbp, participant.sbp);
      const baselineDbp = pickNumber(participant.baseline_dbp, participant.initial_dbp, participant.dbp);
      const baselineHba1c = pickNumber(participant.baseline_hba1c, participant.initial_hba1c, participant.hba1c_initial, participant.hba1c);
      const baselineGlucose = pickNumber(participant.baseline_glucose, participant.initial_glucose, participant.glucose, participant.gula_darah);
      const baselineWaist = pickNumber(participant.baseline_waist_cm, participant.initial_waist_cm, participant.waist_cm, participant.lingkar_perut);

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
        latest_upload_date: lastUploadDate,
        food_logs_count: foodRows.length,
        weight_logs_count: weightRows.length,
        activity_logs_count: activityRows.length,
        mini_mcu_logs_count: miniMcuParticipantRows.length,
        calories_today: sumCalories(foodRows.filter((row) => row.log_date === today)),
        activity_calories_today: sumCalories(activityRows.filter((row) => row.log_date === today)),
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
      },
      rows,
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat dashboard Wellness. Pastikan SQL wellness sudah dijalankan.", 500);
  }
}

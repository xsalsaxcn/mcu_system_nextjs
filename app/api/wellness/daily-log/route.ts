import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { matchCalories } from "@/lib/wellness/calorieMatcher";
import { calculateBmi, interpretBmi, toNumber } from "@/lib/wellness/bmi";
import { ensureParticipantAccess, getAllowedWellnessParticipants, todayIso } from "@/app/api/wellness/_utils";

function activityCalories(weightKg: number | null, durationMinutes: number | null, met: number | null) {
  if (!weightKg || !durationMinutes || !met) return null;
  return Math.round((met * 3.5 * weightKg / 200 * durationMinutes) * 10) / 10;
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const participantId = Number(body.participant_id || 0);
  const logDate = String(body.log_date || todayIso()).slice(0, 10);

  try {
    const supabase = getSupabaseAdmin();
    const allowedParticipants = await getAllowedWellnessParticipants(supabase, user);
    const participant = ensureParticipantAccess(user, participantId || Number(allowedParticipants[0]?.id || 0), allowedParticipants);
    if (!participant) return fail("Peserta tidak ditemukan atau akses ditolak.", 404);

    const [foodRefRes, activityRefRes] = await Promise.all([
      supabase.from("wellness_food_calories").select("*").eq("is_active", 1),
      supabase.from("wellness_activity_calories").select("*"),
    ]);
    if (foodRefRes.error) throw foodRefRes.error;
    if (activityRefRes.error) throw activityRefRes.error;

    const saved: Record<string, any> = {};

    const mealText = String(body.meal_text || "").trim();
    if (mealText) {
      const matched = matchCalories(mealText, foodRefRes.data || []);
      const { data, error } = await supabase.from("wellness_food_logs").insert({
        participant_id: participant.id,
        log_date: logDate,
        meal_time: String(body.meal_time || "").trim() || null,
        meal_text: mealText,
        detected_foods: matched.detectedFoods.join(", "),
        total_calories: matched.totalCalories || null,
        photo_url: String(body.photo_url || "").trim() || null,
        created_by: user.id,
      }).select("*").single();
      if (error) throw error;
      saved.food_log = data;
      saved.calorie_result = matched;
    }

    const weight = toNumber(body.weight_kg);
    const waist = toNumber(body.waist_cm);
    if (weight !== null) {
      const bmi = calculateBmi(weight, participant.height_cm || body.height_cm);
      const { data, error } = await supabase.from("wellness_weight_logs").insert({
        participant_id: participant.id,
        log_date: logDate,
        weight_kg: weight,
        waist_cm: waist,
        bmi,
        bmi_status: interpretBmi(bmi),
        notes: String(body.weight_notes || "").trim() || null,
        created_by: user.id,
      }).select("*").single();
      if (error) throw error;
      saved.weight_log = data;
    }

    const activityName = String(body.activity_type || "").trim();
    const duration = toNumber(body.duration_minutes);
    if (activityName || duration !== null) {
      const refs = activityRefRes.data || [];
      const activityRef = refs.find((item: any) => String(item.activity_name || "").toLowerCase() === activityName.toLowerCase()) || null;
      const met = toNumber(activityRef?.met) || toNumber(body.met);
      const distanceKm = toNumber(body.distance_km);
      const calories = toNumber(body.activity_calories) ?? activityCalories(weight ?? toNumber(participant.initial_weight_kg), duration, met);

      const { data, error } = await supabase.from("wellness_activity_logs").insert({
        participant_id: participant.id,
        log_date: logDate,
        source: "manual",
        activity_type: activityName || activityRef?.activity_name || "Aktivitas manual",
        duration_minutes: duration,
        distance_km: distanceKm,
        calories,
        notes: String(body.activity_notes || "").trim() || null,
        created_by: user.id,
      }).select("*").single();
      if (error) throw error;
      saved.activity_log = data;
    }

    return ok({ participant, saved });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan log Wellness.", 500);
  }
}

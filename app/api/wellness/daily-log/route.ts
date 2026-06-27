import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { matchCalories } from "@/lib/wellness/calorieMatcher";
import { calculateBmi, interpretBmi, toNumber } from "@/lib/wellness/bmi";
import { ensureParticipantAccess, getAllowedWellnessParticipants, todayIso } from "@/app/api/wellness/_utils";

// WELLNESS_DAILY_INPUT_PRO_V360_API
// WELLNESS_GOOGLE_SHEET_RESPONSE_V362_API
// WELLNESS_GOOGLE_SHEET_FORM_RESPONSE_V363_API
// WELLNESS_INLINE_IMAGE_SHEET_V366_API

function cleanText(value: any) {
  return String(value ?? "").trim();
}

function activityCalories(weightKg: number | null, durationMinutes: number | null, met: number | null) {
  if (!weightKg || !durationMinutes || !met) return null;
  return Math.round((met * 3.5 * weightKg / 200 * durationMinutes) * 10) / 10;
}

async function safeInsertSingle(supabase: any, table: string, payload: Record<string, any>) {
  try {
    const { data, error } = await supabase.from(table).insert(payload).select("*").single();
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
}

async function addEvidence(supabase: any, payload: Record<string, any>, warnings: string[]) {
  const { data, error } = await safeInsertSingle(supabase, "wellness_daily_evidence", payload);
  if (error) warnings.push(`Evidence belum tersimpan (${error.message || "tabel v360 belum tersedia"}).`);
  return data;
}

async function addPoint(supabase: any, payload: Record<string, any>, warnings: string[]) {
  const { data, error } = await safeInsertSingle(supabase, "wellness_point_logs", payload);
  if (error) warnings.push(`Point belum tersimpan (${error.message || "tabel v360 belum tersedia"}).`);
  return data;
}

async function recordPoints({ supabase, participantId, companyId, logDate, createdBy, sourceType, sourceId, points, pointKey, description, warnings }: any) {
  if (!points || points <= 0) return null;
  return addPoint(supabase, {
    participant_id: participantId,
    company_id: companyId || null,
    log_date: logDate,
    point_key: pointKey,
    source_type: sourceType,
    source_id: sourceId || null,
    points,
    description,
    status: "saved",
    created_by: createdBy,
  }, warnings);
}


function publicParticipantName(participant: any) {
  return cleanText(participant?.participant_display_name) || cleanText(participant?.name) || `Peserta #${participant?.id || ""}`;
}

function formatSubmissionDate(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
  } catch {
    return date.toISOString();
  }
}

function getClientIp(req: NextRequest) {
  return cleanText(req.headers.get("x-forwarded-for")?.split(",")?.[0])
    || cleanText(req.headers.get("x-real-ip"))
    || cleanText(req.headers.get("cf-connecting-ip"))
    || "";
}

function joinNonEmpty(parts: any[], separator = " - ") {
  return parts.map(cleanText).filter(Boolean).join(separator);
}

function participantChoiceLabel(participant: any) {
  const scope = joinNonEmpty([
    participant?.company_name,
    participant?.kelompok_name,
    participant?.group_unit_name,
  ], " > ");
  const name = publicParticipantName(participant);
  const code = cleanText(participant?.code);
  const risk = cleanText(participant?.risk_cluster || participant?.baseline_risk_group);
  return joinNonEmpty([
    scope || risk || "Wellness",
    name,
    code ? `KODE ${code}` : "",
  ], " - ");
}

function yesNo(value: boolean) {
  return value ? "Ya" : "Tidak";
}

function buildGoogleSheetResponse({ body, participant, saved, pointsTotal, user, logDate, logType, req }: any) {
  // WELLNESS_GOOGLE_SHEET_FORM_RESPONSE_V363_MAPPING
  const food = saved?.food_log || null;
  const weight = saved?.weight_log || null;
  const activity = saved?.activity_log || null;
  const healthtalk = saved?.healthtalk_log || null;
  const evidence = saved?.evidence_logs || [];
  const mealText = cleanText(body?.meal_text || food?.meal_text);
  const activityDone = !!activity || !!cleanText(body?.activity_type) || !!cleanText(body?.duration_minutes);
  const activityAchievement = joinNonEmpty([
    cleanText(body?.activity_notes || activity?.notes),
    cleanText(body?.distance_km || activity?.distance_km) ? `${cleanText(body?.distance_km || activity?.distance_km)} km` : "",
    cleanText(body?.activity_evidence_url) ? `Bukti: ${cleanText(body?.activity_evidence_url)}` : "",
  ], " | ");
  const participantName = publicParticipantName(participant);
  const initialWeight = participant?.initial_weight_kg || participant?.baseline_weight_kg || body?.initial_weight_kg || "";
  const currentWeight = weight?.weight_kg || body?.weight_kg || "";

  return {
    "Submission Date": formatSubmissionDate(new Date()),
    "Pilih Nama Anda": participantChoiceLabel(participant),
    "Nama Peserta": participantName ? String(participantName).toUpperCase() : "",
    "Waktu Makan": cleanText(body?.meal_time || food?.meal_time),
    "Add Options": mealText,
    "Upload Foto Makanan": cleanText(body?.photo_url || food?.photo_url),
    "Melakukan Workout/Aktifitas Ringan?": yesNo(activityDone),
    "Jenis Workout/Aktifitas": cleanText(body?.activity_type || activity?.activity_type),
    "Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)": activityAchievement,
    "Submission IP": getClientIp(req),
    "Berapa Menit anda melakukan nya ?": activity?.duration_minutes || body?.duration_minutes || "",
    "Berat badan Awal": initialWeight,
    "BB anda per hari ini (diisi sekali saja perminggu)": currentWeight,
    "Helper column BB jangan diubah": currentWeight ? "FIRST" : "",
    "BB Monitoring terbaru": currentWeight,
    "Lingkar Perut (cm)": weight?.waist_cm || body?.waist_cm || "",
    "BMI": weight?.bmi || "",
    "Catatan Nutrisi": cleanText(body?.food_notes),
    "Kalori Makanan": food?.total_calories || saved?.calorie_result?.totalCalories || "",
    "Detected Foods": cleanText(food?.detected_foods || saved?.calorie_result?.detectedFoods?.join(", ")),
    "Kalori Aktivitas": activity?.calories || body?.activity_calories || "",
    "Bukti Aktivitas": cleanText(body?.activity_evidence_url),
    "Healthtalk/Seminar": cleanText(body?.healthtalk_title || healthtalk?.title),
    "Jenis Healthtalk": cleanText(body?.healthtalk_type || healthtalk?.attendance_type),
    "Tanggal Healthtalk": cleanText(body?.healthtalk_date || healthtalk?.event_date),
    "Bukti Healthtalk": cleanText(body?.healthtalk_evidence_url || healthtalk?.evidence_url),
    "Total Point": pointsTotal || 0,
    "Company": cleanText(participant?.company_name),
    "Kelompok": cleanText(participant?.kelompok_name || participant?.old_group_name),
    "Group Upload": cleanText(participant?.group_unit_name),
    "Risk Cluster": cleanText(participant?.risk_cluster || participant?.baseline_risk_group),
    "KODE": cleanText(participant?.code),
    "Participant ID": participant?.id || "",
    "Log Date": logDate,
    "Log Type": logType,
    "Evidence Count": Array.isArray(evidence) ? evidence.length : 0,
    "Created By": cleanText(user?.id),
    "Preview Foto Makanan": cleanText(body?.photo_url || food?.photo_url),
    "Preview Bukti Aktivitas": cleanText(body?.activity_evidence_url),
    "Preview Bukti Healthtalk": cleanText(body?.healthtalk_evidence_url || healthtalk?.evidence_url),
    "Marker": "WELLNESS_INLINE_IMAGE_SHEET_V366",
  };
}

async function appendGoogleSheetResponse(row: Record<string, any>, warnings: string[]) {
  const webhookUrl = cleanText(process.env.WELLNESS_GOOGLE_SHEET_WEBHOOK_URL);
  if (!webhookUrl) {
    warnings.push("Google Sheet belum disinkronkan: env WELLNESS_GOOGLE_SHEET_WEBHOOK_URL belum diisi.");
    return { synced: false, skipped: true };
  }
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheet: process.env.WELLNESS_GOOGLE_SHEET_TAB_NAME || "Form Responses",
        secret: process.env.WELLNESS_GOOGLE_SHEET_WEBHOOK_SECRET || "",
        row,
      }),
      cache: "no-store",
    });
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      warnings.push(`Google Sheet belum tersinkron (${response.status}: ${text.slice(0, 160) || "no response"}).`);
      return { synced: false, status: response.status, response: text };
    }
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    return { synced: true, status: response.status, response: json || text };
  } catch (error: any) {
    warnings.push(`Google Sheet belum tersinkron (${error?.message || "network error"}).`);
    return { synced: false, error: error?.message || String(error) };
  }
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const participantId = Number(body.participant_id || 0);
  const logDate = cleanText(body.log_date || todayIso()).slice(0, 10);
  const logType = cleanText(body.log_type || "daily");
  const warnings: string[] = [];

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
    const pointLogs: any[] = [];
    const evidenceLogs: any[] = [];
    let pointsTotal = 0;
    const companyId = Number(participant.wellness_company_id || body.company_id || 0) || null;

    const mealText = cleanText(body.meal_text);
    if (mealText) {
      const matched = matchCalories(mealText, foodRefRes.data || []);
      const { data, error } = await supabase.from("wellness_food_logs").insert({
        participant_id: participant.id,
        log_date: logDate,
        meal_time: cleanText(body.meal_time) || null,
        meal_text: mealText,
        detected_foods: matched.detectedFoods.join(", "),
        total_calories: matched.totalCalories || null,
        photo_url: cleanText(body.photo_url) || null,
        created_by: user.id,
      }).select("*").single();
      if (error) throw error;
      saved.food_log = data;
      saved.calorie_result = matched;

      const nutritionPoints = 5;
      pointsTotal += nutritionPoints;
      const point = await recordPoints({
        supabase,
        participantId: participant.id,
        companyId,
        logDate,
        createdBy: user.id,
        sourceType: "food_log",
        sourceId: data.id,
        points: nutritionPoints,
        pointKey: "nutrition_log",
        description: `Input nutrisi ${cleanText(body.meal_time) || "harian"}`,
        warnings,
      });
      if (point) pointLogs.push(point);

      const photoUrl = cleanText(body.photo_url);
      if (photoUrl) {
        const evidence = await addEvidence(supabase, {
          participant_id: participant.id,
          company_id: companyId,
          log_date: logDate,
          evidence_type: "food_photo",
          source_type: "food_log",
          source_id: data.id,
          title: `Foto makanan ${cleanText(body.meal_time) || ""}`.trim(),
          evidence_url: photoUrl,
          notes: cleanText(body.food_notes) || null,
          status: "saved",
          created_by: user.id,
        }, warnings);
        if (evidence) evidenceLogs.push(evidence);
      }
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
        notes: cleanText(body.weight_notes) || null,
        created_by: user.id,
      }).select("*").single();
      if (error) throw error;
      saved.weight_log = data;

      const weightPoints = 5;
      pointsTotal += weightPoints;
      const point = await recordPoints({
        supabase,
        participantId: participant.id,
        companyId,
        logDate,
        createdBy: user.id,
        sourceType: "weight_log",
        sourceId: data.id,
        points: weightPoints,
        pointKey: "weight_log",
        description: "Input BB / lingkar perut",
        warnings,
      });
      if (point) pointLogs.push(point);
    }

    const activityName = cleanText(body.activity_type);
    const duration = toNumber(body.duration_minutes);
    if (activityName || duration !== null) {
      const refs = activityRefRes.data || [];
      const activityRef = refs.find((item: any) => cleanText(item.activity_name).toLowerCase() === activityName.toLowerCase()) || null;
      const met = toNumber(activityRef?.met) || toNumber(body.met);
      const distanceKm = toNumber(body.distance_km);
      const calories = toNumber(body.activity_calories) ?? activityCalories(weight ?? toNumber(participant.initial_weight_kg), duration, met);
      const activityEvidenceUrl = cleanText(body.activity_evidence_url);

      const { data, error } = await supabase.from("wellness_activity_logs").insert({
        participant_id: participant.id,
        log_date: logDate,
        source: "manual",
        activity_type: activityName || activityRef?.activity_name || "Aktivitas manual",
        duration_minutes: duration,
        distance_km: distanceKm,
        calories,
        notes: cleanText(body.activity_notes) || null,
        raw_payload: activityEvidenceUrl ? { evidence_url: activityEvidenceUrl, log_type: logType } : { log_type: logType },
        created_by: user.id,
      }).select("*").single();
      if (error) throw error;
      saved.activity_log = data;

      const activityPoints = duration && duration >= 30 ? 10 : 5;
      pointsTotal += activityPoints;
      const point = await recordPoints({
        supabase,
        participantId: participant.id,
        companyId,
        logDate,
        createdBy: user.id,
        sourceType: "activity_log",
        sourceId: data.id,
        points: activityPoints,
        pointKey: duration && duration >= 30 ? "activity_30_min" : "activity_log",
        description: duration && duration >= 30 ? "Aktivitas minimal 30 menit" : "Input aktivitas",
        warnings,
      });
      if (point) pointLogs.push(point);

      if (activityEvidenceUrl) {
        const evidence = await addEvidence(supabase, {
          participant_id: participant.id,
          company_id: companyId,
          log_date: logDate,
          evidence_type: "activity_proof",
          source_type: "activity_log",
          source_id: data.id,
          title: `Bukti aktivitas ${activityName || "manual"}`,
          evidence_url: activityEvidenceUrl,
          notes: cleanText(body.activity_notes) || null,
          status: "saved",
          created_by: user.id,
        }, warnings);
        if (evidence) evidenceLogs.push(evidence);

        const proofPoints = 5;
        pointsTotal += proofPoints;
        const proofPoint = await recordPoints({
          supabase,
          participantId: participant.id,
          companyId,
          logDate,
          createdBy: user.id,
          sourceType: "activity_evidence",
          sourceId: evidence?.id || data.id,
          points: proofPoints,
          pointKey: "activity_evidence",
          description: "Upload/link bukti aktivitas",
          warnings,
        });
        if (proofPoint) pointLogs.push(proofPoint);
      }
    }

    const healthtalkTitle = cleanText(body.healthtalk_title);
    if (healthtalkTitle) {
      const attendanceType = cleanText(body.healthtalk_type || "Online");
      const healthtalkDate = cleanText(body.healthtalk_date || logDate).slice(0, 10);
      const evidenceUrl = cleanText(body.healthtalk_evidence_url);
      if (!evidenceUrl) return fail("Lampirkan link gambar bukti healthtalk terlebih dahulu.", 400);
      const { data, error } = await safeInsertSingle(supabase, "wellness_healthtalk_logs", {
        participant_id: participant.id,
        company_id: companyId,
        event_date: healthtalkDate,
        title: healthtalkTitle,
        attendance_type: attendanceType,
        evidence_url: evidenceUrl || null,
        notes: cleanText(body.healthtalk_notes) || null,
        status: "saved",
        created_by: user.id,
      });
      if (error) {
        warnings.push(`Healthtalk belum tersimpan (${error.message || "tabel v360 belum tersedia"}).`);
      } else {
        saved.healthtalk_log = data;
        const healthtalkPoints = attendanceType.toLowerCase() === "offline" ? 15 : 10;
        pointsTotal += healthtalkPoints;
        const point = await recordPoints({
          supabase,
          participantId: participant.id,
          companyId,
          logDate: healthtalkDate,
          createdBy: user.id,
          sourceType: "healthtalk_log",
          sourceId: data.id,
          points: healthtalkPoints,
          pointKey: attendanceType.toLowerCase() === "offline" ? "healthtalk_offline" : "healthtalk_online",
          description: `Mengikuti healthtalk ${attendanceType}`,
          warnings,
        });
        if (point) pointLogs.push(point);

        if (evidenceUrl) {
          const evidence = await addEvidence(supabase, {
            participant_id: participant.id,
            company_id: companyId,
            log_date: healthtalkDate,
            evidence_type: "healthtalk_proof",
            source_type: "healthtalk_log",
            source_id: data.id,
            title: `Bukti healthtalk: ${healthtalkTitle}`,
            evidence_url: evidenceUrl,
            notes: cleanText(body.healthtalk_notes) || null,
            status: "saved",
            created_by: user.id,
          }, warnings);
          if (evidence) evidenceLogs.push(evidence);
        }
      }
    }

    if (!Object.keys(saved).length) return fail("Tidak ada data yang disimpan. Isi minimal salah satu: nutrisi, BB, aktivitas, atau healthtalk.", 400);

    saved.point_logs = pointLogs;
    saved.evidence_logs = evidenceLogs;

    const googleSheetRow = buildGoogleSheetResponse({ body, participant, saved, pointsTotal, user, logDate, logType, req });
    const googleSheet = await appendGoogleSheetResponse(googleSheetRow, warnings);
    saved.google_sheet_row = googleSheetRow;

    return ok({ participant, saved, points_total: pointsTotal, google_sheet: googleSheet, warnings });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan log Wellness.", 500);
  }
}

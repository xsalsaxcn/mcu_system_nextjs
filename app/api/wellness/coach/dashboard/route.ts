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

function clean(value: any) {
  return String(value || "").trim();
}

function asNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function todayJakarta() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((x) => x.type === "year")?.value || "";
  const m = parts.find((x) => x.type === "month")?.value || "";
  const d = parts.find((x) => x.type === "day")?.value || "";

  return y && m && d ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10);
}

function getParticipantId(row: any) {
  return asNumber(row?.id || row?.participant_id || row?.wellness_participant_id);
}

function participantGroupIds(row: any) {
  return [
    row?.wellness_group_unit_id,
    row?.group_unit_id,
    row?.group_id,
    row?.wellness_group_id,
  ]
    .map((x) => clean(x))
    .filter(Boolean);
}

function participantGroupNames(row: any) {
  return [
    row?.group_name,
    row?.group_unit_name,
    row?.risk_group,
    row?.risk_category,
    row?.category,
    row?.group,
  ]
    .map((x) => clean(x).toLowerCase())
    .filter(Boolean);
}

function participantName(row: any) {
  return clean(row?.name || row?.employee_name || row?.nama || row?.full_name || "-");
}

function participantCode(row: any) {
  return clean(row?.code || row?.employee_code || row?.kode_karyawan || row?.nik || "-");
}

function participantRisk(row: any) {
  return clean(row?.risk_group || row?.risk_category || row?.group_name || row?.category || "-");
}

function canAccessParticipant(row: any, assignments: any[]) {
  if (!assignments.length) return false;

  const allowedIds = new Set(
    assignments
      .map((item) => clean(item.wellness_group_unit_id))
      .filter(Boolean)
  );

  const allowedNames = new Set(
    assignments
      .map((item) => clean(item.group_name).toLowerCase())
      .filter(Boolean)
  );

  const pIds = participantGroupIds(row);
  const pNames = participantGroupNames(row);

  if (pIds.some((id) => allowedIds.has(id))) return true;
  if (pNames.some((name) => allowedNames.has(name))) return true;

  return false;
}

function activityDate(row: any) {
  return clean(row?.log_date || row?.date || row?.created_at).slice(0, 10);
}

function activitySteps(row: any) {
  return asNumber(
    row?.steps ||
      row?.total_steps ||
      row?.raw_payload?.health_connect_steps ||
      row?.raw_payload?.google_fit_steps
  );
}

function activityCalories(row: any) {
  return asNumber(
    row?.calories ||
      row?.total_calories ||
      row?.raw_payload?.health_connect_calories ||
      row?.raw_payload?.google_fit_calories_expended
  );
}

function latestClinicalFor(participantId: number, clinicalRows: any[]) {
  const rows = clinicalRows
    .filter((row) => asNumber(row?.participant_id || row?.wellness_participant_id) === participantId)
    .sort((a, b) => clean(b?.created_at || b?.exam_date).localeCompare(clean(a?.created_at || a?.exam_date)));

  return rows[0] || null;
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

  if (error || !data || !data.coach || data.coach.is_active === false) {
    return null;
  }

  return data.coach;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = adminClient();
    const coach = await getCoach(request, supabase);

    if (!coach) {
      return NextResponse.json(
        { ok: false, message: "Session coach belum aktif." },
        { status: 401 }
      );
    }

    const { data: assignments, error: assignmentError } = await supabase
      .from("wellness_coach_group_assignments")
      .select("*")
      .eq("coach_user_id", coach.id)
      .eq("is_active", true)
      .order("id", { ascending: true });

    if (assignmentError) {
      return NextResponse.json(
        { ok: false, message: assignmentError.message },
        { status: 500 }
      );
    }

    const { data: allParticipants, error: participantError } = await supabase
      .from("wellness_participants")
      .select("*")
      .limit(2000);

    if (participantError) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Table wellness_participants belum terbaca. Cek nama table peserta wellness di Supabase.",
          detail: participantError.message,
        },
        { status: 500 }
      );
    }

    const participants = (allParticipants || []).filter((row: any) =>
      canAccessParticipant(row, assignments || [])
    );

    const participantIds = participants.map(getParticipantId).filter(Boolean);
    const today = todayJakarta();

    let activityRows: any[] = [];

    if (participantIds.length > 0) {
      const { data } = await supabase
        .from("wellness_activity_logs")
        .select("*")
        .in("participant_id", participantIds)
        .gte("log_date", today)
        .limit(5000);

      activityRows = data || [];
    }

    let clinicalRows: any[] = [];

    if (participantIds.length > 0) {
      const result = await supabase
        .from("wellness_clinical_history")
        .select("*")
        .in("participant_id", participantIds)
        .limit(5000);

      if (!result.error) clinicalRows = result.data || [];
    }

    let noteRows: any[] = [];

    if (participantIds.length > 0) {
      const { data } = await supabase
        .from("wellness_coach_notes")
        .select("*")
        .in("participant_id", participantIds)
        .order("created_at", { ascending: false })
        .limit(1000);

      noteRows = data || [];
    }

    const participantCards = participants.map((row: any) => {
      const id = getParticipantId(row);

      const acts = activityRows.filter(
        (item) => asNumber(item.participant_id) === id && activityDate(item) === today
      );

      const steps = acts.reduce((sum, item) => sum + activitySteps(item), 0);
      const calories = acts.reduce((sum, item) => sum + activityCalories(item), 0);
      const clinical = latestClinicalFor(id, clinicalRows);
      const latestNote = noteRows.find((note) => asNumber(note.participant_id) === id) || null;

      const status =
        steps > 0
          ? "Active today"
          : latestNote?.follow_up_status === "Need Medical Review"
            ? "Need Medical Review"
            : "Need follow up";

      return {
        id,
        name: participantName(row),
        code: participantCode(row),
        group_name:
          clean(row?.group_name || row?.group_unit_name || row?.risk_group || row?.category) ||
          "-",
        risk: participantRisk(row),
        raw: row,
        today: {
          steps,
          calories,
          activity_count: acts.length,
        },
        clinical,
        latest_note: latestNote,
        status,
      };
    });

    const activeToday = participantCards.filter((p) => p.today.steps > 0).length;
    const needFollowUp = participantCards.filter((p) => p.status !== "Active today").length;
    const needMedicalReview = participantCards.filter(
      (p) => p.status === "Need Medical Review"
    ).length;

    const groups = (assignments || []).map((item: any) => ({
      id: item.id,
      wellness_group_unit_id: item.wellness_group_unit_id,
      group_name: item.group_name || `Group ${item.wellness_group_unit_id}`,
    }));

    return NextResponse.json({
      ok: true,
      coach: {
        id: coach.id,
        name: coach.name,
        email: coach.email,
      },
      groups,
      summary: {
        total_participants: participantCards.length,
        active_today: activeToday,
        need_follow_up: needFollowUp,
        need_medical_review: needMedicalReview,
      },
      participants: participantCards,
      notes: noteRows,
      today,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal memuat dashboard coach." },
      { status: 500 }
    );
  }
}

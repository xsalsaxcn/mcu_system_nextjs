// WELLNESS_COACH_ACTIVITY_TARGET_CALCULATOR_V126M39
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildCoachGroupUnitMap,
  canCoachAccessParticipant,
} from "@/lib/wellness/coachGroupAccess";
import {
  filterActivityRowsByFitnessSource,
  loadParticipantControlMap,
} from "@/lib/wellness/participantControls";
import { filterOperationalRowsForProgram } from "@/lib/wellness/programWindow";
import { buildCoachActivityTargetRecommendation } from "@/lib/wellness/coachTargetCalculator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function asNumber(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function participantCode(row: any) {
  return clean(
    row?.code ||
      row?.employee_code ||
      row?.participant_code ||
      row?.kode_karyawan ||
      row?.nik ||
      row?.employee_id,
  );
}

function participantName(row: any) {
  return clean(row?.name || row?.full_name || row?.employee_name || row?.nama) || "Peserta";
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

export async function GET(request: NextRequest) {
  try {
    const supabase = adminClient();
    const coach = await getCoach(request, supabase);
    if (!coach) {
      return NextResponse.json(
        { ok: false, message: "Session coach belum aktif." },
        { status: 401 },
      );
    }

    const participantId = asNumber(request.nextUrl.searchParams.get("participant_id"));
    const requestedCode = clean(request.nextUrl.searchParams.get("participant_code"));
    const periodDays = Math.min(
      30,
      Math.max(7, asNumber(request.nextUrl.searchParams.get("days")) || 14),
    );
    if (!participantId) {
      return NextResponse.json(
        { ok: false, message: "participant_id wajib diisi." },
        { status: 400 },
      );
    }

    const [assignmentResult, groupUnitResult, participantResult] = await Promise.all([
      supabase
        .from("wellness_coach_group_assignments")
        .select("*")
        .eq("coach_user_id", asNumber(coach.id))
        .eq("is_active", true),
      supabase.from("wellness_group_units").select("*").limit(5000),
      supabase.from("wellness_participants").select("*").eq("id", participantId).maybeSingle(),
    ]);

    if (assignmentResult.error) throw assignmentResult.error;
    if (groupUnitResult.error) throw groupUnitResult.error;
    if (participantResult.error || !participantResult.data) {
      return NextResponse.json(
        { ok: false, message: "Peserta tidak ditemukan." },
        { status: 404 },
      );
    }

    const participant = participantResult.data;
    const groupUnitMap = buildCoachGroupUnitMap(groupUnitResult.data || []);
    if (
      !canCoachAccessParticipant(
        participant,
        assignmentResult.data || [],
        groupUnitMap,
      )
    ) {
      return NextResponse.json(
        { ok: false, message: "Peserta tidak termasuk assignment coach." },
        { status: 403 },
      );
    }

    const actualCode = participantCode(participant);
    if (requestedCode && actualCode && requestedCode !== actualCode) {
      return NextResponse.json(
        {
          ok: false,
          message: `Identitas peserta berubah. Participant ID ${participantId} terhubung ke kode ${actualCode}, bukan ${requestedCode}.`,
        },
        { status: 409 },
      );
    }

    const activityResult = await supabase
      .from("wellness_activity_logs")
      .select("*")
      .eq("participant_id", participantId)
      .order("log_date", { ascending: true })
      .limit(3000);
    if (activityResult.error) throw activityResult.error;

    const controlMap = await loadParticipantControlMap(supabase, [participantId]);
    const activityRows = filterOperationalRowsForProgram(
      participant,
      filterActivityRowsByFitnessSource(activityResult.data || [], controlMap),
      "",
      "",
      ["log_date", "started_at", "created_at"],
    );

    const calculation = buildCoachActivityTargetRecommendation(activityRows, {
      periodDays,
    });

    return NextResponse.json({
      ok: true,
      mode: "read_only_recommendation",
      participant: {
        id: participantId,
        code: actualCode,
        name: participantName(participant),
      },
      calculation,
      note:
        "Rekomendasi belum mengubah target. Kalori total Google Fit tidak digunakan; Coach tetap harus menekan Terapkan ke Form dan Simpan Target Peserta.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal menghitung rekomendasi target." },
      { status: 500 },
    );
  }
}

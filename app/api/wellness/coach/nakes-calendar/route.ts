// WELLNESS_COACH_NAKES_EXAM_CALENDAR_V126M57_3
// Read-only examination calendar for Coach Monitoring NAKES.
// Data mirrors wellness_checkup_history, but participant rows are fail-closed
// through canonical Coach assignments before any result is returned.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  buildCoachGroupUnitMap,
  canCoachAccessParticipant,
  canonicalParticipantGroupName,
  canonicalParticipantGroupUnit,
  canonicalParticipantKelompokUnit,
  dedupeCoachParticipants,
  matchingCoachAssignment,
  participantScopeIds,
} from "@/lib/wellness/coachGroupAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function active(value: any) {
  return ![false, 0, "0", "false", "inactive", "nonaktif"].includes(
    typeof value === "string" ? value.toLowerCase() : value,
  );
}

function validHistory(row: any) {
  const status = clean(row?.status).toLowerCase();
  return (
    numberValue(row?.participant_id) > 0 &&
    Boolean(clean(row?.checkup_date || row?.created_at).slice(0, 10)) &&
    active(row?.is_active) &&
    !["cancelled", "canceled", "deleted", "void", "batal"].includes(status)
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

async function safeRows(query: any) {
  try {
    const result = await query;
    if (result?.error) return [];
    return result?.data || [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const coach = await getCoach(request, supabase);
    if (!coach) {
      return NextResponse.json(
        { ok: false, message: "Session coach belum aktif." },
        { status: 401 },
      );
    }

    const [assignmentResult, groupUnitResult, participantResult, companyRows] =
      await Promise.all([
        supabase
          .from("wellness_coach_group_assignments")
          .select("*")
          .eq("coach_user_id", numberValue(coach.id))
          .eq("is_active", true)
          .order("id", { ascending: true }),
        supabase.from("wellness_group_units").select("*").limit(5000),
        supabase.from("wellness_participants").select("*").limit(2000),
        safeRows(
          supabase
            .from("wellness_companies")
            .select("id,name,code,is_active")
            .limit(2000),
        ),
      ]);

    if (assignmentResult.error) throw assignmentResult.error;
    if (groupUnitResult.error) throw groupUnitResult.error;
    if (participantResult.error) throw participantResult.error;

    const assignments = assignmentResult.data || [];
    const groupUnitMap = buildCoachGroupUnitMap(groupUnitResult.data || []);
    const participants = dedupeCoachParticipants(participantResult.data || []).filter(
      (row: any) => canCoachAccessParticipant(row, assignments, groupUnitMap),
    );

    const participantIds = new Set(
      participants.map((row: any) => numberValue(row?.id)).filter((id) => id > 0),
    );

    const historyRows = await safeRows(
      supabase
        .from("wellness_checkup_history")
        .select("*")
        .order("checkup_date", { ascending: true })
        .limit(50000),
    );

    const companyById = new Map<number, any>();
    for (const company of companyRows.filter((row: any) => active(row?.is_active))) {
      const id = numberValue(company?.id);
      if (id > 0 && !companyById.has(id)) companyById.set(id, company);
    }

    const historyByParticipant = new Map<number, any[]>();
    for (const row of historyRows.filter(validHistory)) {
      const participantId = numberValue(row?.participant_id);
      if (!participantIds.has(participantId)) continue;
      if (!historyByParticipant.has(participantId)) {
        historyByParticipant.set(participantId, []);
      }
      historyByParticipant.get(participantId)!.push(row);
    }

    const rows = participants.map((participant: any) => {
      const id = numberValue(participant?.id);
      const participantHistory = historyByParticipant.get(id) || [];
      const checkupDates = [
        ...new Set(
          participantHistory
            .map((row: any) => clean(row?.checkup_date || row?.created_at).slice(0, 10))
            .filter(Boolean),
        ),
      ].sort();

      const canonicalGroup = canonicalParticipantGroupUnit(participant, groupUnitMap);
      const canonicalKelompok = canonicalParticipantKelompokUnit(participant, groupUnitMap);
      const assignment = matchingCoachAssignment(participant, assignments, groupUnitMap);
      const companyId = numberValue(
        participant?.wellness_company_id ||
          participant?.company_id ||
          canonicalGroup?.company_id ||
          canonicalKelompok?.company_id,
      );

      return {
        participant_id: id,
        code: clean(
          participant?.code ||
            participant?.employee_code ||
            participant?.no_karyawan ||
            participant?.kode_karyawan,
        ),
        name:
          clean(
            participant?.name ||
              participant?.full_name ||
              participant?.employee_name,
          ) || `Peserta ${id}`,
        company_id: companyId || null,
        company_name: clean(companyById.get(companyId)?.name) || "-",
        group_unit_id: clean(canonicalGroup?.id) || null,
        group_name: canonicalParticipantGroupName(participant, groupUnitMap),
        kelompok_id: clean(canonicalKelompok?.id) || null,
        kelompok_name: clean(canonicalKelompok?.name) || "-",
        assigned_group_unit_id: clean(assignment?.wellness_group_unit_id) || null,
        assigned_group_name: clean(assignment?.group_name) || "",
        access_group_ids: participantScopeIds(participant, groupUnitMap),
        checkup_dates: checkupDates,
        examination_count: participantHistory.length,
        latest_examination_date: checkupDates.at(-1) || null,
      };
    });

    const groupsByUnit = new Map<string, any>();
    for (const assignment of assignments) {
      const id = clean(assignment?.wellness_group_unit_id);
      if (!id || groupsByUnit.has(id)) continue;
      groupsByUnit.set(id, {
        wellness_group_unit_id: id,
        group_name: clean(groupUnitMap.get(id)?.name || assignment?.group_name || "Group"),
      });
    }

    return NextResponse.json(
      {
        ok: true,
        read_only: true,
        source: "wellness_checkup_history",
        coach: {
          id: coach.id,
          name: clean(coach?.name || coach?.full_name || coach?.username || "Coach"),
        },
        groups: Array.from(groupsByUnit.values()),
        rows,
        summary: {
          total_participants: rows.length,
          participants_with_history: rows.filter((item: any) => item.examination_count > 0).length,
          total_history_rows: rows.reduce(
            (sum: number, item: any) => sum + numberValue(item.examination_count),
            0,
          ),
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Kalender pemeriksaan NAKES Coach gagal dimuat." },
      { status: 500 },
    );
  }
}

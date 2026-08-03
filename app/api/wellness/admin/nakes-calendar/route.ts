// WELLNESS_NAKES_EXAM_CALENDAR_V126M24_1
// WELLNESS_NAKES_CALENDAR_RECONCILIATION_V126M33
// Read-only calendar source for Admin Monitoring NAKES.
// No migration and no write operation.

import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "supervisor",
  "doctor",
  "wellness_admin",
]);

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

function dateKey(value: any) {
  const text = clean(value);
  if (!text) return "";

  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const local = text.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
  if (!local) return "";

  const first = Number(local[1]);
  const second = Number(local[2]);
  const year = local[3];

  // Browser date controls can display MM/DD/YYYY, while imported data can use
  // DD/MM/YYYY. Resolve impossible values first and use MM/DD as the safe
  // fallback for the browser-rendered format used by the NAKES form.
  const month = first > 12 ? second : first;
  const day = first > 12 ? first : second > 12 ? second : second;

  if (month < 1 || month > 12 || day < 1 || day > 31) return "";

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function historyDate(row: any) {
  return dateKey(
    row?.checkup_date ||
      row?.exam_date ||
      row?.log_date ||
      row?.raw_payload?.checkup_date ||
      row?.raw_payload?.exam_date ||
      row?.created_at,
  );
}

function validHistory(row: any) {
  const status = clean(row?.status).toLowerCase();
  return (
    Boolean(historyDate(row)) &&
    active(row?.is_active) &&
    !["cancelled", "canceled", "deleted", "void", "batal"].includes(status)
  );
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

async function loadHistoryRows(supabase: any) {
  try {
    const ordered = await supabase
      .from("wellness_checkup_history")
      .select("*")
      .order("checkup_date", { ascending: true })
      .limit(50000);

    if (!ordered?.error) {
      return {
        rows: ordered?.data || [],
        ok: true,
        fallback_used: false,
        message: "",
      };
    }

    const fallback = await supabase
      .from("wellness_checkup_history")
      .select("*")
      .limit(50000);

    return {
      rows: fallback?.error ? [] : fallback?.data || [],
      ok: !fallback?.error,
      fallback_used: true,
      message: clean(fallback?.error?.message || ordered?.error?.message),
    };
  } catch (error: any) {
    return {
      rows: [],
      ok: false,
      fallback_used: true,
      message: clean(error?.message),
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    const user: any = getSessionUser(request);
    if (!user) return fail("Session Admin belum aktif.", 401);

    const role = clean(user.role).toLowerCase();
    if (!ADMIN_ROLES.has(role)) {
      return fail("Akun ini tidak memiliki akses Monitoring NAKES.", 403);
    }

    const supabase = getSupabaseAdmin();
    const [participantRows, companyRows, groupRows, historyResult] =
      await Promise.all([
        safeRows(
          supabase.from("wellness_participants").select("*").limit(10000),
        ),
        safeRows(
          supabase
            .from("wellness_companies")
            .select("id,name,code,is_active")
            .limit(2000),
        ),
        safeRows(
          supabase
            .from("wellness_group_units")
            .select("id,name,parent_id,company_id,unit_type,is_active")
            .limit(5000),
        ),
        loadHistoryRows(supabase),
      ]);

    const participants = participantRows.filter((item: any) =>
      active(item?.is_active),
    );
    const companies = companyRows.filter((item: any) => active(item?.is_active));
    const groups = groupRows.filter((item: any) => active(item?.is_active));
    const historyRows = Array.isArray(historyResult?.rows)
      ? historyResult.rows
      : [];

    const companyById = new Map<number, any>(
      companies.map((item: any) => [numberValue(item.id), item]),
    );
    const groupById = new Map<number, any>(
      groups.map((item: any) => [numberValue(item.id), item]),
    );
    const participantByCode = new Map<string, number>();

    for (const participant of participants) {
      const code = clean(
        participant?.code ||
          participant?.employee_code ||
          participant?.no_karyawan,
      ).toLowerCase();
      if (code) participantByCode.set(code, numberValue(participant?.id));
    }

    const historyByParticipant = new Map<number, any[]>();
    let unmatchedHistoryRows = 0;

    for (const row of historyRows.filter(validHistory)) {
      let participantId = numberValue(
        row?.participant_id || row?.raw_payload?.participant_id,
      );

      if (!participantId) {
        const participantCode = clean(
          row?.participant_code ||
            row?.employee_code ||
            row?.raw_payload?.participant_code ||
            row?.raw_payload?.employee_code,
        ).toLowerCase();
        participantId = participantByCode.get(participantCode) || 0;
      }

      if (!participantId) {
        unmatchedHistoryRows += 1;
        continue;
      }

      if (!historyByParticipant.has(participantId)) {
        historyByParticipant.set(participantId, []);
      }
      historyByParticipant.get(participantId)!.push(row);
    }

    const rows = participants.map((participant: any) => {
      const participantId = numberValue(participant.id);
      const participantHistory = historyByParticipant.get(participantId) || [];
      const checkupDates = [
        ...new Set(
          participantHistory
            .map((item: any) => historyDate(item))
            .filter(Boolean),
        ),
      ].sort();

      const directGroup =
        groupById.get(numberValue(participant.wellness_group_unit_id)) || null;
      const kelompok =
        groupById.get(numberValue(participant.wellness_kelompok_id)) ||
        (directGroup?.parent_id
          ? groupById.get(numberValue(directGroup.parent_id))
          : null) ||
        (clean(directGroup?.unit_type).toLowerCase() === "kelompok"
          ? directGroup
          : null);
      const companyId = numberValue(
        participant.wellness_company_id || directGroup?.company_id,
      );

      return {
        participant_id: participantId,
        code: clean(
          participant.code ||
            participant.employee_code ||
            participant.no_karyawan,
        ),
        name:
          clean(
            participant.name ||
              participant.full_name ||
              participant.employee_name,
          ) || `Peserta ${participantId}`,
        company_id: companyId,
        company_name: clean(companyById.get(companyId)?.name) || "-",
        group_id: numberValue(directGroup?.id),
        group_name:
          clean(directGroup?.name) ||
          clean(kelompok?.name) ||
          clean(participant.group_name) ||
          "-",
        kelompok_id: numberValue(kelompok?.id),
        kelompok_name: clean(kelompok?.name) || "-",
        checkup_dates: checkupDates,
        examination_count: participantHistory.length,
        latest_examination_date: checkupDates.at(-1) || null,
      };
    });

    return ok({
      rows,
      summary: {
        total_participants: rows.length,
        participants_with_history: rows.filter(
          (item: any) => item.examination_count > 0,
        ).length,
        total_history_rows: rows.reduce(
          (sum: number, item: any) => sum + item.examination_count,
          0,
        ),
        history_query_ok: Boolean(historyResult?.ok),
        history_query_fallback_used: Boolean(historyResult?.fallback_used),
        history_query_message: clean(historyResult?.message),
        unmatched_history_rows: unmatchedHistoryRows,
      },
    });
  } catch (error: any) {
    return fail(
      error?.message || "Kalender pemeriksaan NAKES gagal dimuat.",
      500,
    );
  }
}

// WELLNESS_NAKES_EXAM_CALENDAR_V126M24_1
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

function validHistory(row: any) {
  const status = clean(row?.status).toLowerCase();
  return (
    numberValue(row?.participant_id) > 0 &&
    Boolean(clean(row?.checkup_date || row?.created_at).slice(0, 10)) &&
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

export async function GET(request: NextRequest) {
  try {
    const user: any = getSessionUser(request);
    if (!user) return fail("Session Admin belum aktif.", 401);

    const role = clean(user.role).toLowerCase();
    if (!ADMIN_ROLES.has(role)) {
      return fail("Akun ini tidak memiliki akses Monitoring NAKES.", 403);
    }

    const supabase = getSupabaseAdmin();
    const [participantRows, companyRows, groupRows, historyRows] =
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
        safeRows(
          supabase
            .from("wellness_checkup_history")
            .select("*")
            .order("checkup_date", { ascending: true })
            .limit(50000),
        ),
      ]);

    const participants = participantRows.filter((item: any) =>
      active(item?.is_active),
    );
    const companies = companyRows.filter((item: any) => active(item?.is_active));
    const groups = groupRows.filter((item: any) => active(item?.is_active));

    const companyById = new Map<number, any>(
      companies.map((item: any) => [numberValue(item.id), item]),
    );
    const groupById = new Map<number, any>(
      groups.map((item: any) => [numberValue(item.id), item]),
    );
    const historyByParticipant = new Map<number, any[]>();

    for (const row of historyRows.filter(validHistory)) {
      const participantId = numberValue(row.participant_id);
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
            .map((item: any) =>
              clean(item?.checkup_date || item?.created_at).slice(0, 10),
            )
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
      },
    });
  } catch (error: any) {
    return fail(
      error?.message || "Kalender pemeriksaan NAKES gagal dimuat.",
      500,
    );
  }
}

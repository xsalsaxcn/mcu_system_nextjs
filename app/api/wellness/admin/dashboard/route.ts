import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import { loadParticipantControlMap } from "@/lib/wellness/participantControls";

// WELLNESS_ADMIN_MOBILE_FOUNDATION_API_V79B
// WELLNESS_ADMIN_PARTICIPANT_CONTROL_SUMMARY_V79F
// Lightweight structure API for the dedicated mobile Admin Portal.
// Participant health metrics remain sourced from the existing
// /api/wellness/dashboard endpoint so there is no duplicate scoring logic.

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
  const valueNumber = Number(value);
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function active(value: any) {
  return ![false, 0, "0", "false", "inactive", "nonaktif"].includes(
    typeof value === "string" ? value.toLowerCase() : value,
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
      return fail("Akun ini tidak memiliki akses Portal Admin.", 403);
    }

    const supabase = getSupabaseAdmin();

    const [companyRows, participantRows, groupRows, assignmentRows, coachRows] =
      await Promise.all([
        safeRows(
          supabase
            .from("wellness_companies")
            .select("*")
            .order("name", { ascending: true }),
        ),
        safeRows(
          supabase.from("wellness_participants").select("*").limit(10000),
        ),
        safeRows(
          supabase
            .from("wellness_group_units")
            .select("*")
            .order("name", { ascending: true })
            .limit(5000),
        ),
        safeRows(
          supabase
            .from("wellness_coach_group_assignments")
            .select("*")
            .limit(10000),
        ),
        safeRows(
          supabase
            .from("wellness_coach_users")
            .select("*")
            .limit(2000),
        ),
      ]);

    const companies = companyRows.filter((item: any) => active(item.is_active));
    const participants = participantRows.filter((item: any) => active(item.is_active));
    const assignments = assignmentRows.filter((item: any) => active(item.is_active));
    const coaches = coachRows.filter((item: any) => active(item.is_active));

    const participantControlMap = await loadParticipantControlMap(
      supabase,
      participants.map((item: any) => numberValue(item.id)).filter(Boolean),
    );

    const companyById = new Map<number, any>(
      companies.map((item: any) => [numberValue(item.id), item]),
    );
    const groupById = new Map<number, any>(
      groupRows.map((item: any) => [numberValue(item.id), item]),
    );
    const coachById = new Map<number, any>(
      coaches.map((item: any) => [numberValue(item.id), item]),
    );

    const companyCards = companies.map((company: any) => {
      const companyId = numberValue(company.id);
      const companyGroups = groupRows.filter(
        (item: any) => numberValue(item.company_id) === companyId,
      );
      const companyGroupIds = new Set(
        companyGroups.map((item: any) => numberValue(item.id)),
      );
      const companyAssignments = assignments.filter((item: any) =>
        companyGroupIds.has(numberValue(item.wellness_group_unit_id)),
      );
      const coachIds = new Set(
        companyAssignments
          .map((item: any) => numberValue(item.coach_user_id))
          .filter(Boolean),
      );
      const companyParticipants = participants.filter(
        (item: any) => numberValue(item.wellness_company_id) === companyId,
      );

      return {
        id: companyId,
        name: clean(company.name) || `Perusahaan ${companyId}`,
        code: clean(company.code || company.slug),
        participant_count: companyParticipants.length,
        kelompok_count: companyGroups.filter(
          (item: any) => clean(item.unit_type).toLowerCase() === "kelompok",
        ).length,
        group_count: companyGroups.filter(
          (item: any) => clean(item.unit_type).toLowerCase() === "group",
        ).length,
        coach_count: coachIds.size,
      };
    });

    const groupCards = groupRows
      .filter(
        (item: any) => clean(item.unit_type).toLowerCase() === "kelompok",
      )
      .map((group: any) => {
        const groupId = numberValue(group.id);
        const childIds = groupRows
          .filter((item: any) => numberValue(item.parent_id) === groupId)
          .map((item: any) => numberValue(item.id));
        const relatedIds = new Set([groupId, ...childIds]);
        const members = participants.filter(
          (item: any) =>
            numberValue(item.wellness_kelompok_id) === groupId ||
            relatedIds.has(numberValue(item.wellness_group_unit_id)),
        );
        const relatedAssignments = assignments.filter((item: any) =>
          relatedIds.has(numberValue(item.wellness_group_unit_id)),
        );
        const coachIds = [
          ...new Set(
            relatedAssignments
              .map((item: any) => numberValue(item.coach_user_id))
              .filter(Boolean),
          ),
        ];

        return {
          id: groupId,
          name: clean(group.name) || `Kelompok ${groupId}`,
          company_id: numberValue(group.company_id),
          company_name:
            clean(companyById.get(numberValue(group.company_id))?.name) || "-",
          participant_count: members.length,
          child_group_count: childIds.length,
          coaches: coachIds.map((coachId: number) => {
            const coach = coachById.get(coachId) || {};
            return {
              id: coachId,
              name:
                clean(coach.name || coach.full_name || coach.email) ||
                `Coach ${coachId}`,
              email: clean(coach.email),
            };
          }),
        };
      });

    const coachCards = coaches.map((coach: any) => {
      const coachId = numberValue(coach.id);
      const coachAssignments = assignments.filter(
        (item: any) => numberValue(item.coach_user_id) === coachId,
      );
      const assignedUnits = coachAssignments
        .map((item: any) =>
          groupById.get(numberValue(item.wellness_group_unit_id)),
        )
        .filter(Boolean);
      const companyIds = new Set(
        assignedUnits.map((item: any) => numberValue(item.company_id)),
      );
      const participantIds = new Set<number>();

      for (const unit of assignedUnits) {
        const unitId = numberValue(unit.id);
        const parentId = numberValue(unit.parent_id);
        for (const participant of participants) {
          if (
            numberValue(participant.wellness_group_unit_id) === unitId ||
            numberValue(participant.wellness_kelompok_id) === unitId ||
            (parentId > 0 &&
              numberValue(participant.wellness_kelompok_id) === parentId)
          ) {
            participantIds.add(numberValue(participant.id));
          }
        }
      }

      return {
        id: coachId,
        name:
          clean(coach.name || coach.full_name || coach.email) ||
          `Coach ${coachId}`,
        email: clean(coach.email),
        phone: clean(coach.phone || coach.phone_number || coach.mobile),
        assigned_group_count: assignedUnits.length,
        participant_count: participantIds.size,
        companies: [...companyIds]
          .map((companyId: number) => ({
            id: companyId,
            name: clean(companyById.get(companyId)?.name) || "-",
          }))
          .filter((item) => item.id),
        groups: assignedUnits.map((unit: any) => ({
          id: numberValue(unit.id),
          name: clean(unit.name),
          unit_type: clean(unit.unit_type),
        })),
      };
    });

    // WELLNESS_ADMIN_PARTICIPANT_STABILITY_V126H
    // Master peserta dikirim sebagai fallback agar halaman Admin tidak kosong
    // ketika salah satu Dashboard Perusahaan gagal dimuat.
    const participantCards = participants.map((participant: any) => {
      const participantId = numberValue(participant.id);
      const companyId = numberValue(participant.wellness_company_id);
      const company = companyById.get(companyId) || {};

      const groupUnit =
        groupById.get(numberValue(participant.wellness_group_unit_id)) || {};

      const kelompok =
        groupById.get(numberValue(participant.wellness_kelompok_id)) ||
        (groupUnit?.parent_id
          ? groupById.get(numberValue(groupUnit.parent_id))
          : null) ||
        (clean(groupUnit?.unit_type).toLowerCase() === "kelompok"
          ? groupUnit
          : null) ||
        {};

      return {
        id: participantId,
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
        company_name:
          clean(company.name) ||
          `Perusahaan ${companyId || "-"}`,
        kelompok_id: numberValue(kelompok?.id),
        kelompok_name:
          clean(kelompok?.name) ||
          clean(participant.group_name) ||
          "Tanpa Kelompok",
        group_id: numberValue(groupUnit?.id),
        group_name:
          clean(groupUnit?.name) ||
          clean(kelompok?.name) ||
          clean(participant.group_name) ||
          "-",
        bmi: numberValue(
          participant.baseline_bmi ||
            participant.bmi ||
            participant.initial_bmi,
        ),
        total_points: 0,
        nutrition_points: 0,
        workout_points: 0,
        healthtalk_points: 0,
        other_points: 0,
        diligence_percent: 0,
        nutrition_achievement_percent: 0,
        workout_achievement_percent: 0,
        current_streak: 0,
        active_days: 0,
        last_nutrition_date: null,
        last_workout_date: null,
        days_since_nutrition: 99,
        days_since_workout: 99,
        overall_score: 0,
        flag: "yellow",
        flag_label: "Menunggu data program",
        compliance_status: "Menunggu data program",
        need_followup: false,
        ranking_source: "admin_master_fallback",
        wellness_control:
          participantControlMap.get(participantId) || null,
      };
    });

    return ok({
      admin: {
        id: user.id,
        name: clean(user.name || user.username) || "Admin Harmony Health",
        username: clean(user.username),
        role,
      },
      summary: {
        total_companies: companyCards.length,
        total_participants: participants.length,
        total_coaches: coachCards.length,
        total_kelompok: groupCards.length,
        total_groups: groupRows.filter(
          (item: any) => clean(item.unit_type).toLowerCase() === "group",
        ).length,
      },
      companies: companyCards,
      groups: groupCards,
      coaches: coachCards,
      participants: participantCards,
      participant_controls: participants.map((participant: any) => {
        const participantId = numberValue(participant.id);
        return (
          participantControlMap.get(participantId) || {
            participant_id: participantId,
            session_enabled: true,
            fitness_enabled: false,
            fitness_source: "none",
            connected_providers: [],
            active_providers: [],
            has_multiple_active_providers: false,
            source_connected: false,
            control_exists: false,
          }
        );
      }),
    });
  } catch (error: any) {
    return fail(error?.message || "Portal Admin gagal dimuat.", 500);
  }
}

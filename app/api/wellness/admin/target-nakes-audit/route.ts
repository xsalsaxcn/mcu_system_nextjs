// WELLNESS_TARGET_NAKES_IDENTITY_AUDIT_V126M60
// Admin-only READ-ONLY audit for target persistence + NAKES identity parity.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  buildEffectiveTargetTimeline,
  effectiveTargetsForDate,
  effectiveTargetRevisionForDate,
} from "@/lib/wellness/effectiveDatedTargets";
import { fetchWellnessGoogleSheetRows } from "@/lib/wellness/googleSheetResponses";
import { resolveCanonicalClinicalHistory } from "@/lib/wellness/canonicalClinicalHistory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "supervisor",
  "doctor",
  "wellness_admin",
]);

const WATCHED = [
  { id: 25, code: "176", name: "Teguh Santoso" },
  { id: 20, code: "145", name: "Teguh Santoso" },
  { id: 26, code: "278", name: "Mochammad Samsul Ma'Arif" },
  { id: 23, code: "22", name: "Regik Dwi Stiawan" },
  { id: 21, code: "178", name: "Salim Mukti" },
  { id: 19, code: "58", name: "Adin Sugiyanto" },
  { id: 24, code: "186", name: "Yoga Nurisman" },
] as const;

function clean(value: any) {
  return String(value ?? "").trim();
}

function num(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function codeOf(row: any) {
  return clean(
    row?.code ||
      row?.employee_code ||
      row?.participant_code ||
      row?.kode_karyawan ||
      row?.employee_id ||
      row?.nik,
  );
}

function nameOf(row: any) {
  return clean(
    row?.name ||
      row?.participant_name ||
      row?.employee_name ||
      row?.full_name ||
      row?.nama,
  );
}

function dateKey(row: any) {
  return clean(
    row?.checkup_date ||
      row?.exam_date ||
      row?.log_date ||
      row?.date ||
      row?.created_at ||
      row?.updated_at,
  ).slice(0, 10);
}

function firstPositive(...values: any[]) {
  for (const value of values) {
    const parsed = num(value);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function rowWeight(row: any) {
  const raw = row?.raw_payload || {};
  return firstPositive(
    row?.weight_kg,
    row?.body_weight_kg,
    row?.weight,
    row?.bb_kg,
    row?.berat_badan,
    raw?.weight_kg,
    raw?.["Berat Badan NAKES (kg)"],
    raw?.["BB Monitoring terbaru"],
    raw?.["Berat Badan (kg)"],
  );
}

function rowHeight(row: any) {
  const raw = row?.raw_payload || {};
  return firstPositive(
    row?.height_cm,
    row?.body_height_cm,
    row?.height,
    row?.tb_cm,
    row?.tinggi_badan,
    raw?.height_cm,
    raw?.["Tinggi Badan NAKES (cm)"],
    raw?.["Tinggi Badan (cm)"],
  );
}

function rowBmi(row: any) {
  const raw = row?.raw_payload || {};
  return firstPositive(
    row?.bmi,
    row?.bmi_value,
    raw?.bmi,
    raw?.["BMI"],
  );
}

function compactClinical(row: any, expectedId: number, expectedCode: string) {
  const raw = row?.raw_payload || {};
  const rowParticipantId = num(
    row?.participant_id ||
      row?.wellness_participant_id ||
      raw?.participant_id ||
      raw?.wellness_participant_id,
  );
  const rowCode = clean(
    row?.employee_code ||
      row?.participant_code ||
      row?.code ||
      raw?.employee_code ||
      raw?.participant_code ||
      raw?.code ||
      raw?.["Kode Karyawan"] ||
      raw?.["Kode"],
  );
  return {
    id: row?.id ?? null,
    date: dateKey(row) || null,
    participant_id: rowParticipantId || null,
    employee_code: rowCode || null,
    name: nameOf(row) || clean(raw?.participant_name || raw?.["Nama Peserta"]) || null,
    weight_kg: rowWeight(row) || null,
    height_cm: rowHeight(row) || null,
    bmi: rowBmi(row) || null,
    source:
      clean(
        row?._canonical_source ||
          row?.source ||
          raw?.nakes_source ||
          raw?.source ||
          raw?._canonical_source,
      ) || null,
    identity_ok:
      (!rowParticipantId || rowParticipantId === expectedId) &&
      (!rowCode || rowCode === expectedCode),
  };
}

function safeTargetNote(note: any) {
  return {
    id: note?.id ?? null,
    session_date: clean(note?.session_date) || null,
    created_at: clean(note?.created_at) || null,
    updated_at: clean(note?.updated_at) || null,
    topic: clean(note?.topic) || null,
    action_plan: clean(note?.action_plan) || null,
    main_issue: clean(note?.main_issue) || null,
    coach_note: clean(note?.coach_note) || null,
  };
}

function response(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const session: any = getSessionUser(request);
    if (!session) {
      return response({ ok: false, message: "Session Admin belum aktif." }, 401);
    }
    const role = clean(session?.role).toLowerCase();
    if (!ADMIN_ROLES.has(role)) {
      return response({ ok: false, message: "Akun tidak memiliki akses Admin." }, 403);
    }

    const effectiveDate =
      clean(request.nextUrl.searchParams.get("date")) || "2026-08-12";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
      return response({ ok: false, message: "Format date harus YYYY-MM-DD." }, 400);
    }

    const supabase = getSupabaseAdmin();
    const ids = WATCHED.map((item) => item.id);

    const [participantResult, noteResult, checkupResult, miniMcuResult, weightResult] =
      await Promise.all([
        supabase.from("wellness_participants").select("*").in("id", ids).limit(100),
        supabase
          .from("wellness_coach_notes")
          .select("*")
          .in("participant_id", ids)
          .order("session_date", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(5000),
        supabase
          .from("wellness_checkup_history")
          .select("*")
          .in("participant_id", ids)
          .order("checkup_date", { ascending: false })
          .limit(5000),
        supabase
          .from("wellness_mini_mcu_logs")
          .select("*")
          .in("participant_id", ids)
          .order("exam_date", { ascending: false })
          .limit(5000),
        supabase
          .from("wellness_weight_logs")
          .select("*")
          .in("participant_id", ids)
          .order("log_date", { ascending: false })
          .limit(5000),
      ]);

    if (participantResult.error) throw participantResult.error;
    if (noteResult.error) throw noteResult.error;
    if (checkupResult.error) throw checkupResult.error;
    if (miniMcuResult.error) throw miniMcuResult.error;
    if (weightResult.error) throw weightResult.error;

    const participants = participantResult.data || [];
    const notes = noteResult.data || [];
    const checkups = checkupResult.data || [];
    const miniMcu = miniMcuResult.data || [];
    const weights = weightResult.data || [];

    const rows = await Promise.all(
      WATCHED.map(async (expected) => {
        const participant = participants.find(
          (row: any) => num(row?.id) === expected.id,
        );

        if (!participant) {
          return {
            expected,
            found: false,
            verdict: "PARTICIPANT_NOT_FOUND",
          };
        }

        const actualCode = codeOf(participant);
        const actualName = nameOf(participant);
        const identityMatch =
          actualCode === expected.code &&
          actualName.toLowerCase() === expected.name.toLowerCase();

        const participantNotes = notes.filter(
          (row: any) => num(row?.participant_id) === expected.id,
        );
        const timeline = buildEffectiveTargetTimeline({
          participant,
          notes: participantNotes,
        });
        const targetOnDate = effectiveTargetsForDate(timeline, effectiveDate);
        const targetRevision = effectiveTargetRevisionForDate(
          timeline,
          effectiveDate,
        );

        const participantCheckups = checkups.filter(
          (row: any) => num(row?.participant_id) === expected.id,
        );
        const participantMiniMcu = miniMcu.filter(
          (row: any) => num(row?.participant_id) === expected.id,
        );
        const participantWeights = weights.filter(
          (row: any) => num(row?.participant_id) === expected.id,
        );

        let sheetResult: any = { ok: false, rows: [], message: "not loaded" };
        try {
          sheetResult = await fetchWellnessGoogleSheetRows({
            code: actualCode,
            participantId: expected.id,
            limit: 800,
          });
        } catch (error: any) {
          sheetResult = {
            ok: false,
            rows: [],
            message: error?.message || "Gagal membaca Google Sheet NAKES.",
          };
        }

        const canonicalClinical = resolveCanonicalClinicalHistory({
          participant,
          databaseRows: [
            ...participantCheckups,
            ...participantMiniMcu,
            ...participantWeights,
          ],
          sheetRows: sheetResult?.rows || [],
        });

        const compactCanonical = (canonicalClinical || [])
          .map((row: any) => compactClinical(row, expected.id, actualCode))
          .sort((a: any, b: any) =>
            clean(b?.date).localeCompare(clean(a?.date)),
          );

        const compactDbCheckups = participantCheckups
          .map((row: any) => compactClinical(row, expected.id, actualCode))
          .sort((a: any, b: any) =>
            clean(b?.date).localeCompare(clean(a?.date)),
          );

        const identityMismatchRows = compactDbCheckups.filter(
          (row: any) => row.identity_ok === false,
        );

        const exactDateRevisionExists = timeline.revisions.some(
          (revision: any) => revision.effective_from === effectiveDate,
        );
        const participantFieldWeight = firstPositive(
          participant?.target_weight_kg,
          participant?.weight_target_kg,
        );
        const canonicalWeight = num(targetOnDate?.weight_kg);

        let verdict = "TARGET_OK";
        if (!identityMatch) verdict = "PARTICIPANT_IDENTITY_MISMATCH";
        else if (identityMismatchRows.length > 0) {
          verdict = "NAKES_HISTORY_IDENTITY_MISMATCH";
        } else if (!exactDateRevisionExists) {
          verdict = "NO_TARGET_REVISION_ON_SELECTED_DATE";
        } else if (
          canonicalWeight > 0 &&
          participantFieldWeight > 0 &&
          Math.abs(canonicalWeight - participantFieldWeight) > 0.01
        ) {
          verdict = "TARGET_HISTORY_OK_PARTICIPANT_FIELD_STALE";
        }

        return {
          expected,
          found: true,
          identity: {
            participant_id: num(participant.id),
            code: actualCode,
            name: actualName,
            expected_code: expected.code,
            expected_name: expected.name,
            exact_match: identityMatch,
          },
          verdict,
          selected_date: effectiveDate,
          participant_target_fields: {
            nutrition:
              firstPositive(
                participant?.daily_calorie_limit,
                participant?.nutrition_max_calories,
                participant?.target_calories,
              ) || null,
            workout:
              firstPositive(
                participant?.workout_calorie_target,
                participant?.workout_min_calories,
                participant?.active_calorie_target,
              ) || null,
            steps:
              firstPositive(
                participant?.daily_step_target,
                participant?.step_target,
              ) || null,
            weight_kg: participantFieldWeight || null,
          },
          effective_target_on_date: targetOnDate,
          effective_revision_on_date: targetRevision,
          exact_date_revision_exists: exactDateRevisionExists,
          target_timeline: {
            fallback: timeline.fallback,
            current: timeline.current,
            current_revision: timeline.current_revision,
            revisions: timeline.revisions,
          },
          target_notes: participantNotes.map(safeTargetNote),
          nakes: {
            participant_master: {
              height_cm:
                firstPositive(
                  participant?.height_cm,
                  participant?.body_height_cm,
                ) || null,
              initial_weight_kg:
                firstPositive(
                  participant?.initial_weight_kg,
                  participant?.weight_kg,
                ) || null,
            },
            google_sheet_ok: Boolean(sheetResult?.ok),
            google_sheet_message: clean(sheetResult?.message) || null,
            google_sheet_row_count: Array.isArray(sheetResult?.rows)
              ? sheetResult.rows.length
              : 0,
            checkup_history_row_count: participantCheckups.length,
            mini_mcu_row_count: participantMiniMcu.length,
            weight_log_row_count: participantWeights.length,
            canonical_latest: compactCanonical[0] || null,
            canonical_recent: compactCanonical.slice(0, 8),
            database_checkup_recent: compactDbCheckups.slice(0, 8),
            identity_mismatch_count: identityMismatchRows.length,
            identity_mismatch_rows: identityMismatchRows.slice(0, 20),
          },
        };
      }),
    );

    const duplicateTeguh = rows
      .filter((row: any) => row?.identity?.name === "Teguh Santoso")
      .map((row: any) => ({
        participant_id: row?.identity?.participant_id,
        code: row?.identity?.code,
        canonical_latest_nakes: row?.nakes?.canonical_latest || null,
        target_on_date: row?.effective_target_on_date || null,
      }));

    return response({
      ok: true,
      marker: "WELLNESS_TARGET_NAKES_IDENTITY_AUDIT_V126M60",
      read_only: true,
      selected_date: effectiveDate,
      watched_count: WATCHED.length,
      rows,
      duplicate_name_control: {
        name: "Teguh Santoso",
        expected_distinct_records: [
          { participant_id: 20, code: "145" },
          { participant_id: 25, code: "176" },
        ],
        resolved: duplicateTeguh,
      },
      note:
        "READ ONLY. Tidak ada insert/update/delete/upsert. Target dihitung dengan helper effective-dated canonical V126M44; NAKES canonical memakai exact participant identity flow.",
    });
  } catch (error: any) {
    return response(
      {
        ok: false,
        marker: "WELLNESS_TARGET_NAKES_IDENTITY_AUDIT_V126M60",
        read_only: true,
        message: error?.message || "Audit target/NAKES gagal.",
      },
      500,
    );
  }
}

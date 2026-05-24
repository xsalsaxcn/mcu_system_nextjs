import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    {
      ok: false,
      message,
      ...extra,
    },
    { status }
  );
}

function normalizeEngineUrl() {
  return String(process.env.AI_MCU_ENGINE_URL || "").replace(/\/$/, "");
}

function pick(...values: any[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && !["null", "undefined", "nan", "-"].includes(text.toLowerCase())) {
      return text;
    }
  }
  return "";
}

const RESULT_TABLE_CANDIDATES = [
  "results",
  "participant_results",
  "examination_results",
  "mcu_results",
  "medical_results",
  "participant_examination_results",
];

async function fetchParticipantsByIds(supabase: any, ids: number[]) {
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
  const rows: any[] = [];

  for (let i = 0; i < uniqueIds.length; i += 500) {
    const chunk = uniqueIds.slice(i, i + 500);

    const { data, error } = await supabase
      .from("participants")
      .select("*")
      .in("id", chunk);

    if (error) throw new Error(error.message);
    rows.push(...(data || []));
  }

  const orderMap = new Map(uniqueIds.map((id, index) => [id, index]));
  rows.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

  return rows;
}

async function tryFetchResultRows(supabase: any, ids: number[]) {
  const allRows: any[] = [];

  for (const table of RESULT_TABLE_CANDIDATES) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .in("participant_id", ids)
        .limit(10000);

      if (error) continue;

      for (const row of data || []) {
        allRows.push({
          ...row,
          _result_table: table,
        });
      }
    } catch {
      // table tidak ada atau kolom berbeda, abaikan agar route tetap aman
    }
  }

  return allRows;
}

function normalizeResultRows(resultRows: any[]) {
  const byParticipant = new Map<number, any[]>();

  for (const row of resultRows || []) {
    const pid = Number(row.participant_id || row.participantId || row.participant);
    if (!Number.isFinite(pid)) continue;

    const list = byParticipant.get(pid) || [];
    list.push(row);
    byParticipant.set(pid, list);
  }

  return byParticipant;
}

function mergeMedicalRows(participant: any, resultRows: any[]) {
  const merged: Record<string, any> = {
    ...participant,

    participantId: participant.id,
    participant_id: participant.id,

    NAMA: pick(participant.name, participant.nama),
    Nama: pick(participant.name, participant.nama),
    name: pick(participant.name, participant.nama),

    NOMCU: pick(participant.mcu_id, participant.no_mcu, participant.nomcu, participant.barcode_value, participant.external_id, participant.id),
    "NO MCU": pick(participant.mcu_id, participant.no_mcu, participant.nomcu, participant.barcode_value, participant.external_id, participant.id),

    NIK: pick(participant.nik, participant.external_id, participant.employee_id),
    "NIK/NRP/ID": pick(participant.nik, participant.external_id, participant.employee_id),

    JK: pick(participant.gender, participant.sex, participant.jenis_kelamin),
    TGLLAHIR: pick(participant.birth_date, participant.date_of_birth, participant.tanggal_lahir),
    USIA: pick(participant.age, participant.usia),
  };

  for (const row of resultRows || []) {
    // Format long: parameter/value
    const parameterName = pick(
      row.parameter_name,
      row.parameter_label,
      row.parameter_code,
      row.parameter_key,
      row.code,
      row.name,
      row.field_name
    );

    const parameterValue = pick(
      row.value,
      row.result_value,
      row.result,
      row.numeric_value,
      row.text_value,
      row.answer,
      row.hasil
    );

    if (parameterName && parameterValue && !merged[parameterName]) {
      merged[parameterName] = parameterValue;
    }

    // Format wide: langsung merge semua kolom non-empty
    for (const [key, value] of Object.entries(row)) {
      if (["id", "participant_id", "created_at", "updated_at", "_result_table"].includes(key)) continue;
      if (merged[key] === undefined || merged[key] === null || merged[key] === "") {
        merged[key] = value;
      }
    }
  }

  return merged;
}

export async function POST(req: NextRequest) {
  try {
    const user = getSessionUser(req);
    if (!user) return fail("Unauthorized", 401);

    const engineUrl = normalizeEngineUrl();
    if (!engineUrl) {
      return fail("AI_MCU_ENGINE_URL belum dikonfigurasi di Vercel.", 500);
    }

    const body = await req.json().catch(() => ({}));

    const participantIds = Array.isArray(body.participantIds)
      ? body.participantIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id))
      : [];

    if (!participantIds.length) {
      return fail("Pilih minimal 1 peserta untuk analisis MCU.");
    }

    const supabase = getSupabaseAdmin();

    const participants = await fetchParticipantsByIds(supabase, participantIds);
    if (!participants.length) {
      return fail("Data peserta tidak ditemukan.");
    }

    const resultRows = await tryFetchResultRows(supabase, participantIds);
    const resultMap = normalizeResultRows(resultRows);

    const currentRows = participants.map((participant: any) => {
      const related = resultMap.get(Number(participant.id)) || [];
      return mergeMedicalRows(participant, related);
    });

    const res = await fetch(`${engineUrl}/analyze-mcu`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        currentRows,
        previousRows: [],
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      return fail(json.message || "Analisis MCU gagal di Python Engine.", 500, {
        engineStatus: res.status,
        response: json,
      });
    }

    return NextResponse.json({
      ok: true,
      ...json,
      selectedCount: participants.length,
      medicalRowsFound: resultRows.length,
      searchedResultTables: RESULT_TABLE_CANDIDATES,
    });
  } catch (error: any) {
    return fail(error?.message || "Analisis MCU gagal.", 500);
  }
}

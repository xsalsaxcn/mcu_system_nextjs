import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

function ok(payload: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...payload });
}

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || ["null", "undefined", "nan", "-"].includes(text.toLowerCase())) return "";
  return text;
}

function valueFromMapping(row: Record<string, any>, mapping: Record<string, string>, key: string) {
  const header = mapping?.[key];
  if (!header) return "";
  return cleanText(row?.[header]);
}

function applyMappingToRow(rowData: Record<string, any>, fieldMapping: Record<string, string>) {
  const next: Record<string, any> = {
    ...rowData,
    _AI_MCU_FIELD_MAPPING: fieldMapping,
  };

  for (const [targetKey, sourceHeader] of Object.entries(fieldMapping || {})) {
    if (!targetKey || !sourceHeader) continue;
    next[targetKey] = rowData?.[sourceHeader] ?? next[targetKey] ?? "";
  }

  const detectedName = valueFromMapping(rowData, fieldMapping, "NAMA") || cleanText(next.NAMA || next.Nama);
  const detectedMcuId = valueFromMapping(rowData, fieldMapping, "NOMCU") || cleanText(next.NOMCU || next["NO MCU"] || next["NO.MCU"]);
  const detectedNik = valueFromMapping(rowData, fieldMapping, "NIK") || cleanText(next.NIK || next["NIK/NRP/ID"]);

  if (detectedName) {
    next.NAMA = detectedName;
    next.Nama = detectedName;
  }

  if (detectedMcuId) {
    next.NOMCU = detectedMcuId;
    next["NO MCU"] = detectedMcuId;
    next["NO.MCU"] = detectedMcuId;
  }

  if (detectedNik) {
    next.NIK = detectedNik;
    next["NIK/NRP/ID"] = detectedNik;
  }

  return {
    rowData: next,
    detectedName,
    detectedMcuId,
    detectedNik,
  };
}

function collectHeaders(rows: any[]) {
  const seen = new Set<string>();
  const headers: string[] = [];

  for (const item of rows || []) {
    const rowData = item?.row_data || {};

    for (const key of Object.keys(rowData)) {
      if (key.startsWith("_AI_MCU")) continue;
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }

  return headers;
}

export async function GET(req: NextRequest) {
  try {
    const user = getSessionUser(req);
    if (!user) return fail("Unauthorized", 401);

    const sourceId = Number(req.nextUrl.searchParams.get("source_id") || 0);
    if (!Number.isFinite(sourceId) || sourceId <= 0) {
      return fail("source_id wajib dipilih.");
    }

    const supabase = getSupabaseAdmin();

    const sourceResult = await supabase
      .from("participant_sources")
      .select("id,name,institution_name,program_type")
      .eq("id", sourceId)
      .maybeSingle();

    if (sourceResult.error) return fail(sourceResult.error.message, 500);
    if (!sourceResult.data) return fail("Database/source tidak ditemukan.", 404);

    const rowsResult = await supabase
      .from("ai_mcu_import_rows")
      .select("id,participant_id,row_data,participant_name,mcu_id,nik,company_name,database_name,sheet_name,row_index")
      .eq("source_id", sourceId)
      .order("id", { ascending: true })
      .limit(50);

    if (rowsResult.error) {
      return fail(rowsResult.error.message, 500, {
        hint: "Pastikan tabel ai_mcu_import_rows sudah dibuat dan database berasal dari Upload Excel AI MCU.",
      });
    }

    const rows = rowsResult.data || [];
    const headers = collectHeaders(rows);
    const firstMapping = rows[0]?.row_data?._AI_MCU_FIELD_MAPPING || {};

    return ok({
      source: sourceResult.data,
      totalSampleRows: rows.length,
      headers,
      fieldMapping: firstMapping,
      sampleRows: rows.slice(0, 8).map((row: any) => ({
        id: row.id,
        participant_id: row.participant_id,
        participant_name: row.participant_name,
        mcu_id: row.mcu_id,
        nik: row.nik,
        company_name: row.company_name,
        database_name: row.database_name,
        sheet_name: row.sheet_name,
        row_index: row.row_index,
        row_data: row.row_data || {},
      })),
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal mengambil header mapping.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getSessionUser(req);
    if (!user) return fail("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    const sourceId = Number(body.sourceId || body.source_id || 0);
    const fieldMapping = body.fieldMapping || {};

    if (!Number.isFinite(sourceId) || sourceId <= 0) {
      return fail("sourceId wajib dipilih.");
    }

    if (!fieldMapping.NAMA || !fieldMapping.NOMCU) {
      return fail("Mapping wajib belum lengkap. Minimal Nama Peserta dan No MCU harus dipilih.");
    }

    const supabase = getSupabaseAdmin();

    const rowsResult = await supabase
      .from("ai_mcu_import_rows")
      .select("id,participant_id,row_data")
      .eq("source_id", sourceId)
      .order("id", { ascending: true });

    if (rowsResult.error) return fail(rowsResult.error.message, 500);

    const rows = rowsResult.data || [];
    if (!rows.length) {
      return fail("Belum ada row upload untuk database ini. Upload Excel terlebih dahulu.", 404);
    }

    let updatedRows = 0;
    let updatedParticipants = 0;

    for (const row of rows) {
      const existingRowData = row.row_data || {};
      const applied = applyMappingToRow(existingRowData, fieldMapping);

      const updateImport = await supabase
        .from("ai_mcu_import_rows")
        .update({
          row_data: applied.rowData,
          participant_name: applied.detectedName || null,
          mcu_id: applied.detectedMcuId || null,
          nik: applied.detectedNik || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (updateImport.error) return fail(updateImport.error.message, 500);
      updatedRows += 1;

      if (row.participant_id) {
        const participantPatch: Record<string, any> = {};
        if (applied.detectedName) participantPatch.name = applied.detectedName;
        if (applied.detectedMcuId) {
          participantPatch.mcu_id = applied.detectedMcuId;
          participantPatch.external_id = applied.detectedNik || applied.detectedMcuId;
        }
        if (applied.detectedNik) participantPatch.nik = applied.detectedNik;

        if (Object.keys(participantPatch).length) {
          const updateParticipant = await supabase
            .from("participants")
            .update(participantPatch)
            .eq("id", row.participant_id);

          if (!updateParticipant.error) updatedParticipants += 1;
        }
      }
    }

    return ok({
      message: "Mapping header berhasil disimpan ke database upload AI MCU.",
      sourceId,
      updatedRows,
      updatedParticipants,
      fieldMapping,
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan mapping header.", 500);
  }
}

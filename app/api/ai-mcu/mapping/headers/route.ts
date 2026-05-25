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

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || ["null", "undefined", "nan", "-", "—"].includes(text.toLowerCase())) return "";
  return text;
}

function isObject(value: any) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function collectHeaders(rows: any[]) {
  const seen = new Set<string>();
  const headers: string[] = [];

  for (const item of rows || []) {
    const rowData = item?.row_data || {};
    for (const key of Object.keys(rowData)) {
      if (!key || key.startsWith("_AI_MCU")) continue;
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }

  return headers;
}

function firstNonEmptyMapping(rows: any[]) {
  for (const row of rows || []) {
    const direct = row?.field_mapping;
    if (isObject(direct) && Object.keys(direct).length) return direct;

    const fromRow = row?.row_data?._AI_MCU_FIELD_MAPPING;
    if (isObject(fromRow) && Object.keys(fromRow).length) return fromRow;
  }

  return {};
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
      .select("id,participant_id,dataset_role,row_data,field_mapping,participant_name,mcu_id,nik,company_name,database_name,sheet_name,row_index")
      .eq("source_id", sourceId)
      .order("id", { ascending: true })
      .limit(80);

    if (rowsResult.error) return fail(rowsResult.error.message, 500);

    const rows = rowsResult.data || [];
    const headers = collectHeaders(rows);
    const fieldMapping = firstNonEmptyMapping(rows);

    return ok({
      source: sourceResult.data,
      totalSampleRows: rows.length,
      headers,
      fieldMapping,
      sampleRows: rows.slice(0, 8).map((row: any) => ({
        id: row.id,
        participant_id: row.participant_id,
        dataset_role: row.dataset_role,
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
    const fieldMapping = isObject(body.fieldMapping) ? body.fieldMapping : {};

    if (!Number.isFinite(sourceId) || sourceId <= 0) {
      return fail("sourceId wajib dipilih.");
    }

    const mappedKeys = Object.keys(fieldMapping).filter((key) => clean(fieldMapping[key]));

    if (!mappedKeys.length) {
      return fail("Belum ada field mapping yang dipilih.");
    }

    const supabase = getSupabaseAdmin();

    const patch = {
      field_mapping: fieldMapping,
      analysis_meta: {
        mapping_saved_at: new Date().toISOString(),
        mapped_keys: mappedKeys,
      },
      updated_at: new Date().toISOString(),
    };

    const updated = await supabase
      .from("ai_mcu_import_rows")
      .update(patch)
      .eq("source_id", sourceId)
      .select("id");

    if (updated.error) {
      return fail(updated.error.message, 500, {
        hint: "Pastikan SQL patch sudah dijalankan sehingga tabel ai_mcu_import_rows punya kolom field_mapping dan analysis_meta.",
      });
    }

    return ok({
      message: "Mapping berhasil disimpan cepat. Analisis akan memakai mapping ini saat Run Analisis.",
      sourceId,
      updatedRows: updated.data?.length || 0,
      mappedKeys,
      fieldMapping,
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan mapping header.", 500);
  }
}

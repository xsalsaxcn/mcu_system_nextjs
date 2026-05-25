import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { buildAiMcuAutoMapping, AI_MCU_MAPPING_FIELDS } from "@/lib/ai-mcu/headerLibrary";

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

function pushUnique(target: string[], seen: Set<string>, value: unknown) {
  const text = clean(value);
  if (!text || text.startsWith("_AI_MCU")) return;
  if (!seen.has(text)) {
    seen.add(text);
    target.push(text);
  }
}

function collectActualHeaders(rows: any[]) {
  const seen = new Set<string>();
  const headers: string[] = [];

  for (const item of rows || []) {
    const rowData = item?.row_data || {};
    for (const key of Object.keys(rowData)) pushUnique(headers, seen, key);

    const metaHeaders = item?.analysis_meta?.headers;
    if (Array.isArray(metaHeaders)) {
      for (const key of metaHeaders) pushUnique(headers, seen, key);
    }

    const mapping = item?.field_mapping || rowData?._AI_MCU_FIELD_MAPPING;
    if (isObject(mapping)) {
      for (const sourceHeader of Object.values(mapping)) pushUnique(headers, seen, sourceHeader);
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

function fallbackMasterHeaders() {
  const values: string[] = [];
  const seen = new Set<string>();

  for (const field of AI_MCU_MAPPING_FIELDS) {
    pushUnique(values, seen, field.key);
    pushUnique(values, seen, field.label);
    for (const alias of field.aliases || []) pushUnique(values, seen, alias);
  }

  return values;
}

async function loadMasterHeaders(supabase: any) {
  try {
    const result = await supabase
      .from("ai_mcu_master_headers")
      .select("group_name,target_key,label,header_name,aliases,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });

    if (result.error) return { rows: [], headers: fallbackMasterHeaders(), error: result.error.message };

    const seen = new Set<string>();
    const headers: string[] = [];

    for (const row of result.data || []) {
      pushUnique(headers, seen, row.header_name);
      pushUnique(headers, seen, row.label);
      pushUnique(headers, seen, row.target_key);
      for (const alias of row.aliases || []) pushUnique(headers, seen, alias);
    }

    return { rows: result.data || [], headers: headers.length ? headers : fallbackMasterHeaders(), error: "" };
  } catch (error: any) {
    return { rows: [], headers: fallbackMasterHeaders(), error: error?.message || "" };
  }
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
      .select("id,participant_id,dataset_role,row_data,field_mapping,analysis_meta,participant_name,mcu_id,nik,company_name,database_name,sheet_name,row_index")
      .eq("source_id", sourceId)
      .order("id", { ascending: true })
      .limit(120);

    if (rowsResult.error) return fail(rowsResult.error.message, 500);

    const rows = rowsResult.data || [];
    const actualHeaders = collectActualHeaders(rows);
    const savedMapping = firstNonEmptyMapping(rows);
    const actualAutoMapping = buildAiMcuAutoMapping(actualHeaders, AI_MCU_MAPPING_FIELDS);
    const master = await loadMasterHeaders(supabase);

    const seen = new Set<string>();
    const headers: string[] = [];
    for (const h of actualHeaders) pushUnique(headers, seen, h);
    for (const h of master.headers) pushUnique(headers, seen, h);

    return ok({
      source: sourceResult.data,
      totalSampleRows: rows.length,
      headers,
      actualHeaders,
      masterHeaders: master.headers,
      masterRows: master.rows,
      masterHeaderError: master.error,
      fieldMapping: Object.keys(savedMapping).length ? savedMapping : actualAutoMapping,
      savedFieldMapping: savedMapping,
      autoFieldMapping: actualAutoMapping,
      libraryFields: AI_MCU_MAPPING_FIELDS.length,
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
    if (!mappedKeys.length) return fail("Belum ada field mapping yang dipilih.");

    const supabase = getSupabaseAdmin();

    const updated = await supabase
      .from("ai_mcu_import_rows")
      .update({
        field_mapping: fieldMapping,
        analysis_meta: {
          mapping_saved_at: new Date().toISOString(),
          mapped_keys: mappedKeys,
          master_header_enabled: true,
          library_version: "ai-mcu-master-header-v3",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("source_id", sourceId)
      .select("id");

    if (updated.error) {
      return fail(updated.error.message, 500, {
        hint: "Pastikan SQL patch sudah dijalankan sehingga ai_mcu_import_rows punya field_mapping dan analysis_meta.",
      });
    }

    return ok({
      message: "Mapping berhasil disimpan cepat. Header master tersimpan sebagai referensi mapping.",
      sourceId,
      updatedRows: updated.data?.length || 0,
      mappedKeys,
      fieldMapping,
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan mapping header.", 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

function norm(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cleanValue(value: any) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (["null", "undefined", "nan"].includes(text.toLowerCase())) return "";
  return text;
}

function compareValue(value: any) {
  const text = cleanValue(value);
  if (!text) return "";
  const normalizedNumber = Number(text.replace(/,/g, "."));
  if (Number.isFinite(normalizedNumber)) {
    return normalizedNumber.toString();
  }
  return text.replace(/\s+/g, " ").toLowerCase();
}

function toNum(value: any) {
  const raw = cleanValue(value).replace(/,/g, ".");
  const match = raw.match(/-?\d+(\.\d+)?/);
  if (!match) return NaN;
  return Number(match[0]);
}

function rowKey(row: Record<string, any>) {
  return norm(row.NOMCU || row["NO MCU"] || row["NO.MCU"] || row.MCU_ID || row.NIK || row["NIK/NRP/ID"] || row.NAMA || row.Nama);
}

function rowName(row: Record<string, any>) {
  return cleanValue(row.NAMA || row.Nama || row.name || row.participant_name);
}

const IGNORE_COMPARE_KEYS = new Set([
  "NO", "NOMCU", "NO MCU", "NO.MCU", "MCU_ID", "NAMA", "Nama", "name", "NIK", "NIK/NRP/ID",
  "JK", "USIA", "TGLLAHIR", "Tanggal Lahir", "DEPARTEMEN", "PAKET", "DATABASE_NAME", "PROGRAM_TYPE",
  "Nama PT", "Perusahaan", "_AI_MCU_FIELD_MAPPING", "_SheetName", "_RowIndex",
]);

function buildComparison(previousRows: any[], currentRows: any[], thresholdPct = 10) {
  const oldMap = new Map<string, Record<string, any>>();
  for (const row of previousRows || []) {
    const key = rowKey(row);
    if (key && !oldMap.has(key)) oldMap.set(key, row);
  }

  const comparisonRows: any[] = [];
  const changedRows: any[] = [];

  for (const current of currentRows || []) {
    const key = rowKey(current);
    const prev = key ? oldMap.get(key) : undefined;
    const name = rowName(current) || rowName(prev || {});
    const mcuId = cleanValue(current.NOMCU || current["NO MCU"] || current.MCU_ID || prev?.NOMCU || prev?.["NO MCU"]);

    const allKeys = new Set<string>([...Object.keys(prev || {}), ...Object.keys(current || {})]);
    const rowSummary: any = { Nama: name, MCU_ID: mcuId, changedCount: 0, significantCount: 0 };

    for (const keyName of allKeys) {
      if (!keyName || keyName.startsWith("_") || IGNORE_COMPARE_KEYS.has(keyName)) continue;

      const oldValue = prev ? prev[keyName] : "";
      const newValue = current[keyName];
      const oldCompare = compareValue(oldValue);
      const newCompare = compareValue(newValue);
      const changed = oldCompare !== newCompare;

      const oldNum = toNum(oldValue);
      const newNum = toNum(newValue);
      const numeric = Number.isFinite(oldNum) && Number.isFinite(newNum);
      const delta = numeric ? newNum - oldNum : null;
      const pct = numeric && oldNum !== 0 ? (delta! / oldNum) * 100 : null;
      const significant = changed && (pct === null ? true : Math.abs(pct) >= thresholdPct);

      if (changed) {
        rowSummary.changedCount += 1;
        if (significant) rowSummary.significantCount += 1;
        changedRows.push({
          Nama: name,
          MCU_ID: mcuId,
          Parameter: keyName,
          NilaiLama: cleanValue(oldValue),
          NilaiBaru: cleanValue(newValue),
          Delta: delta === null ? "" : Number(delta.toFixed(4)),
          PercentDelta: pct === null ? "" : Number(pct.toFixed(2)),
          Signifikan: significant ? "YES" : "NO",
          Status: numeric ? (delta! > 0 ? "Naik" : delta! < 0 ? "Turun" : "Stabil") : "Berubah",
        });
      }
    }

    comparisonRows.push(rowSummary);
  }

  changedRows.sort((a, b) => String(a.Nama).localeCompare(String(b.Nama)) || String(a.Parameter).localeCompare(String(b.Parameter)));
  return { comparisonRows, changedRows };
}

function normalizeEngineUrl() {
  return String(process.env.AI_MCU_ENGINE_URL || "").replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  try {
    const user = getSessionUser(req);
    if (!user) return fail("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    const sourceId = Number(body.sourceId || body.source_id || 0);
    const thresholdPct = Number(body.thresholdPct || 10);

    if (!Number.isFinite(sourceId) || sourceId <= 0) {
      return fail("sourceId wajib dipilih.");
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
      .select("id,participant_id,dataset_role,row_data,participant_name,mcu_id,nik,company_name,database_name,source_file_name,sheet_name,row_index,analysis_meta")
      .eq("source_id", sourceId)
      .order("id", { ascending: true });

    if (rowsResult.error) return fail(rowsResult.error.message, 500);

    const rows = rowsResult.data || [];
    const currentRows = rows
      .filter((r: any) => String(r.dataset_role || "new") === "new")
      .map((r: any) => ({ ...(r.row_data || {}), _import_id: r.id, _participant_id: r.participant_id }));
    const previousRows = rows
      .filter((r: any) => String(r.dataset_role || "") === "old")
      .map((r: any) => ({ ...(r.row_data || {}), _import_id: r.id }));

    const localCompare = buildComparison(previousRows, currentRows, thresholdPct);

    let engineResult: any = null;
    const engineUrl = normalizeEngineUrl();
    if (engineUrl) {
      try {
        const res = await fetch(`${engineUrl}/analyze-mcu`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ currentRows, previousRows }),
        });
        engineResult = await res.json().catch(() => null);
      } catch (error: any) {
        engineResult = { ok: false, message: error?.message || "Python engine tidak bisa dihubungi." };
      }
    }

    return NextResponse.json({
      ok: true,
      source: sourceResult.data,
      summary: {
        totalCurrent: currentRows.length,
        totalPrevious: previousRows.length,
        changedParameters: localCompare.changedRows.length,
        participantsWithChanges: localCompare.comparisonRows.filter((r) => r.changedCount > 0).length,
        thresholdPct,
      },
      currentRows,
      previousRows,
      comparisonRows: localCompare.comparisonRows,
      changedRows: localCompare.changedRows,
      engineResult,
      diseaseRows: engineResult?.diseaseRows || engineResult?.conditions || engineResult?.conditionRows || engineResult?.data?.conditions || [],
      abnormalRows: engineResult?.abnormalRows || engineResult?.abnormal || engineResult?.data?.abnormalRows || [],
      priorityRows: engineResult?.priorityRows || engineResult?.priorities || engineResult?.data?.priorityRows || [],
    });
  } catch (error: any) {
    return fail(error?.message || "Analisis MCU gagal.", 500);
  }
}

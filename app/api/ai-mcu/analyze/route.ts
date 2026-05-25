"use server";

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

function clean(value: any) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text || ["null", "undefined", "nan"].includes(text.toLowerCase())) return "";
  return text;
}

function norm(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function toNumber(value: any) {
  const raw = clean(value).replace(/,/g, ".");
  const match = raw.match(/-?\d+(\.\d+)?/);
  if (!match) return NaN;
  return Number(match[0]);
}

function compareText(value: any) {
  const text = clean(value);
  if (!text) return "";
  const n = Number(text.replace(/,/g, "."));
  if (Number.isFinite(n)) return String(n);
  return text.replace(/\s+/g, " ").toLowerCase();
}

function rowKey(row: Record<string, any>) {
  return norm(
    row.MCU_ID ||
      row.NOMCU ||
      row["NO MCU"] ||
      row["NO.MCU"] ||
      row.NIK ||
      row["NIK/NRP/ID"] ||
      row.NAMA ||
      row.Nama
  );
}

function rowName(row: Record<string, any>) {
  return clean(row.NAMA || row.Nama || row.name || row.participant_name || row.NAMA_PESERTA);
}

function rowMcuId(row: Record<string, any>) {
  return clean(row.MCU_ID || row.NOMCU || row["NO MCU"] || row["NO.MCU"] || row.mcu_id);
}

const IGNORE_KEYS = new Set([
  "NO",
  "NOMCU",
  "NO MCU",
  "NO.MCU",
  "MCU_ID",
  "NAMA",
  "Nama",
  "name",
  "NIK",
  "NIK/NRP/ID",
  "DATABASE_NAME",
  "PROGRAM_TYPE",
  "Nama PT",
  "Perusahaan",
  "_AI_MCU_FIELD_MAPPING",
  "_import_id",
  "_participant_id",
  "_SheetName",
  "_RowIndex",
]);

function comparableKeys(previousRows: any[], currentRows: any[]) {
  const keys = new Set<string>();

  for (const row of [...(previousRows || []), ...(currentRows || [])]) {
    for (const key of Object.keys(row || {})) {
      if (!key || key.startsWith("_") || IGNORE_KEYS.has(key)) continue;
      keys.add(key);
    }
  }

  return Array.from(keys).sort((a, b) => {
    const preferred = ["DEPT", "DEPARTEMEN", "PAKET", "KATEGORI", "KESIMPULAN", "SARAN", "JK", "TGLLAHIR", "USIA"];
    const ia = preferred.indexOf(a);
    const ib = preferred.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia >= 0 ? ia : 999) - (ib >= 0 ? ib : 999);
    return a.localeCompare(b);
  });
}

function buildComparison(previousRows: any[], currentRows: any[], thresholdPct = 10) {
  const oldMap = new Map<string, Record<string, any>>();

  for (const oldRow of previousRows || []) {
    const key = rowKey(oldRow);
    if (key && !oldMap.has(key)) oldMap.set(key, oldRow);
  }

  const keys = comparableKeys(previousRows, currentRows);
  const comparisonAll: any[] = [];
  const comparisonChanged: any[] = [];
  const comparisonSignif: any[] = [];
  const changedLong: any[] = [];

  for (const current of currentRows || []) {
    const key = rowKey(current);
    const oldRow = key ? oldMap.get(key) : undefined;

    const name = rowName(current) || rowName(oldRow || {});
    const mcuId = rowMcuId(current) || rowMcuId(oldRow || {});

    const wide: any = {
      Nama: name,
      MCU_ID: mcuId,
    };

    let changedCount = 0;
    let significantCount = 0;

    for (const param of keys) {
      const oldValue = oldRow ? oldRow[param] : "";
      const newValue = current[param];

      const oldClean = clean(oldValue);
      const newClean = clean(newValue);

      const oldCompare = compareText(oldValue);
      const newCompare = compareText(newValue);
      const changed = oldCompare !== newCompare;

      const oldNum = toNumber(oldValue);
      const newNum = toNumber(newValue);
      const numeric = Number.isFinite(oldNum) && Number.isFinite(newNum);

      const delta = numeric ? newNum - oldNum : null;
      const pct = numeric && oldNum !== 0 ? (delta! / oldNum) * 100 : null;

      const significant = changed && (pct === null ? true : Math.abs(pct) >= thresholdPct);
      const status = !changed ? "Stabil" : numeric ? (delta! > 0 ? "Naik" : delta! < 0 ? "Turun" : "Stabil") : "Berubah";

      wide[`${param} (Lalu)`] = oldClean;
      wide[`${param} (Ini)`] = newClean;
      wide[`${param} Δ`] = delta === null ? (changed ? "Berubah" : "Stabil") : Number(delta.toFixed(4));
      wide[`${param} %Δ`] = pct === null ? "" : Number(pct.toFixed(2));
      wide[`${param} Status`] = status;
      wide[`${param} Signifikan`] = significant ? "YES" : "NO";

      if (changed) {
        changedCount += 1;
        if (significant) significantCount += 1;

        changedLong.push({
          Nama: name,
          MCU_ID: mcuId,
          Parameter: param,
          "Nilai Lalu": oldClean,
          "Nilai Ini": newClean,
          "Δ": wide[`${param} Δ`],
          "%Δ": wide[`${param} %Δ`],
          Status: status,
          Signifikan: significant ? "YES" : "NO",
        });
      }
    }

    wide.__changedCount = changedCount;
    wide.__significantCount = significantCount;

    comparisonAll.push(wide);
    if (changedCount > 0) comparisonChanged.push(wide);
    if (significantCount > 0) comparisonSignif.push(wide);
  }

  return {
    comparisonAll,
    comparisonChanged,
    comparisonSignif,
    changedLong,
    parameterCount: keys.length,
  };
}

function normalizeEngineUrl() {
  return String(process.env.AI_MCU_ENGINE_URL || "").replace(/\/$/, "");
}

function normalizeStatus(value: any, fallback = "") {
  const raw = clean(value || fallback);
  const lower = raw.toLowerCase();

  if (lower.includes("data") && (lower.includes("tidak") || lower.includes("no") || lower.includes("missing"))) {
    return "Data tidak ada";
  }

  if (lower.includes("tidak") || lower.includes("not detected") || lower === "false" || lower === "normal") {
    return "Tidak terdeteksi";
  }

  if (lower.includes("terdeteksi") || lower.includes("detected") || lower === "true" || lower === "abnormal") {
    return "Terdeteksi";
  }

  return raw || "Data tidak ada";
}

function normalizeSeverity(value: any) {
  const raw = clean(value);
  if (!raw) return "";
  const lower = raw.toLowerCase();

  if (lower.includes("tinggi") || lower.includes("high") || lower.includes("berat")) return "Tinggi";
  if (lower.includes("sedang") || lower.includes("medium") || lower.includes("moderate")) return "Sedang";
  if (lower.includes("rendah") || lower.includes("low") || lower.includes("ringan")) return "Rendah";

  return raw;
}

function getAny(obj: any, keys: string[]) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return "";
}

function asArray(value: any) {
  return Array.isArray(value) ? value : [];
}

function collectArrays(obj: any, names: string[], out: any[] = [], depth = 0) {
  if (!obj || depth > 5) return out;

  if (Array.isArray(obj)) {
    for (const item of obj) collectArrays(item, names, out, depth + 1);
    return out;
  }

  if (typeof obj !== "object") return out;

  for (const name of names) {
    const value = obj[name];
    if (Array.isArray(value)) out.push(value);
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") collectArrays(value, names, out, depth + 1);
  }

  return out;
}

function normalizeDiseaseRow(row: any, parent: any = {}) {
  const name = clean(
    getAny(row, ["Nama", "NAMA", "name", "participantName", "participant_name"]) ||
      getAny(parent, ["Nama", "NAMA", "name", "participantName", "participant_name"])
  );

  const mcuId = clean(
    getAny(row, ["MCU_ID", "NOMCU", "No MCU", "mcu_id", "participantId", "participant_id"]) ||
      getAny(parent, ["MCU_ID", "NOMCU", "No MCU", "mcu_id", "participantId", "participant_id"])
  );

  const condition = clean(
    getAny(row, ["Condition", "condition", "Penyakit", "penyakit", "disease", "diagnosis", "name", "rule_name", "title"])
  );

  const detectedRaw = getAny(row, ["Status", "status", "detected", "isDetected", "hasil", "result", "rule_status"]);
  const status = normalizeStatus(detectedRaw, condition ? "Terdeteksi" : "Data tidak ada");

  const severity = normalizeSeverity(getAny(row, ["Severity", "severity", "Level", "level", "risk", "Kategori", "kategori"]));
  const score = getAny(row, ["Score", "score", "nilai", "points"]);
  const evidence = clean(getAny(row, ["Evidence", "evidence", "Alasan", "alasan", "detail", "details", "temuan", "reason"]));
  const nextStep = clean(getAny(row, ["NextStep", "nextStep", "next_step", "Saran", "saran", "recommendation", "rekomendasi", "action"]));

  return {
    Nama: name,
    MCU_ID: mcuId,
    Condition: condition || "-",
    Status: status,
    Severity: severity || "-",
    Score: score === undefined || score === null ? "" : score,
    Evidence: evidence || "-",
    NextStep: nextStep || "-",
    _raw: row,
  };
}

function normalizeDiseaseRows(engineResult: any) {
  const candidateNames = [
    "Interpretasi_Penyakit",
    "interpretasiPenyakit",
    "diseaseRows",
    "diseases",
    "conditionRows",
    "conditions",
    "allConditions",
    "all_conditions",
    "ruleBasedRows",
    "rule_based_rows",
    "ruleResults",
    "interpretationRows",
    "diseaseInterpretation",
    "disease_interpretation",
  ];

  const directArrays = collectArrays(engineResult, candidateNames);
  let rows: any[] = [];

  for (const arr of directArrays) {
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;

      const nested = candidateNames
        .map((key) => item[key])
        .find((value) => Array.isArray(value));

      if (Array.isArray(nested)) {
        rows.push(...nested.map((child) => normalizeDiseaseRow(child, item)));
      } else {
        rows.push(normalizeDiseaseRow(item));
      }
    }
  }

  if (!rows.length) {
    const analyses = [
      ...asArray(engineResult?.analyses),
      ...asArray(engineResult?.analysis),
      ...asArray(engineResult?.data?.analyses),
      ...asArray(engineResult?.results),
      ...asArray(engineResult?.data?.results),
    ];

    for (const item of analyses) {
      const nested = candidateNames
        .map((key) => item?.[key])
        .find((value) => Array.isArray(value));

      if (Array.isArray(nested)) {
        rows.push(...nested.map((child) => normalizeDiseaseRow(child, item)));
      } else if (item && typeof item === "object" && (item.condition || item.Condition || item.disease || item.Penyakit)) {
        rows.push(normalizeDiseaseRow(item));
      }
    }
  }

  const seen = new Set<string>();
  rows = rows.filter((row) => {
    const key = `${row.Nama}|${row.MCU_ID}|${row.Condition}|${row.Status}|${row.Evidence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return row.Condition && row.Condition !== "-";
  });

  return rows;
}

function collectEngineRows(engineResult: any, keys: string[]) {
  const arrays = collectArrays(engineResult, keys);
  if (arrays.length) return arrays[0];
  return [];
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
      .map((r: any) => ({
        ...(r.row_data || {}),
        _import_id: r.id,
        _participant_id: r.participant_id,
      }));

    const previousRows = rows
      .filter((r: any) => String(r.dataset_role || "") === "old")
      .map((r: any) => ({
        ...(r.row_data || {}),
        _import_id: r.id,
      }));

    const comparison = buildComparison(previousRows, currentRows, thresholdPct);

    let engineResult: any = null;
    const engineUrl = normalizeEngineUrl();

    if (engineUrl) {
      try {
        const res = await fetch(`${engineUrl}/analyze-mcu`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            currentRows,
            previousRows,
            includeAllRuleStatuses: true,
            outputMode: "streamlit_rule_based",
          }),
        });

        engineResult = await res.json().catch(() => null);
      } catch (error: any) {
        engineResult = {
          ok: false,
          message: error?.message || "Python engine tidak bisa dihubungi.",
        };
      }
    }

    const abnormalRows = collectEngineRows(engineResult, ["abnormalRows", "abnormal", "abnormal_summary", "Abnormal_Summary"]);
    const diseaseRows = normalizeDiseaseRows(engineResult);
    const priorityRows = collectEngineRows(engineResult, ["priorityRows", "priorities", "priority", "Prioritas"]);

    return NextResponse.json({
      ok: true,
      source: sourceResult.data,
      summary: {
        totalCurrent: currentRows.length,
        totalPrevious: previousRows.length,
        parameterCount: comparison.parameterCount,
        comparisonAll: comparison.comparisonAll.length,
        comparisonChanged: comparison.comparisonChanged.length,
        comparisonSignif: comparison.comparisonSignif.length,
        changedParameters: comparison.changedLong.length,
        thresholdPct,
        engineOk: Boolean(engineResult?.ok),
        diseaseRows: diseaseRows.length,
        diseaseDetected: diseaseRows.filter((r) => r.Status === "Terdeteksi").length,
      },
      Rekap_Analisis: currentRows,
      Abnormal_Summary: abnormalRows,
      Perbandingan_All: comparison.comparisonAll,
      Perbandingan_Changed: comparison.comparisonChanged,
      Perbandingan_Signif: comparison.comparisonSignif,
      Perbandingan_Long: comparison.changedLong,
      Interpretasi_Penyakit: diseaseRows,
      Prioritas: priorityRows,
      previousRows,
      engineResult,
    });
  } catch (error: any) {
    return fail(error?.message || "Analisis MCU gagal.", 500);
  }
}

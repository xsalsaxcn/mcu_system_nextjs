import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || ["null", "undefined", "nan", "-", "—"].includes(text.toLowerCase())) return "";
  return text;
}

function isObject(value: any) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function applyMapping(rowData: Record<string, any>, fieldMapping: Record<string, any>) {
  const out: Record<string, any> = { ...(rowData || {}) };

  if (!isObject(fieldMapping)) return out;

  for (const [target, source] of Object.entries(fieldMapping)) {
    const targetKey = clean(target);
    const sourceKey = clean(source);

    if (!targetKey || !sourceKey) continue;
    if (Object.prototype.hasOwnProperty.call(rowData || {}, sourceKey) && clean(rowData[sourceKey])) {
      out[targetKey] = rowData[sourceKey];
    }
  }

  return out;
}

function firstMapping(rows: any[]) {
  for (const row of rows || []) {
    if (isObject(row.field_mapping) && Object.keys(row.field_mapping).length) return row.field_mapping;
    if (isObject(row.row_data?._AI_MCU_FIELD_MAPPING) && Object.keys(row.row_data._AI_MCU_FIELD_MAPPING).length) {
      return row.row_data._AI_MCU_FIELD_MAPPING;
    }
  }

  return {};
}

function combinedText(row: Record<string, any>) {
  return [
    row.FIT_STATUS,
    row.KATEGORI,
    row.Kesimpulan,
    row.KESIMPULAN,
    row.SARAN,
    row.Saran,
    row.THORAX,
    row.EKG,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function deriveFitStatus(row: Record<string, any>) {
  const raw = `${clean(row.FIT_STATUS)} ${clean(row.KATEGORI)}`.toLowerCase();
  if (raw.includes("unfit") || raw.includes("tidak fit")) return "UNFIT";
  if (raw.includes("fit with note") || raw.includes("fit with notes") || raw.includes("fit note")) return "FIT WITH NOTE";
  if (/\bfit\b/.test(raw) && !raw.includes("unfit")) return "FIT";

  const text = combinedText(row);

  if (hasAny(text, ["unfit", "tidak fit", "urgent", "segera", "rujuk", "rujukan", "berat", "grade 2", "grade ii"])) {
    return "UNFIT";
  }

  if (
    hasAny(text, [
      "underweight",
      "overweight",
      "obesitas",
      "hipertensi",
      "prehipertensi",
      "diabetes",
      "kolesterol",
      "hyperchol",
      "dislipidemia",
      "asam urat",
      "sgot",
      "sgpt",
      "anemia",
      "myopia",
      "miopia",
      "visus",
      "gigi berlubang",
      "karies",
      "leukosituria",
      "isk",
    ])
  ) {
    return "FIT WITH NOTE";
  }

  if (hasAny(text, ["tidak ditemukan kelainan", "dalam batas normal", "normal"])) return "FIT";

  if (clean(row.KESIMPULAN) || clean(row.Kesimpulan) || clean(row.SARAN) || clean(row.Saran)) return "FIT WITH NOTE";

  return "";
}

function deriveSeverity(row: Record<string, any>) {
  const text = combinedText(row);

  if (hasAny(text, ["unfit", "urgent", "segera", "rujuk", "rujukan", "berat", "grade 2", "grade ii"])) return "BERAT";
  if (hasAny(text, ["hipertensi", "diabetes", "kolesterol", "dislipidemia", "sgot", "sgpt", "anemia", "leukosituria", "isk"])) return "SEDANG";
  if (hasAny(text, ["underweight", "overweight", "obesitas", "myopia", "miopia", "gigi", "karies"])) return "RINGAN";
  return "NORMAL";
}

export async function POST(req: NextRequest) {
  try {
    const user = getSessionUser(req);
    if (!user) return fail("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    const sourceId = Number(body.sourceId || body.source_id || 0);
    const targetKey = clean(body.targetKey) || "FIT_STATUS_AUTO";
    const modelName = clean(body.modelName) || "fit_status_auto";
    const minRows = Number(body.minRows || 20);

    if (!Number.isFinite(sourceId) || sourceId <= 0) return fail("sourceId wajib dipilih.");

    const engineUrl = clean(process.env.AI_MCU_ENGINE_URL);
    if (!engineUrl) return fail("AI_MCU_ENGINE_URL belum diset di Vercel.");

    const supabase = getSupabaseAdmin();

    const rowsResult = await supabase
      .from("ai_mcu_import_rows")
      .select("id,source_id,participant_id,dataset_role,row_data,field_mapping,participant_name,mcu_id,nik")
      .eq("source_id", sourceId)
      .order("id", { ascending: true });

    if (rowsResult.error) return fail(rowsResult.error.message, 500);

    const rows = rowsResult.data || [];
    const globalMapping = firstMapping(rows);

    const preparedRows = rows.map((row: any) => {
      const rowMapping = isObject(row.field_mapping) && Object.keys(row.field_mapping).length ? row.field_mapping : globalMapping;
      const flat = applyMapping(row.row_data || {}, rowMapping);

      flat.NAMA = clean(flat.NAMA) || clean(flat.Nama) || clean(row.participant_name);
      flat.MCU_ID = clean(flat.MCU_ID) || clean(flat.NOMCU) || clean(flat["NO MCU"]) || clean(row.mcu_id) || String(row.id);
      flat.NIK = clean(flat.NIK) || clean(row.nik);
      flat.FIT_STATUS_AUTO = deriveFitStatus(flat);
      flat.SEVERITY_AUTO = deriveSeverity(flat);
      flat._field_mapping = rowMapping;
      flat._import_row_id = row.id;
      flat._dataset_role = row.dataset_role;

      return flat;
    });

    const labeledRows = preparedRows.filter((row: any) => {
      if (targetKey === "FIT_STATUS_AUTO" || targetKey === "AUTO_FIT_STATUS") return clean(row.FIT_STATUS_AUTO);
      if (targetKey === "SEVERITY_AUTO" || targetKey === "AUTO_SEVERITY") return clean(row.SEVERITY_AUTO);
      if (targetKey === "CONDITION_LABELS_AUTO" || targetKey === "AUTO_CONDITION_LABELS") return true;
      return clean(row[targetKey]);
    });

    if (labeledRows.length < minRows) {
      return fail(`Data berlabel ${targetKey} belum cukup. Tersedia ${labeledRows.length}, minimal ${minRows}.`, 400, {
        sourceId,
        targetKey,
        totalRows: rows.length,
        labeledRows: labeledRows.length,
      });
    }

    const engineRes = await fetch(`${engineUrl.replace(/\/$/, "")}/train-ai-mcu-ml`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: labeledRows,
        targetKey,
        modelName,
        minRows,
      }),
    });

    const engineJson = await engineRes.json().catch(() => ({
      ok: false,
      message: "Response Python engine bukan JSON.",
    }));

    if (!engineRes.ok || !engineJson.ok) {
      return fail(engineJson.message || "Training ML gagal di Python engine.", 500, {
        engineStatus: engineRes.status,
        engineResponse: engineJson,
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Training ML berhasil.",
      sourceId,
      totalRows: rows.length,
      labeledRows: labeledRows.length,
      engine: engineJson,
    });
  } catch (error: any) {
    return fail(error?.message || "Training ML gagal.", 500);
  }
}

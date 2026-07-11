import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  CORPORATE_PDF_SECTIONS,
  cleanCellValue,
  parameterCategory,
  sectionHasImage,
  sectionHasText,
} from "@/lib/shared/corporatePdf";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const sourceId = Number(body.sourceId);
  const requestedIds = Array.isArray(body.participantIds)
    ? body.participantIds.map(Number).filter((id: number) => Number.isFinite(id) && id > 0)
    : [];

  if (!sourceId) return fail("Database MCU Corporate wajib dipilih.");

  const supabase = getSupabaseAdmin();
  const sourceRes = await supabase
    .from("participant_sources")
    .select("id,name,institution_name,program_type")
    .eq("id", sourceId)
    .maybeSingle();

  if (sourceRes.error) return fail(sourceRes.error.message, 500);
  if (!sourceRes.data) return fail("Database tidak ditemukan.", 404);
  if (String(sourceRes.data.program_type || "").toLowerCase() !== "corporate") {
    return fail("Endpoint ini hanya untuk database MCU Corporate.", 403);
  }

  let participantQuery = supabase
    .from("participants")
    .select("id,name,mcu_id,external_id,barcode_value")
    .eq("source_id", sourceId)
    .eq("program_type", "corporate")
    .limit(2000);

  if (requestedIds.length) participantQuery = participantQuery.in("id", requestedIds);
  const participantRes = await participantQuery;
  if (participantRes.error) return fail(participantRes.error.message, 500);

  const participants = participantRes.data || [];
  const participantIds = participants.map((item: any) => Number(item.id));
  if (!participantIds.length) {
    return NextResponse.json({ ok: true, total: 0, sections: [], parameters: [] });
  }

  const importRes = await supabase
    .from("ai_mcu_import_rows")
    .select("id,participant_id,row_data")
    .in("participant_id", participantIds)
    .order("id", { ascending: true });

  if (importRes.error) return fail(importRes.error.message, 500);

  const rowMap = new Map<number, Record<string, unknown>>();
  for (const item of importRes.data || []) {
    const id = Number(item.participant_id);
    if (!rowMap.has(id) && item.row_data && typeof item.row_data === "object") {
      rowMap.set(id, item.row_data as Record<string, unknown>);
    }
  }

  const sectionCounts: Record<string, number> = Object.fromEntries(
    CORPORATE_PDF_SECTIONS.map((item) => [item.code, 0])
  );
  const parameterCounts = new Map<string, { key: string; count: number; category: string }>();

  for (const participant of participants) {
    const row = rowMap.get(Number(participant.id)) || {};
    sectionCounts.COVER += 1;
    sectionCounts.CONCLUSION += 1;

    const keys = Object.keys(row);
    if (keys.some((key) => parameterCategory(key) === "physical" && cleanCellValue(row[key]))) sectionCounts.PHYSICAL += 1;
    if (keys.some((key) => parameterCategory(key) === "lab" && cleanCellValue(row[key]))) sectionCounts.LAB += 1;

    if (sectionHasImage(row, "PROFILE_PHOTO")) sectionCounts.PROFILE_PHOTO += 1;
    for (const code of ["XRAY_THORAX", "EKG", "TREADMILL", "SPIROMETRY", "AUDIOMETRY", "USG"]) {
      if (sectionHasText(row, code)) sectionCounts[code] += 1;
    }
    for (const code of ["XRAY_THORAX_IMAGE", "EKG_IMAGE", "TREADMILL_IMAGE", "SPIROMETRY_IMAGE", "AUDIOMETRY_IMAGE", "USG_IMAGE"]) {
      if (sectionHasImage(row, code)) sectionCounts[code] += 1;
    }

    for (const [key, value] of Object.entries(row)) {
      if (!cleanCellValue(value)) continue;
      const current = parameterCounts.get(key) || { key, count: 0, category: parameterCategory(key) };
      current.count += 1;
      parameterCounts.set(key, current);
    }
  }

  const total = participants.length;
  const sections = CORPORATE_PDF_SECTIONS.map((item) => ({
    ...item,
    available: sectionCounts[item.code] || 0,
    total,
  }));

  const categoryOrder: Record<string, number> = {
    identity: 0,
    summary: 1,
    physical: 2,
    lab: 3,
    support: 4,
    attachment: 5,
    other: 6,
  };

  const parameters = Array.from(parameterCounts.values()).sort((a, b) => {
    const cat = (categoryOrder[a.category] ?? 99) - (categoryOrder[b.category] ?? 99);
    return cat || a.key.localeCompare(b.key, "id");
  });

  return NextResponse.json({
    ok: true,
    source: sourceRes.data,
    total,
    importedRows: rowMap.size,
    sections,
    parameters,
  });
}

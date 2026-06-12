import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

export const runtime = "nodejs";

type Patch = Record<string, any>;

function isColumnMissingError(error: any) {
  const msg = String(error?.message || error || "").toLowerCase();
  return msg.includes("column") || msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("could not find");
}

async function applyPrintStatusPatch(supabase: any, ids: number[], printed: boolean) {
  const uniqueIds = Array.from(new Set((ids || []).map(Number).filter(Boolean)));
  if (!uniqueIds.length) return { applied: [], ignored: [] };

  const labelText = printed ? "Sudah print" : "Belum print";
  const patches: Patch[] = printed
    ? [
        { label_printed: true },
        { is_label_printed: true },
        { printed_label: true },
        { label_print_status: labelText },
        { print_label_status: labelText },
        { label_status: labelText },
        { print_status: labelText },
        { label_printed_at: new Date().toISOString() },
        { printed_at: new Date().toISOString() },
        { label_print_at: new Date().toISOString() },
      ]
    : [
        { label_printed: false },
        { is_label_printed: false },
        { printed_label: false },
        { label_print_status: labelText },
        { print_label_status: labelText },
        { label_status: labelText },
        { print_status: labelText },
        { label_printed_at: null },
        { printed_at: null },
        { label_print_at: null },
        { label_printed_by: null },
        { printed_by: null },
        { label_print_count: printed ? 1 : 0 },
        { print_count: printed ? 1 : 0 },
        { barcode_created_at: printed ? new Date().toISOString() : null },
        { barcode_image_path: printed ? undefined : null },
      ];

  const applied: string[] = [];
  const ignored: string[] = [];

  for (const patch of patches) {
    const cleanPatch: Patch = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) cleanPatch[key] = value;
    }
    const keys = Object.keys(cleanPatch);
    if (!keys.length) continue;

    try {
      const { error } = await supabase
        .from("participants")
        .update(cleanPatch)
        .in("id", uniqueIds);

      if (error) {
        if (isColumnMissingError(error)) {
          ignored.push(keys.join(","));
          continue;
        }
        return { applied, ignored, error: error.message || String(error) };
      }
      applied.push(keys.join(","));
    } catch (err: any) {
      ignored.push(keys.join(","));
    }
  }

  return { applied, ignored };
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const printed = Boolean(body.printed);
  let ids = Array.isArray(body.participant_ids)
    ? body.participant_ids.map(Number).filter(Boolean)
    : [];

  const sourceId = Number(body.source_id || 0);
  const programType = String(body.program_type || "").trim();

  const supabase = getSupabaseAdmin();

  if (!ids.length && sourceId) {
    let query = supabase.from("participants").select("id").eq("source_id", sourceId).limit(5000);
    if (programType) query = query.eq("program_type", programType);
    const { data, error } = await query;
    if (error) return fail(error.message, 500);
    ids = (data || []).map((row: any) => Number(row.id)).filter(Boolean);
  }

  if (!ids.length) return fail("Tidak ada peserta yang dipilih.");

  const result = await applyPrintStatusPatch(supabase, ids, printed);
  if ((result as any).error) return fail((result as any).error, 500);

  return ok({
    updated_count: ids.length,
    participant_ids: ids,
    printed,
    applied_fields: result.applied,
    ignored_fields: result.ignored,
  });
}

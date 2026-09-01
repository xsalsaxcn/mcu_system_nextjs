import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseIds(value: any) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((x: any) => Number(x))
        .filter((x: number) => Number.isFinite(x) && x > 0)
    )
  );
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const ids = parseIds(body?.ids || body?.participantIds || body?.selectedIds);

  if (!ids.length) return fail("Tidak ada peserta yang dipilih.");

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const printedBy = user.username || user.role || "admin";

  const { data: rows, error: selectError } = await supabase
    .from("participants")
    .select("id,label_print_count")
    .in("id", ids);

  if (selectError) return fail(selectError.message, 500);

  let updated = 0;
  for (const row of rows || []) {
    const { error } = await supabase
      .from("participants")
      .update({
        label_printed_at: now,
        label_printed_by: printedBy,
        label_print_count: Number(row.label_print_count || 0) + 1
      })
      .eq("id", row.id);

    if (error) return fail(error.message, 500);
    updated += 1;
  }

  return ok({ updated, requested: ids.length, ids, printed_at: now });
}

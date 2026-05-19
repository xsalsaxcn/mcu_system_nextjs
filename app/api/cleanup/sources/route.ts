import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

function chunkArray<T>(arr: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const supabase = getSupabaseAdmin();
  const program = req.nextUrl.searchParams.get("program") || "all";

  let query = supabase.from("participant_sources").select("*").order("created_at", { ascending: false });
  if (program !== "all") query = query.eq("program_type", program);

  const { data: sources, error } = await query;
  if (error) return fail(error.message, 500);

  const rows = [];
  for (const source of sources || []) {
    const { count: participantCount, error: participantError } = await supabase
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("source_id", source.id);

    if (participantError) return fail(participantError.message, 500);
    rows.push({ ...source, participants_count: participantCount || 0 });
  }

  return ok({ sources: rows });
}

export async function DELETE(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const sourceId = Number(body.source_id);
  const confirm = String(body.confirm || "").trim().toUpperCase();

  if (!sourceId) return fail("source_id wajib.");
  if (confirm !== "HAPUS") return fail("Konfirmasi salah. Ketik HAPUS.");

  const supabase = getSupabaseAdmin();

  const { data: source, error: sourceError } = await supabase
    .from("participant_sources")
    .select("*")
    .eq("id", sourceId)
    .maybeSingle();

  if (sourceError) return fail(sourceError.message, 500);
  if (!source) return fail("Database/source tidak ditemukan.", 404);

  const { data: participants, error: participantError } = await supabase
    .from("participants")
    .select("id")
    .eq("source_id", sourceId);

  if (participantError) return fail(participantError.message, 500);

  const participantIds = (participants || []).map((p: any) => p.id);
  const chunks = chunkArray(participantIds, 500);

  let deletedReviews = 0;
  let deletedResults = 0;
  let deletedAudit = 0;
  let deletedParticipants = 0;

  for (const chunk of chunks) {
    if (!chunk.length) continue;

    const reviewRes = await supabase.from("participant_reviews").delete({ count: "exact" }).in("participant_id", chunk);
    if (reviewRes.error) return fail(reviewRes.error.message, 500);
    deletedReviews += reviewRes.count || 0;

    const resultRes = await supabase.from("examination_results").delete({ count: "exact" }).in("participant_id", chunk);
    if (resultRes.error) return fail(resultRes.error.message, 500);
    deletedResults += resultRes.count || 0;

    const auditRes = await supabase.from("audit_logs").delete({ count: "exact" }).in("participant_id", chunk);
    if (auditRes.error) return fail(auditRes.error.message, 500);
    deletedAudit += auditRes.count || 0;

    const participantRes = await supabase.from("participants").delete({ count: "exact" }).in("id", chunk);
    if (participantRes.error) return fail(participantRes.error.message, 500);
    deletedParticipants += participantRes.count || 0;
  }

  const sourceDelete = await supabase.from("participant_sources").delete({ count: "exact" }).eq("id", sourceId);
  if (sourceDelete.error) return fail(sourceDelete.error.message, 500);

  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "DELETE_DATABASE_SOURCE",
    participant_id: null,
    parameter_id: null,
    old_value: source.name,
    new_value: `source_id=${sourceId}; participants=${deletedParticipants}; results=${deletedResults}; reviews=${deletedReviews}; audits=${deletedAudit}`
  });

  return ok({
    deleted: {
      source: sourceDelete.count || 0,
      participants: deletedParticipants,
      examination_results: deletedResults,
      participant_reviews: deletedReviews,
      audit_logs: deletedAudit
    }
  });
}

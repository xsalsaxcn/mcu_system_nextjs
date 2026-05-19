import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { computeStagesForParticipant } from "@/lib/server/progress";
import { fail, ok } from "@/lib/server/response";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const supabase = getSupabaseAdmin();
  const program = req.nextUrl.searchParams.get("program") || user.program_type || "capaska";
  const sourceId = req.nextUrl.searchParams.get("source_id");
  const status = req.nextUrl.searchParams.get("status") || "Semua";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 150), 300);

  let query = supabase
    .from("participants")
    .select("*")
    .order("id", { ascending: false })
    .limit(limit);

  if (program !== "all") query = query.eq("program_type", program);
  if (sourceId && sourceId !== "all") query = query.eq("source_id", Number(sourceId));

  const { data: participants, error } = await query;
  if (error) return fail(error.message, 500);

  const participantRows = participants || [];
  const participantIds = participantRows.map((p: any) => p.id);
  const packageIds = [...new Set(participantRows.map((p: any) => p.package_id).filter(Boolean))];

  const [packageParameters, parameters, posts, results, packages, sources] = await Promise.all([
    packageIds.length ? supabase.from("package_parameters").select("*").in("package_id", packageIds) : Promise.resolve({ data: [] }),
    supabase.from("parameters").select("*").eq("is_active", 1),
    supabase.from("posts").select("*"),
    participantIds.length ? supabase.from("examination_results").select("*").in("participant_id", participantIds) : Promise.resolve({ data: [] }),
    supabase.from("packages").select("id,name"),
    supabase.from("participant_sources").select("id,name,institution_name")
  ]);

  const packageName = new Map((packages.data || []).map((p: any) => [p.id, p.name]));
  const sourceName = new Map((sources.data || []).map((s: any) => [s.id, s.name]));

  const rows = participantRows.map((p: any) => {
    const stages = computeStagesForParticipant(
      p.id,
      p.package_id,
      packageParameters.data || [],
      parameters.data || [],
      posts.data || [],
      results.data || []
    );

    const done = stages.filter((s) => s.is_done).length;
    const total = stages.length;
    const complete = total > 0 && done >= total;

    return {
      participant_id: p.id,
      name: p.name,
      mcu_id: p.mcu_id,
      external_id: p.external_id,
      province: p.province,
      source_name: sourceName.get(p.source_id) || "-",
      package_name: packageName.get(p.package_id) || "-",
      mcu_date: p.mcu_date || p.service_date || "-",
      status_pemeriksaan: complete ? "Selesai" : "Belum Selesai",
      done_stage: done,
      total_stage: total,
      progress_percent: total ? Math.round((done / total) * 1000) / 10 : 0,
      stages
    };
  });

  const filtered = rows.filter((r) => {
    if (status === "Selesai") return r.status_pemeriksaan === "Selesai";
    if (status === "Belum Selesai") return r.status_pemeriksaan !== "Selesai";
    return true;
  });

  return ok({
    summary: {
      total: rows.length,
      selesai: rows.filter((r) => r.status_pemeriksaan === "Selesai").length,
      belum_selesai: rows.filter((r) => r.status_pemeriksaan !== "Selesai").length,
      rata_rata: rows.length ? Math.round((rows.reduce((a, b) => a + b.progress_percent, 0) / rows.length) * 10) / 10 : 0
    },
    rows: filtered
  });
}

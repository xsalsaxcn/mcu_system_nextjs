import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { computeStagesForParticipant } from "@/lib/server/progress";
import { fail, ok } from "@/lib/server/response";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return fail("Missing participant id.");

  const supabase = getSupabaseAdmin();

  const { data: participant, error } = await supabase.from("participants").select("*").eq("id", id).maybeSingle();
  if (error) return fail(error.message, 500);
  if (!participant) return fail("Peserta tidak ditemukan.", 404);

  const [pkg, source, company, packageParameters, parameters, posts, results] = await Promise.all([
    participant.package_id ? supabase.from("packages").select("id,name").eq("id", participant.package_id).maybeSingle() : Promise.resolve({ data: null }),
    participant.source_id ? supabase.from("participant_sources").select("*").eq("id", participant.source_id).maybeSingle() : Promise.resolve({ data: null }),
    participant.company_id ? supabase.from("companies").select("id,name").eq("id", participant.company_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("package_parameters").select("*").eq("package_id", participant.package_id),
    supabase.from("parameters").select("*").eq("is_active", 1),
    supabase.from("posts").select("*"),
    supabase.from("examination_results").select("*").eq("participant_id", id)
  ]);

  const stages = computeStagesForParticipant(
    participant.id,
    participant.package_id,
    packageParameters.data || [],
    parameters.data || [],
    posts.data || [],
    results.data || []
  );

  return ok({
    participant: {
      ...participant,
      package_name: pkg.data?.name || "-",
      source_name: source.data?.name || "-",
      institution_name: source.data?.institution_name || "-",
      company_name: company.data?.name || "-"
    },
    stages
  });
}

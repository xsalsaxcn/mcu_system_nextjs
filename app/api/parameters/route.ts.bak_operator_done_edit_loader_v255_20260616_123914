import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const packageId = Number(req.nextUrl.searchParams.get("package_id"));
  const postId = Number(req.nextUrl.searchParams.get("post_id") || user.post_id);
  const participantId = Number(req.nextUrl.searchParams.get("participant_id"));

  if (!packageId || !postId) return fail("package_id dan post_id wajib.");

  if (user.role === "operator" && Number(user.post_id) !== postId) {
    return fail("Operator hanya boleh melihat parameter post sendiri.", 403);
  }

  const supabase = getSupabaseAdmin();

  const { data: mappings, error: mapError } = await supabase
    .from("package_parameters")
    .select("parameter_id")
    .eq("package_id", packageId);

  if (mapError) return fail(mapError.message, 500);

  const ids = (mappings || []).map((m: any) => m.parameter_id);

  if (!ids.length) return ok({ parameters: [] });

  const { data: params, error: paramError } = await supabase
    .from("parameters")
    .select("*")
    .in("id", ids)
    .eq("post_id", postId)
    .eq("is_active", 1)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (paramError) return fail(paramError.message, 500);

  let resultMap = new Map<number, string>();

  if (participantId) {
    const { data: results } = await supabase
      .from("examination_results")
      .select("parameter_id,value")
      .eq("participant_id", participantId);

    resultMap = new Map((results || []).map((r: any) => [r.parameter_id, r.value]));
  }

  const parameters = (params || []).map((p: any) => ({
    ...p,
    current_value: resultMap.get(p.id) || ""
  }));

  return ok({ parameters });
}

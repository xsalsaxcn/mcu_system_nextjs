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
  /* PARAMETERS_EDIT_VALUE_FALLBACK_V255
     Read-only edit loader fallback.
     Exact parameter_id wins. If old saved results use legacy parameter IDs,
     fill current_value by matching normalized parameter name + category + post. */
  let resultMap = new Map<number, string>();
  let fallbackByNameCategory = new Map<string, string>();
  let fallbackByName = new Map<string, string>();

  function paramFallbackKey(name: any, category: any) {
    const n = String(name || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s\n\r\t.,\-_\/\\><:;()]/g, "")
      .trim();
    const c = String(category || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s\n\r\t.,\-_\/\\><:;()]/g, "")
      .trim();
    return `${n}::${c}`;
  }

  function paramNameKey(name: any) {
    return String(name || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s\n\r\t.,\-_\/\\><:;()]/g, "")
      .trim();
  }

  if (participantId) {
    const { data: results } = await supabase
      .from("examination_results")
      .select("parameter_id,value,input_post_id")
      .eq("participant_id", participantId);

    resultMap = new Map((results || []).map((r: any) => [Number(r.parameter_id), String(r.value ?? "")]));

    const savedParamIds = Array.from(new Set((results || []).map((r: any) => Number(r.parameter_id)).filter(Boolean)));
    const { data: savedParams } = savedParamIds.length
      ? await supabase.from("parameters").select("id,name,category,post_id").in("id", savedParamIds)
      : { data: [] } as any;

    const savedParamById = new Map<number, any>((savedParams || []).map((p: any) => [Number(p.id), p]));

    for (const row of results || []) {
      const value = String(row?.value ?? "").trim();
      if (!value) continue;
      const savedParam = savedParamById.get(Number(row?.parameter_id));
      if (!savedParam) continue;

      const savedPostId = Number(savedParam.post_id || row?.input_post_id || 0);
      if (savedPostId && savedPostId !== Number(postId)) continue;

      const key = paramFallbackKey(savedParam.name, savedParam.category);
      if (key && !fallbackByNameCategory.has(key)) fallbackByNameCategory.set(key, value);

      const nameKey = paramNameKey(savedParam.name);
      if (nameKey && !fallbackByName.has(nameKey)) fallbackByName.set(nameKey, value);
    }
  }

  const parameters = (params || []).map((p: any) => {
    const exact = resultMap.get(Number(p.id));
    const fallback = fallbackByNameCategory.get(paramFallbackKey(p.name, p.category)) || fallbackByName.get(paramNameKey(p.name)) || "";
    return {
      ...p,
      current_value: exact !== undefined && exact !== null && String(exact).trim() !== "" ? exact : fallback
    };
  });

  return ok({ parameters });
}

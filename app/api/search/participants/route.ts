import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const supabase = getSupabaseAdmin();
  const keyword = String(req.nextUrl.searchParams.get("keyword") || "").trim();
  const program = req.nextUrl.searchParams.get("program") || user.program_type || "capaska";
  const sourceId = req.nextUrl.searchParams.get("source_id");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 50), 100);

  if (!keyword) return ok({ participants: [] });

  const escaped = keyword.replace(/,/g, " ");
  const like = `%${escaped}%`;

  let query = supabase
    .from("participants")
    .select("*")
    .or(`name.ilike.${like},mcu_id.ilike.${like},external_id.ilike.${like},nik.ilike.${like},barcode_value.ilike.${like},province.ilike.${like}`)
    .order("name", { ascending: true })
    .limit(limit);

  if (program !== "all") query = query.eq("program_type", program);
  if (sourceId && sourceId !== "all") query = query.eq("source_id", Number(sourceId));

  const { data, error } = await query;

  if (error) return fail(error.message, 500);

  const packages = await supabase.from("packages").select("id,name");
  const sources = await supabase.from("participant_sources").select("id,name,institution_name");
  const companies = await supabase.from("companies").select("id,name");

  const packageMap = new Map((packages.data || []).map((x: any) => [x.id, x.name]));
  const sourceMap = new Map((sources.data || []).map((x: any) => [x.id, x]));
  const companyMap = new Map((companies.data || []).map((x: any) => [x.id, x.name]));

  const participants = (data || []).map((p: any) => ({
    ...p,
    package_name: packageMap.get(p.package_id) || "-",
    source_name: sourceMap.get(p.source_id)?.name || "-",
    institution_name: sourceMap.get(p.source_id)?.institution_name || "-",
    company_name: companyMap.get(p.company_id) || "-"
  }));

  return ok({ participants });
}

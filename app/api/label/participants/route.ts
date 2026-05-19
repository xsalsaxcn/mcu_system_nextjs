
import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);

  if (!user || user.role !== "admin") {
    return fail("Unauthorized", 401);
  }

  const supabase = getSupabaseAdmin();
  const program = req.nextUrl.searchParams.get("program") || "capaska";
  const sourceId = req.nextUrl.searchParams.get("source_id") || "all";
  const keyword = String(req.nextUrl.searchParams.get("keyword") || "").trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 100), 300);

  let query = supabase
    .from("participants")
    .select("*")
    .order("name", { ascending: true })
    .limit(limit);

  if (program !== "all") {
    query = query.eq("program_type", program);
  }

  if (sourceId !== "all") {
    query = query.eq("source_id", Number(sourceId));
  }

  if (keyword) {
    const safeKeyword = keyword.replace(/,/g, " ");
    const like = `%${safeKeyword}%`;
    query = query.or(
      `name.ilike.${like},mcu_id.ilike.${like},external_id.ilike.${like},nik.ilike.${like},barcode_value.ilike.${like},province.ilike.${like}`
    );
  }

  const { data, error } = await query;

  if (error) {
    return fail(error.message, 500);
  }

  const packageIds = [...new Set((data || []).map((p: any) => p.package_id).filter(Boolean))];
  const companyIds = [...new Set((data || []).map((p: any) => p.company_id).filter(Boolean))];
  const sourceIds = [...new Set((data || []).map((p: any) => p.source_id).filter(Boolean))];

  const [packages, companies, sources] = await Promise.all([
    packageIds.length
      ? supabase.from("packages").select("id,name").in("id", packageIds)
      : Promise.resolve({ data: [] }),
    companyIds.length
      ? supabase.from("companies").select("id,name").in("id", companyIds)
      : Promise.resolve({ data: [] }),
    sourceIds.length
      ? supabase.from("participant_sources").select("id,name,institution_name").in("id", sourceIds)
      : Promise.resolve({ data: [] })
  ]);

  const packageMap = new Map((packages.data || []).map((x: any) => [x.id, x.name]));
  const companyMap = new Map((companies.data || []).map((x: any) => [x.id, x.name]));
  const sourceMap = new Map((sources.data || []).map((x: any) => [x.id, x]));

  const rows = (data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    mcu_id: p.mcu_id,
    external_id: p.external_id,
    nik: p.nik,
    gender: p.gender,
    province: p.province,
    barcode_value: p.barcode_value || p.mcu_id || p.external_id || String(p.id),
    program_type: p.program_type,
    package_name: packageMap.get(p.package_id) || "-",
    company_name: companyMap.get(p.company_id) || "-",
    source_name: sourceMap.get(p.source_id)?.name || "-",
    institution_name: sourceMap.get(p.source_id)?.institution_name || "-"
  }));

  return ok({ participants: rows });
}

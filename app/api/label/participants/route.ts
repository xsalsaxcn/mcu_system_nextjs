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
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 50), 100);

  if (sourceId === "all" && keyword.length < 2) {
    return ok({
      participants: [],
      message: "Pilih database atau ketik minimal 2 karakter untuk mencari peserta."
    });
  }

  let query = supabase
    .from("participants")
    .select(`
      id,
      name,
      mcu_id,
      external_id,
      nik,
      gender,
      province,
      barcode_value,
      program_type,
      source_id,
      package_id,
      company_id
    `)
    .order("name", { ascending: true })
    .limit(limit);

  if (program !== "all") {
    query = query.eq("program_type", program);
  }

  if (sourceId !== "all") {
    query = query.eq("source_id", Number(sourceId));
  }

  if (keyword.length >= 2) {
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
    package_name: "-",
    company_name: "",
    source_name: "-",
    institution_name: ""
  }));

  return ok({ participants: rows });
}

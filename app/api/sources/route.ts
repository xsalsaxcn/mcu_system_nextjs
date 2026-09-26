import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const program = req.nextUrl.searchParams.get("program") || user.program_type || "capaska";
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("participant_sources")
    .select("*")
    .order("created_at", { ascending: false });

  if (program !== "all") {
    if (program === "vaccination") {
      query = query.or("program_type.eq.vaccination,program_type.eq.corporate,program_type.eq.all,program_type.is.null");
    } else {
      query = query.or(`program_type.eq.${program},program_type.eq.all,program_type.is.null`);
    }
  }

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  let companies: any[] = [];
  let company_warning = "";

  if (program === "vaccination") {
    const companyResult = await supabase
      .from("companies")
      .select("id,name")
      .order("name", { ascending: true });

    if (companyResult.error) {
      company_warning = companyResult.error.message || "Daftar perusahaan existing tidak dapat dimuat.";
    } else {
      companies = (companyResult.data || [])
        .map((row: any) => ({
          id: Number(row.id),
          name: String(row.name || "").trim(),
        }))
        .filter((row: any) => row.id && row.name);
    }
  }

  return ok({
    sources: data || [],
    companies,
    company_warning: company_warning || null,
  });
}

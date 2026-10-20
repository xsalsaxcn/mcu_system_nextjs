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

  // MCU_CORPORATE_IMPORT_COMPANY_DROPDOWN_V431
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
  } else if (program === "corporate") {
    const [participantCompanyResult, packageCompanyResult] = await Promise.all([
      supabase
        .from("participants")
        .select("company_id")
        .eq("program_type", "corporate")
        .not("company_id", "is", null),
      supabase
        .from("packages")
        .select("company_id")
        .eq("program_type", "corporate")
        .eq("is_active", 1)
        .not("company_id", "is", null),
    ]);

    const companyIds = new Set<number>();

    if (participantCompanyResult.error) {
      company_warning = participantCompanyResult.error.message || "Relasi perusahaan peserta MCU Corporate tidak dapat dimuat.";
    } else {
      for (const row of participantCompanyResult.data || []) {
        const id = Number((row as any)?.company_id || 0);
        if (id > 0) companyIds.add(id);
      }
    }

    if (packageCompanyResult.error) {
      company_warning = company_warning || packageCompanyResult.error.message || "Relasi perusahaan paket MCU Corporate tidak dapat dimuat.";
    } else {
      for (const row of packageCompanyResult.data || []) {
        const id = Number((row as any)?.company_id || 0);
        if (id > 0) companyIds.add(id);
      }
    }

    if (companyIds.size) {
      const companyResult = await supabase
        .from("companies")
        .select("id,name")
        .in("id", Array.from(companyIds))
        .order("name", { ascending: true });

      if (companyResult.error) {
        company_warning = company_warning || companyResult.error.message || "Daftar perusahaan MCU Corporate tidak dapat dimuat.";
      } else {
        companies = (companyResult.data || [])
          .map((row: any) => ({
            id: Number(row.id),
            name: String(row.name || "").trim(),
          }))
          .filter((row: any) => row.id && row.name);
      }
    }
  }

  return ok({
    sources: data || [],
    companies,
    company_warning: company_warning || null,
  });
}

import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin } from "../../_utils";
import { historyCompanyKey, historyText } from "@/lib/vaccination/history";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  const role = String((user as any)?.role || "").trim().toLowerCase();
  if (!["admin", "vaccination_admin", "vaccination_supervisor"].includes(role)) return fail("History Import hanya untuk Admin/Supervisor Vaksinasi.", 403);

  const companyName = historyText(req.nextUrl.searchParams.get("company"));
  const supabase = supabaseAdmin();

  try {
    let company: any = null;
    if (companyName) {
      const companyResult = await supabase
        .from("vaccination_history_companies")
        .select("id,company_name,company_key,public_token,active")
        .eq("company_key", historyCompanyKey(companyName))
        .maybeSingle();
      if (companyResult.error) throw new Error(companyResult.error.message);
      company = companyResult.data;
      if (!company) return ok({ company: null, batches: [], stats: { persons: 0, services: 0, dependents: 0 } });
    }

    let batchQuery = supabase
      .from("vaccination_history_import_batches")
      .select("id,company_id,source_filename,source_sheet,source_year,detected_template,total_rows,person_rows,service_rows,dependent_rows,skipped_rows,status,imported_by,imported_at,company:vaccination_history_companies(id,company_name,public_token)")
      .order("imported_at", { ascending: false })
      .limit(50);
    if (company?.id) batchQuery = batchQuery.eq("company_id", company.id);
    const batchesResult = await batchQuery;
    if (batchesResult.error) throw new Error(batchesResult.error.message);

    let personQuery = supabase.from("vaccination_persons").select("id", { count: "exact", head: true });
    let dependentQuery = supabase.from("vaccination_persons").select("id", { count: "exact", head: true }).eq("participant_type", "DEPENDENT");
    let serviceQuery = supabase.from("vaccination_service_history").select("id", { count: "exact", head: true });
    if (company?.id) {
      personQuery = personQuery.eq("company_id", company.id);
      dependentQuery = dependentQuery.eq("company_id", company.id);
      serviceQuery = serviceQuery.eq("company_id", company.id);
    }
    const [personsResult, dependentsResult, servicesResult] = await Promise.all([personQuery, dependentQuery, serviceQuery]);
    if (personsResult.error) throw new Error(personsResult.error.message);
    if (dependentsResult.error) throw new Error(dependentsResult.error.message);
    if (servicesResult.error) throw new Error(servicesResult.error.message);

    return ok({
      company,
      batches: batchesResult.data || [],
      stats: {
        persons: personsResult.count || 0,
        services: servicesResult.count || 0,
        dependents: dependentsResult.count || 0,
      },
    });
  } catch (error: any) {
    const message = String(error?.message || error || "Gagal memuat history batch.");
    if (/vaccination_history_companies|vaccination_persons|vaccination_service_history|vaccination_history_import_batches/i.test(message)) {
      return fail("Database History Vaksinasi belum siap. Jalankan sql/vaccination_history_v151.sql di Supabase SQL Editor.", 500, { detail: message });
    }
    return fail(message, 500);
  }
}

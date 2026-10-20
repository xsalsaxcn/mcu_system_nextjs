import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

// MCU_CORPORATE_IMPORT_PACKAGE_DROPDOWN_V432
async function loadCorporatePackageLinksV432(supabase: any) {
  const packagesRes = await supabase
    .from("packages")
    .select("id,name,company_id")
    .eq("program_type", "corporate")
    .eq("is_active", 1)
    .order("name", { ascending: true });

  if (packagesRes.error) throw packagesRes.error;

  const packages = (packagesRes.data || [])
    .map((row: any) => ({
      id: Number(row.id || 0),
      name: String(row.name || "").trim(),
      company_id: Number(row.company_id || 0),
    }))
    .filter((row: any) => row.id > 0 && row.name);

  const packageIds = new Set<number>(packages.map((row: any) => row.id));
  const relation = new Map<number, Set<number>>();

  for (const pkg of packages) {
    if (!relation.has(pkg.id)) relation.set(pkg.id, new Set<number>());
    if (pkg.company_id > 0) relation.get(pkg.id)!.add(pkg.company_id);
  }

  const pageSize = 1000;
  let start = 0;
  while (true) {
    const participantRes = await supabase
      .from("participants")
      .select("company_id,package_id")
      .eq("program_type", "corporate")
      .not("company_id", "is", null)
      .not("package_id", "is", null)
      .range(start, start + pageSize - 1);

    if (participantRes.error) throw participantRes.error;

    const batch = participantRes.data || [];
    for (const row of batch as any[]) {
      const packageId = Number(row?.package_id || 0);
      const companyId = Number(row?.company_id || 0);
      if (!packageIds.has(packageId) || companyId <= 0) continue;
      if (!relation.has(packageId)) relation.set(packageId, new Set<number>());
      relation.get(packageId)!.add(companyId);
    }

    if (batch.length < pageSize) break;
    start += pageSize;
  }

  return packages.map((pkg: any) => ({
    ...pkg,
    company_ids: Array.from(relation.get(pkg.id) || []).sort((a, b) => a - b),
  }));
}

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
  let corporate_packages: any[] = [];
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
    try {
      corporate_packages = await loadCorporatePackageLinksV432(supabase);

      const companyIds = new Set<number>();
      for (const pkg of corporate_packages) {
        for (const companyId of Array.isArray(pkg.company_ids) ? pkg.company_ids : []) {
          const id = Number(companyId || 0);
          if (id > 0) companyIds.add(id);
        }
      }

      if (companyIds.size) {
        const companyResult = await supabase
          .from("companies")
          .select("id,name")
          .in("id", Array.from(companyIds))
          .order("name", { ascending: true });

        if (companyResult.error) throw companyResult.error;

        companies = (companyResult.data || [])
          .map((row: any) => ({
            id: Number(row.id),
            name: String(row.name || "").trim(),
          }))
          .filter((row: any) => row.id && row.name);
      }
    } catch (error: any) {
      company_warning = error?.message || "Daftar perusahaan/paket MCU Corporate tidak dapat dimuat.";
    }
  }

  return ok({
    sources: data || [],
    companies,
    corporate_packages,
    company_warning: company_warning || null,
  });
}

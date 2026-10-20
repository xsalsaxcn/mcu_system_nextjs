import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  clearMcuCorporateSessionCookie,
  getMcuCorporateSession,
  setMcuCorporateSessionCookie,
  type McuCorporateSessionSelection,
} from "@/lib/server/mcuCorporateSession";

// MCU_SESSION_ALL_COMPANIES_V430
// Company options must reflect actual MCU Corporate data, not only package.company_id ownership.
// The import flow can reuse one package name across different companies, so participants.company_id +
// participants.package_id is the authoritative runtime relationship for Session MCU.

function json(payload: any, status = 200) {
  return NextResponse.json(payload, { status });
}

type CorporatePackageOption = {
  id: number;
  name: string;
  company_id: number;
  description: string;
};

type CorporateCompanyOption = {
  id: number;
  name: string;
  package_ids: number[];
};

async function loadCorporateParticipantLinks(supabase: any) {
  const rows: Array<{ company_id: number; package_id: number }> = [];
  const pageSize = 1000;
  let start = 0;

  while (true) {
    const result = await supabase
      .from("participants")
      .select("company_id,package_id")
      .eq("program_type", "corporate")
      .not("company_id", "is", null)
      .range(start, start + pageSize - 1);

    if (result.error) throw result.error;

    const batch = (result.data || []) as any[];
    for (const row of batch) {
      const companyId = Number(row?.company_id || 0);
      const packageId = Number(row?.package_id || 0);
      if (!companyId) continue;
      rows.push({ company_id: companyId, package_id: packageId });
    }

    if (batch.length < pageSize) break;
    start += pageSize;
  }

  return rows;
}

async function loadOptions() {
  const supabase = getSupabaseAdmin();

  const packagesRes = await supabase
    .from("packages")
    .select("id,name,company_id,description,is_active,program_type")
    .eq("program_type", "corporate")
    .eq("is_active", 1)
    .order("name", { ascending: true });

  if (packagesRes.error) throw packagesRes.error;

  const packages: CorporatePackageOption[] = (packagesRes.data || [])
    .map((pkg: any) => ({
      id: Number(pkg.id),
      name: String(pkg.name || ""),
      company_id: Number(pkg.company_id || 0),
      description: String(pkg.description || ""),
    }))
    .filter((pkg: CorporatePackageOption) => pkg.id > 0);

  const participantLinks = await loadCorporateParticipantLinks(supabase);

  const packageIds = new Set<number>(packages.map((pkg) => pkg.id));
  const companyPackageMap = new Map<number, Set<number>>();

  function link(companyId: number, packageId: number) {
    if (!companyId) return;
    if (!companyPackageMap.has(companyId)) companyPackageMap.set(companyId, new Set<number>());
    if (packageId && packageIds.has(packageId)) companyPackageMap.get(companyId)!.add(packageId);
  }

  // Keep setup-only companies visible too, even before participant import.
  for (const pkg of packages) {
    link(Number(pkg.company_id || 0), pkg.id);
  }

  // Authoritative runtime links: actual Corporate participants.
  for (const row of participantLinks) {
    link(Number(row.company_id || 0), Number(row.package_id || 0));
  }

  const companyIds = Array.from(companyPackageMap.keys()).filter(Boolean);
  let companies: CorporateCompanyOption[] = [];

  if (companyIds.length) {
    const companiesRes = await supabase
      .from("companies")
      .select("id,name")
      .in("id", companyIds)
      .order("name", { ascending: true });

    if (companiesRes.error) throw companiesRes.error;

    companies = (companiesRes.data || [])
      .map((company: any) => {
        const id = Number(company.id || 0);
        return {
          id,
          name: String(company.name || ""),
          package_ids: Array.from(companyPackageMap.get(id) || []).sort((a, b) => a - b),
        };
      })
      .filter((company: CorporateCompanyOption) => company.id > 0 && company.name.trim());
  }

  return {
    companies,
    packages,
    diagnostics: {
      corporate_company_count: companies.length,
      corporate_package_count: packages.length,
      participant_link_count: participantLinks.length,
    },
  };
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return json({ ok: false, message: "Unauthorized" }, 401);

  try {
    const options = await loadOptions();
    const selected = getMcuCorporateSession(req);

    const validSelected = selected
      ? options.companies.some(
          (company) =>
            Number(company.id) === Number(selected.company_id) &&
            company.package_ids.some((id) => Number(id) === Number(selected.package_id)),
        )
      : false;

    return json({
      ok: true,
      companies: options.companies,
      packages: options.packages,
      diagnostics: options.diagnostics,
      session: validSelected ? selected : null,
    });
  } catch (error: any) {
    return json({ ok: false, message: error?.message || "Gagal memuat Session MCU." }, 500);
  }
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return json({ ok: false, message: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const companyId = Number(body.company_id || 0);
  const packageId = Number(body.package_id || 0);

  if (!companyId || !packageId) {
    return json({ ok: false, message: "Pilih perusahaan dan paket pemeriksaan." }, 400);
  }

  try {
    const supabase = getSupabaseAdmin();
    const [companyRes, packageRes] = await Promise.all([
      supabase.from("companies").select("id,name").eq("id", companyId).maybeSingle(),
      supabase
        .from("packages")
        .select("id,name,company_id,is_active,program_type")
        .eq("id", packageId)
        .eq("program_type", "corporate")
        .eq("is_active", 1)
        .maybeSingle(),
    ]);

    if (companyRes.error) throw companyRes.error;
    if (packageRes.error) throw packageRes.error;
    if (!companyRes.data) return json({ ok: false, message: "Perusahaan tidak ditemukan." }, 404);
    if (!packageRes.data) return json({ ok: false, message: "Paket Corporate tidak ditemukan / tidak aktif." }, 404);

    let linked = Number(packageRes.data.company_id || 0) === companyId;

    if (!linked) {
      const participantLinkRes = await supabase
        .from("participants")
        .select("id")
        .eq("program_type", "corporate")
        .eq("company_id", companyId)
        .eq("package_id", packageId)
        .limit(1)
        .maybeSingle();

      if (participantLinkRes.error) throw participantLinkRes.error;
      linked = Boolean(participantLinkRes.data);
    }

    if (!linked) {
      return json({
        ok: false,
        message: "Paket ini belum pernah terhubung ke perusahaan yang dipilih pada data MCU Corporate.",
      }, 400);
    }

    const selection: McuCorporateSessionSelection = {
      company_id: companyId,
      package_id: packageId,
      company_name: String(companyRes.data.name || ""),
      package_name: String(packageRes.data.name || ""),
      selected_at: new Date().toISOString(),
    };

    const res = json({ ok: true, session: selection, message: "Session MCU Corporate aktif." });
    setMcuCorporateSessionCookie(res, selection);
    return res;
  } catch (error: any) {
    return json({ ok: false, message: error?.message || "Gagal menyimpan Session MCU." }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return json({ ok: false, message: "Unauthorized" }, 401);

  const res = json({ ok: true, message: "Session MCU Corporate dikosongkan." });
  clearMcuCorporateSessionCookie(res);
  return res;
}

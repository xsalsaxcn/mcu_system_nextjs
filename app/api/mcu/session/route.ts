import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  clearMcuCorporateSessionCookie,
  getMcuCorporateSession,
  setMcuCorporateSessionCookie,
  type McuCorporateSessionSelection,
} from "@/lib/server/mcuCorporateSession";

function json(payload: any, status = 200) {
  return NextResponse.json(payload, { status });
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

  const packages = (packagesRes.data || [])
    .map((pkg: any) => ({
      id: Number(pkg.id),
      name: String(pkg.name || ""),
      company_id: Number(pkg.company_id || 0),
      description: String(pkg.description || ""),
    }))
    .filter((pkg: any) => pkg.id && pkg.company_id);

  const companyIds: number[] = Array.from(
    new Set<number>(packages.map((pkg: any) => Number(pkg.company_id))),
  );
  let companies: Array<{ id: number; name: string }> = [];

  if (companyIds.length) {
    const companiesRes = await supabase
      .from("companies")
      .select("id,name")
      .in("id", companyIds)
      .order("name", { ascending: true });

    if (companiesRes.error) throw companiesRes.error;
    companies = (companiesRes.data || []).map((company: any) => ({
      id: Number(company.id),
      name: String(company.name || ""),
    }));
  }

  return { companies, packages };
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return json({ ok: false, message: "Unauthorized" }, 401);

  try {
    const options = await loadOptions();
    const selected = getMcuCorporateSession(req);

    const validSelected = selected
      ? options.packages.some(
          (pkg) =>
            Number(pkg.id) === Number(selected.package_id) &&
            Number(pkg.company_id) === Number(selected.company_id),
        )
      : false;

    return json({
      ok: true,
      companies: options.companies,
      packages: options.packages,
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
    if (Number(packageRes.data.company_id || 0) !== companyId) {
      return json({ ok: false, message: "Paket tidak terdaftar pada perusahaan yang dipilih." }, 400);
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

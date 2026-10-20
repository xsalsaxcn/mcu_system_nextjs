import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

// MCU_REG_ONSPOT_SESSION_V440

const SELECT_COLUMNS = `
  id,
  name,
  mcu_id,
  external_id,
  nik,
  employee_nik,
  gender,
  birth_date,
  date_of_birth,
  age,
  examination_date,
  exam_date,
  department,
  province,
  phone,
  program_type,
  source_id,
  package_id,
  company_id,
  registrasi_ulang_done,
  registrasi_ulang_at
`;

function clean(value: string) {
  return String(value || "").replace(/[,%]/g, " ").replace(/\s+/g, " ").trim();
}

async function decorateRows(supabase: any, rows: any[]) {
  const list = rows || [];
  const companyIds = Array.from(new Set(list.map((row: any) => Number(row.company_id || 0)).filter(Boolean)));
  const packageIds = Array.from(new Set(list.map((row: any) => Number(row.package_id || 0)).filter(Boolean)));
  const sourceIds = Array.from(new Set(list.map((row: any) => Number(row.source_id || 0)).filter(Boolean)));

  const companyMap = new Map<number, string>();
  const packageMap = new Map<number, string>();
  const sourceMap = new Map<number, string>();

  if (companyIds.length) {
    const { data } = await supabase.from("companies").select("id,name").in("id", companyIds);
    for (const row of data || []) companyMap.set(Number(row.id), String(row.name || ""));
  }
  if (packageIds.length) {
    const { data } = await supabase.from("packages").select("id,name").in("id", packageIds);
    for (const row of data || []) packageMap.set(Number(row.id), String(row.name || ""));
  }
  if (sourceIds.length) {
    const { data } = await supabase.from("participant_sources").select("*").in("id", sourceIds);
    for (const row of data || []) sourceMap.set(Number(row.id), String(row.name || row.institution_name || ""));
  }

  return list.map((row: any) => ({
    ...row,
    source_name: sourceMap.get(Number(row.source_id || 0)) || companyMap.get(Number(row.company_id || 0)) || "-",
    package_name: packageMap.get(Number(row.package_id || 0)) || "-",
    company_name: companyMap.get(Number(row.company_id || 0)) || ""
  }));
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const supabase = getSupabaseAdmin();
  const program = req.nextUrl.searchParams.get("program") || "capaska";
  const sourceId = req.nextUrl.searchParams.get("source_id") || "all";
  const sessionMatch = /^session:(\d+):(\d+)$/.exec(sourceId);
  const sessionCompanyId = sessionMatch ? Number(sessionMatch[1]) : 0;
  const sessionPackageId = sessionMatch ? Number(sessionMatch[2]) : 0;
  const keyword = clean(req.nextUrl.searchParams.get("keyword") || "");
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") || 25), 1), 50);

  if (sourceId === "all" && keyword.length < 2) {
    return ok({
      participants: [],
      message: "Pilih database atau isi nama/MCU/NIK minimal 2 karakter."
    });
  }

  function baseQuery() {
    let query = supabase.from("participants").select(SELECT_COLUMNS).limit(limit);

    if (program !== "all") query = query.eq("program_type", program);
    if (sessionCompanyId && sessionPackageId) {
      query = query.eq("company_id", sessionCompanyId).eq("package_id", sessionPackageId);
    } else if (sourceId !== "all") {
      query = query.eq("source_id", Number(sourceId));
    }

    return query;
  }

  if (keyword.length >= 2) {
    const { data: exactData, error: exactError } = await baseQuery()
      .or(`mcu_id.eq.${keyword},external_id.eq.${keyword},nik.eq.${keyword},employee_nik.eq.${keyword},barcode_value.eq.${keyword}`)
      .order("name", { ascending: true });

    if (exactError) return fail(exactError.message, 500);
    if (exactData?.length) return ok({ participants: await decorateRows(supabase, exactData), mode: "exact" });
  }

  let query = baseQuery().order("name", { ascending: true });

  if (keyword.length >= 2) {
    const like = `%${keyword}%`;
    query = query.or(`name.ilike.${like},mcu_id.ilike.${like},external_id.ilike.${like},nik.ilike.${like},employee_nik.ilike.${like},barcode_value.ilike.${like}`);
  }

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  return ok({ participants: await decorateRows(supabase, data || []), mode: keyword.length >= 2 ? "like" : (sessionMatch ? "session" : "source") });
}

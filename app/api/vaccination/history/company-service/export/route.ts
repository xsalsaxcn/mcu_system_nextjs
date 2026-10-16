import { NextRequest } from "next/server";
import { requireUser, supabaseAdmin, toInt } from "../../../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";

export const dynamic = "force-dynamic";

const CHUNK = 200;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function dateOnly(value: unknown) {
  const text = clean(value);
  if (!text) return "";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function csvCell(value: unknown) {
  const text = clean(value).replace(/\r?\n/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}

function serviceLabel(row: any) {
  const service = clean(row?.service_name);
  const brand = clean(row?.product_brand);
  if (service && brand && !service.toLowerCase().includes(brand.toLowerCase())) {
    return `${service} · ${brand}`;
  }
  return service || brand || "Layanan";
}

function chunks<T>(values: T[], size = CHUNK) {
  const output: T[][] = [];
  for (let i = 0; i < values.length; i += size) output.push(values.slice(i, i + size));
  return output;
}

async function loadAllPersons(supabase: any, companyId: number) {
  const rows: any[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const result = await supabase
      .from("vaccination_persons")
      .select("id,company_id,participant_type,participant_name,employee_id,nik,email,phone,birth_date,gender,active")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("participant_name", { ascending: true })
      .range(from, from + pageSize - 1);

    if (result.error) throw new Error(result.error.message);
    const batch = result.data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function loadHistoryByPerson(supabase: any, companyId: number, personIds: number[]) {
  const map = new Map<number, any[]>();

  for (const ids of chunks(personIds)) {
    const result = await supabase
      .from("vaccination_service_history")
      .select("id,person_id,service_date,service_name,product_brand")
      .eq("company_id", companyId)
      .in("person_id", ids)
      .order("service_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false });

    if (result.error) throw new Error(result.error.message);

    for (const row of result.data || []) {
      const personId = Number(row.person_id);
      if (!map.has(personId)) map.set(personId, []);
      map.get(personId)!.push(row);
    }
  }

  return map;
}

async function loadParentMap(supabase: any, dependentIds: number[]) {
  const map = new Map<number, any>();

  for (const ids of chunks(dependentIds)) {
    const result = await supabase
      .from("vaccination_person_relationships")
      .select(
        "dependent_person_id,parent:vaccination_persons!vaccination_person_relationships_parent_person_id_fkey(id,participant_name,employee_id,nik,email,phone,birth_date)",
      )
      .in("dependent_person_id", ids)
      .eq("active", true);

    if (result.error) throw new Error(result.error.message);

    for (const relation of result.data || []) {
      const parent = Array.isArray(relation.parent)
        ? relation.parent[0]
        : relation.parent;
      if (parent) map.set(Number(relation.dependent_person_id), parent);
    }
  }

  return map;
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!canVaccinationAccess(user, "dashboard")) {
    return new Response("Akses export History Company ditolak.", { status: 403 });
  }

  const companyId = toInt(req.nextUrl.searchParams.get("company_id"), 0);
  if (!companyId) return new Response("company_id wajib diisi.", { status: 400 });

  const supabase = supabaseAdmin();

  try {
    const companyResult = await supabase
      .from("vaccination_history_companies")
      .select("id,company_name,active")
      .eq("id", companyId)
      .eq("active", true)
      .maybeSingle();

    if (companyResult.error) throw new Error(companyResult.error.message);
    const company = companyResult.data;
    if (!company) return new Response("Perusahaan History tidak ditemukan.", { status: 404 });

    const persons = await loadAllPersons(supabase, companyId);
    const personIds = persons.map((row: any) => Number(row.id)).filter(Boolean);
    const dependentIds = persons
      .filter((row: any) => String(row.participant_type || "").toUpperCase() === "DEPENDENT")
      .map((row: any) => Number(row.id))
      .filter(Boolean);

    const [historyByPerson, parentMap] = await Promise.all([
      loadHistoryByPerson(supabase, companyId, personIds),
      loadParentMap(supabase, dependentIds),
    ]);

    const header = [
      "No",
      "Perusahaan",
      "Nama Peserta",
      "Tipe Peserta",
      "BINUSIAN ID / NIP / Employee ID",
      "NIK",
      "Email",
      "No HP",
      "Tanggal Lahir",
      "Gender",
      "Parent",
      "Parent BINUSIAN ID / NIP",
      "Parent NIK",
      "Parent Email",
      "Parent No HP",
      "Benefit / Layanan Diambil",
      "Total Benefit",
      "Layanan Terakhir",
      "Tanggal Layanan Terakhir",
    ];

    const lines = [header.map(csvCell).join(";")];

    persons.forEach((person: any, index: number) => {
      const history = historyByPerson.get(Number(person.id)) || [];
      const uniqueBenefits = Array.from(
        new Set(history.map(serviceLabel).filter(Boolean)),
      );
      const latest = history[0] || null;
      const parent = parentMap.get(Number(person.id)) || null;

      const row = [
        index + 1,
        company.company_name,
        person.participant_name,
        String(person.participant_type || "").toUpperCase() === "DEPENDENT"
          ? "ANAK / TANGGUNGAN"
          : "KARYAWAN",
        person.employee_id,
        person.nik,
        person.email,
        person.phone,
        dateOnly(person.birth_date),
        person.gender,
        parent?.participant_name || "",
        parent?.employee_id || "",
        parent?.nik || "",
        parent?.email || "",
        parent?.phone || "",
        uniqueBenefits.join(" | "),
        history.length,
        latest ? serviceLabel(latest) : "",
        latest ? dateOnly(latest.service_date) : "",
      ];

      lines.push(row.map(csvCell).join(";"));
    });

    // UTF-8 BOM keeps Indonesian text readable when opened directly in Excel.
    const csv = `\uFEFF${lines.join("\r\n")}`;
    const safeCompany = clean(company.company_name)
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "COMPANY";

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeCompany}_HISTORY_PESERTA_LENGKAP.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    return new Response(
      `Gagal export History Company: ${String(error?.message || error || "Unknown error")}`,
      { status: 500 },
    );
  }
}

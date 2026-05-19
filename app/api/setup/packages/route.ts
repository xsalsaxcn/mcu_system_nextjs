import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

async function getOrCreateCompany(supabase: any, name: string) {
  const companyName = String(name || "").trim();

  if (!companyName) {
    throw new Error("Nama instansi/perusahaan wajib diisi.");
  }

  const { data: existing, error: selectError } = await supabase
    .from("companies")
    .select("id")
    .ilike("name", companyName)
    .limit(1)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("companies")
    .insert({
      name: companyName,
      address: "",
      pic_name: ""
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);

  if (!user || user.role !== "admin") {
    return fail("Unauthorized", 401);
  }

  const body = await req.json().catch(() => ({}));
  const programType = String(body.program_type || "capaska").trim();
  const companyName = String(body.company_name || "").trim();
  const packageName = String(body.package_name || "").trim();
  const description = String(body.description || "").trim();

  if (!["capaska", "corporate"].includes(programType)) {
    return fail("Program harus capaska atau corporate.");
  }

  if (!packageName) {
    return fail("Nama paket pemeriksaan wajib diisi.");
  }

  const supabase = getSupabaseAdmin();

  try {
    const companyId = await getOrCreateCompany(supabase, companyName || (programType === "capaska" ? "BPIP / CAPASKA" : "Corporate"));

    const { data: existing, error: existingError } = await supabase
      .from("packages")
      .select("id")
      .eq("program_type", programType)
      .ilike("name", packageName)
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      const { error: updateError } = await supabase
        .from("packages")
        .update({
          company_id: companyId,
          description,
          is_active: 1,
          program_type: programType
        })
        .eq("id", existing.id);

      if (updateError) throw updateError;

      return ok({ package_id: existing.id, mode: "updated" });
    }

    const { data, error } = await supabase
      .from("packages")
      .insert({
        name: packageName,
        description,
        company_id: companyId,
        is_active: 1,
        program_type: programType
      })
      .select("id")
      .single();

    if (error) throw error;

    return ok({ package_id: data.id, mode: "created" });
  } catch (error: any) {
    return fail(error?.message || "Gagal membuat paket.", 500);
  }
}

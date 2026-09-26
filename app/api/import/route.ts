import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { importParticipantsFromExcel } from "@/lib/server/importExcel";
import { fail, ok } from "@/lib/server/response";
import { PROGRAM_CAPASKA, PROGRAM_CORPORATE, PROGRAM_VACCINATION } from "@/lib/shared/constants";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const mode = String(form.get("mode") || "").trim();

  const rawProgramType = String(form.get("program_type") || PROGRAM_CAPASKA).trim().toLowerCase();
  const programType = [PROGRAM_CAPASKA, PROGRAM_CORPORATE, PROGRAM_VACCINATION].includes(rawProgramType)
    ? rawProgramType
    : PROGRAM_CAPASKA;

  const defaultInstitution =
    programType === PROGRAM_CORPORATE
      ? "Corporate"
      : programType === PROGRAM_VACCINATION
        ? "Vaksinasi Perusahaan"
        : "BPIP / CAPASKA";

  const defaultPackage =
    programType === PROGRAM_CORPORATE
      ? "MCU Corporate Basic"
      : programType === PROGRAM_VACCINATION
        ? "Vaksinasi Perusahaan"
        : "CAPASKA 2025/2026";

  // IMPORT_EXISTING_DATABASE_SELECT_V237
  const sourceId = Number(form.get("source_id") || form.get("database_id") || 0);
  const databaseName = String(form.get("database_name") || "").trim();
  const institutionName = String(form.get("institution_name") || defaultInstitution).trim();
  const companyName = String(form.get("company_name") || institutionName || defaultInstitution).trim();
  const packageName = String(form.get("package_name") || defaultPackage).trim();
  const description = String(form.get("description") || "").trim();

  const supabase = getSupabaseAdmin();

  // V153.39 — Vaccination company-only setup.
  // Some companies do not provide a participant database. In this mode we only
  // create/reuse the company + participant source so Session can be configured
  // manually later (location, date and time) without uploading a fake Excel file.
  if (mode === "vaccination_company_only") {
    if (programType !== PROGRAM_VACCINATION) {
      return fail("Mode perusahaan tanpa database hanya tersedia untuk Vaksinasi.");
    }

    const manualCompanyName = String(companyName || institutionName || "").trim();
    if (!manualCompanyName) return fail("Nama perusahaan wajib diisi.");

    const companyLookup = await supabase
      .from("companies")
      .select("id,name")
      .ilike("name", manualCompanyName)
      .limit(1)
      .maybeSingle();

    if (companyLookup.error) return fail(companyLookup.error.message, 500);

    let company = companyLookup.data;
    if (!company) {
      const companyInsert = await supabase
        .from("companies")
        .insert({ name: manualCompanyName, address: "", pic_name: "" })
        .select("id,name")
        .single();

      if (companyInsert.error) return fail(companyInsert.error.message, 500);
      company = companyInsert.data;
    }

    let sourceLookup = await supabase
      .from("participant_sources")
      .select("id,name,institution_name,program_type,uploaded_filename")
      .eq("program_type", PROGRAM_VACCINATION)
      .ilike("institution_name", manualCompanyName)
      .limit(1)
      .maybeSingle();

    if (sourceLookup.error) return fail(sourceLookup.error.message, 500);

    if (!sourceLookup.data) {
      sourceLookup = await supabase
        .from("participant_sources")
        .select("id,name,institution_name,program_type,uploaded_filename")
        .eq("program_type", PROGRAM_VACCINATION)
        .ilike("name", manualCompanyName)
        .limit(1)
        .maybeSingle();

      if (sourceLookup.error) return fail(sourceLookup.error.message, 500);
    }

    if (sourceLookup.data) {
      return ok({
        mode,
        created: false,
        company,
        source: sourceLookup.data,
        message: `${manualCompanyName} sudah tersedia. Silakan pilih perusahaan ini di Session dan isi lokasi, tanggal, serta jam secara manual.`,
      });
    }

    const sourceInsert = await supabase
      .from("participant_sources")
      .insert({
        name: manualCompanyName,
        institution_name: manualCompanyName,
        program_type: PROGRAM_VACCINATION,
        description: description || "Perusahaan vaksinasi tanpa database peserta",
        uploaded_filename: "manual-company-only",
      })
      .select("id,name,institution_name,program_type,uploaded_filename")
      .single();

    if (sourceInsert.error) return fail(sourceInsert.error.message, 500);

    return ok({
      mode,
      created: true,
      company,
      source: sourceInsert.data,
      message: `${manualCompanyName} berhasil ditambahkan. Atur lokasi, tanggal, dan jam nanti di Session Vaksinasi.`,
    });
  }

  if (!file) return fail("File Excel wajib diupload.");
  if (!databaseName) return fail("Nama Database wajib diisi.");

  const buffer = Buffer.from(await file.arrayBuffer());

  const stats = await importParticipantsFromExcel(supabase, buffer, {
    ...(Number.isFinite(sourceId) && sourceId > 0 ? { source_id: sourceId } : {}),
    database_name: databaseName,
    institution_name: institutionName,
    company_name: companyName,
    package_name: packageName,
    description,
    program_type: programType
  });

  return ok({ stats });
}

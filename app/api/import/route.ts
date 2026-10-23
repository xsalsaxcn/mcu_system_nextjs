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

  // IMPORT_SERVICE_TYPE_GUARD_V494
  const serviceType = String(form.get("service_type") || programType).trim().toLowerCase();
  if (serviceType === "wellness") {
    return fail("Jenis Layanan Wellness menggunakan halaman Import Wellness agar mapping tidak tercampur.", 400);
  }
  if (![PROGRAM_CAPASKA, PROGRAM_CORPORATE, PROGRAM_VACCINATION].includes(serviceType)) {
    return fail("Jenis Layanan tidak valid.", 400);
  }
  if (serviceType !== programType) {
    return fail("Jenis Layanan harus sesuai dengan Tujuan Import.", 400);
  }

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

  // VACCINATION_IMPORT_MANUAL_SESSION_MAPPING_V154
  let vaccinationMapping: Record<string, string> = {};
  let vaccinationLocationOverrides: Record<string, { location_name?: string; session_date?: string; time_slot?: string }> = {};
  try {
    const rawVaccinationMapping = String(form.get("vaccination_mapping_json") || "").trim();
    vaccinationMapping = rawVaccinationMapping ? JSON.parse(rawVaccinationMapping) : {};
    const rawVaccinationLocations = String(form.get("vaccination_location_overrides_json") || "").trim();
    vaccinationLocationOverrides = rawVaccinationLocations ? JSON.parse(rawVaccinationLocations) : {};
  } catch {
    return fail("Mapping manual Vaksinasi tidak valid.", 400);
  }

  if (programType === PROGRAM_VACCINATION && Object.keys(vaccinationMapping).length > 0) {
    if (!String(vaccinationMapping.name || "").trim()) return fail("Mapping Nama Peserta/Anak wajib dipilih.", 400);
    if (!String(vaccinationMapping.time_area_name || "").trim()) return fail("Mapping TimeAreaName / Lokasi+Tanggal wajib dipilih.", 400);
  }

  // MCU_CORPORATE_IMPORT_MAPPING_SESSION_V466
  let corporateMapping: Record<string, string> = {};
  try {
    const rawMapping = String(form.get("mapping_json") || "").trim();
    corporateMapping = rawMapping ? JSON.parse(rawMapping) : {};
  } catch {
    return fail("mapping_json tidak valid.", 400);
  }
  const queueSessionId = Number(form.get("queue_session_id") || 0);
  const locationMode = String(form.get("location_mode") || "session").trim().toLowerCase();
  const locationColumn = String(form.get("location_column") || "").trim();
  const locationValue = String(form.get("location_value") || "").trim();
  const mappingSheetName = String(form.get("mapping_sheet_name") || "").trim();
  const mappingHeaderRow = Number(form.get("mapping_header_row") || 0);

  if (programType === PROGRAM_CORPORATE && Object.keys(corporateMapping).length > 0) {
    if (!String(corporateMapping.name || "").trim()) return fail("Mapping Nama Lengkap wajib dipilih.", 400);
    if (!queueSessionId) return fail("Session MCU / Lokasi wajib dipilih untuk import Corporate.", 400);
    if (locationMode === "column" && !locationColumn) return fail("Kolom sumber lokasi wajib dipilih.", 400);
    if (locationMode === "fixed" && !locationValue) return fail("Nilai lokasi tetap wajib diisi.", 400);
  }

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
    program_type: programType,
    vaccination_mapping: vaccinationMapping,
    vaccination_location_overrides: vaccinationLocationOverrides,
    corporate_mapping: corporateMapping,
    corporate_session: programType === PROGRAM_CORPORATE && queueSessionId > 0 ? {
      queue_session_id: queueSessionId,
      location_mode: locationMode,
      location_column: locationColumn,
      location_value: locationValue,
      sheet_name: mappingSheetName,
      header_row: Number.isFinite(mappingHeaderRow) ? mappingHeaderRow : 0,
    } : undefined,
  });

  return ok({ stats });
}

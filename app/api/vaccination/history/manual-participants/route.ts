import crypto from "crypto";
import { NextRequest } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import {
  historyEmailKey,
  historyIdentityKey,
  historyNameKey,
  historyServiceCategory,
  historyText,
  historyUserLabel,
} from "@/lib/vaccination/history";
import {
  manualHistoryParticipantRow,
  parseManualHistoryParticipantWorkbook,
  validateManualHistoryParticipantRow,
  type ManualHistoryParticipantRow,
} from "@/lib/vaccination/historyManualParticipant";
import { fail, ok, requireUser, supabaseAdmin, toInt } from "../../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function allowed(user: any) {
  return Boolean(user && canVaccinationAccess(user, "dashboard"));
}

function personInsert(companyId: number, row: ManualHistoryParticipantRow) {
  const employeeId = row.participantType === "EMPLOYEE" ? historyText(row.employeeId) : "";
  const nik = historyText(row.nik);
  const email = row.participantType === "EMPLOYEE" ? historyEmailKey(row.email) : "";
  return {
    company_id: companyId,
    participant_type: row.participantType,
    participant_name: row.participantName,
    name_key: historyNameKey(row.participantName),
    employee_id: employeeId || null,
    employee_key: historyIdentityKey(employeeId) || null,
    nik: nik || null,
    nik_key: historyIdentityKey(nik) || null,
    email: email || null,
    email_key: email || null,
    phone: historyText(row.phone) || null,
    birth_date: row.birthDate || null,
    gender: historyText(row.gender) || null,
    active: true,
    updated_at: new Date().toISOString(),
  };
}

async function activeCompany(supabase: any, companyId: number) {
  const result = await supabase
    .from("vaccination_history_companies")
    .select("id,company_name,company_key,public_token,active")
    .eq("id", companyId)
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("Perusahaan History tidak ditemukan.");
  return result.data;
}

async function employeeCandidates(supabase: any, companyId: number, row: ManualHistoryParticipantRow) {
  const byId = new Map<number, any>();
  const employeeKey = historyIdentityKey(row.employeeId);
  const nikKey = historyIdentityKey(row.nik);
  const emailKey = historyEmailKey(row.email);

  const lookups: Promise<any>[] = [];
  if (employeeKey) lookups.push(supabase.from("vaccination_persons").select("*").eq("company_id", companyId).eq("participant_type", "EMPLOYEE").eq("active", true).eq("employee_key", employeeKey).limit(3));
  if (nikKey) lookups.push(supabase.from("vaccination_persons").select("*").eq("company_id", companyId).eq("participant_type", "EMPLOYEE").eq("active", true).eq("nik_key", nikKey).limit(3));
  if (emailKey) lookups.push(supabase.from("vaccination_persons").select("*").eq("company_id", companyId).eq("participant_type", "EMPLOYEE").eq("active", true).eq("email_key", emailKey).limit(3));

  for (const result of await Promise.all(lookups)) {
    if (result.error) throw new Error(result.error.message);
    for (const person of result.data || []) byId.set(Number(person.id), person);
  }
  return Array.from(byId.values());
}

function assertConsistentEmployee(existing: any, row: ManualHistoryParticipantRow) {
  const checks: Array<[string, string, string]> = [
    ["NIP / Employee ID", historyIdentityKey(existing?.employee_key || existing?.employee_id), historyIdentityKey(row.employeeId)],
    ["NIK", historyIdentityKey(existing?.nik_key || existing?.nik), historyIdentityKey(row.nik)],
    ["Email Perusahaan", historyEmailKey(existing?.email_key || existing?.email), historyEmailKey(row.email)],
  ];
  for (const [label, oldValue, newValue] of checks) {
    if (oldValue && newValue && oldValue !== newValue) throw new Error(`${label} konflik dengan peserta existing. Gunakan koreksi identitas, jangan membuat peserta ganda.`);
  }
}

async function resolveEmployee(supabase: any, companyId: number, row: ManualHistoryParticipantRow) {
  const candidates = await employeeCandidates(supabase, companyId, row);
  if (candidates.length > 1) throw new Error("NIP / NIK / Email mengarah ke lebih dari satu peserta existing. Data perlu direview sebelum import.");

  const desired = personInsert(companyId, row);
  if (!candidates.length) {
    const inserted = await supabase.from("vaccination_persons").insert(desired).select("*").single();
    if (inserted.error) throw new Error(inserted.error.message);
    return { person: inserted.data, created: true };
  }

  const existing = candidates[0];
  assertConsistentEmployee(existing, row);
  const patch: Record<string, unknown> = {};
  for (const key of ["employee_id", "employee_key", "nik", "nik_key", "email", "email_key", "phone", "birth_date", "gender"] as const) {
    if (!existing[key] && (desired as any)[key]) patch[key] = (desired as any)[key];
  }
  if (!historyText(existing.participant_name) && desired.participant_name) {
    patch.participant_name = desired.participant_name;
    patch.name_key = desired.name_key;
  }
  if (Object.keys(patch).length) {
    patch.updated_at = new Date().toISOString();
    const updated = await supabase.from("vaccination_persons").update(patch).eq("id", existing.id).select("*").single();
    if (updated.error) throw new Error(updated.error.message);
    return { person: updated.data, created: false };
  }
  return { person: existing, created: false };
}

async function resolveParent(supabase: any, companyId: number, row: ManualHistoryParticipantRow) {
  const employeeKey = historyIdentityKey(row.parentEmployeeId);
  const nikKey = historyIdentityKey(row.parentNik);
  const emailKey = historyEmailKey(row.parentEmail);
  const byId = new Map<number, any>();
  const lookups: Promise<any>[] = [];
  if (employeeKey) lookups.push(supabase.from("vaccination_persons").select("*").eq("company_id", companyId).eq("participant_type", "EMPLOYEE").eq("active", true).eq("employee_key", employeeKey).limit(3));
  if (nikKey) lookups.push(supabase.from("vaccination_persons").select("*").eq("company_id", companyId).eq("participant_type", "EMPLOYEE").eq("active", true).eq("nik_key", nikKey).limit(3));
  if (emailKey) lookups.push(supabase.from("vaccination_persons").select("*").eq("company_id", companyId).eq("participant_type", "EMPLOYEE").eq("active", true).eq("email_key", emailKey).limit(3));
  for (const result of await Promise.all(lookups)) {
    if (result.error) throw new Error(result.error.message);
    for (const person of result.data || []) byId.set(Number(person.id), person);
  }
  const candidates = Array.from(byId.values());
  if (candidates.length !== 1) throw new Error(candidates.length ? "Identitas parent mengarah ke lebih dari satu peserta." : "Parent belum terdaftar pada perusahaan ini. Tambahkan parent/karyawan terlebih dahulu.");
  const parent = candidates[0];
  if (employeeKey && historyIdentityKey(parent.employee_key || parent.employee_id) !== employeeKey) throw new Error("Parent NIP tidak sesuai dengan parent existing.");
  if (emailKey && historyEmailKey(parent.email_key || parent.email) !== emailKey) throw new Error("Parent Email tidak sesuai dengan parent existing.");
  if (nikKey && historyIdentityKey(parent.nik_key || parent.nik) !== nikKey) throw new Error("Parent NIK tidak sesuai dengan parent existing.");
  return parent;
}

async function resolveDependent(supabase: any, companyId: number, row: ManualHistoryParticipantRow, parent: any) {
  const childNikKey = historyIdentityKey(row.nik);
  const nameKey = historyNameKey(row.participantName);
  let existing: any = null;

  if (childNikKey) {
    const byNik = await supabase
      .from("vaccination_persons")
      .select("*")
      .eq("company_id", companyId)
      .eq("participant_type", "DEPENDENT")
      .eq("active", true)
      .eq("nik_key", childNikKey)
      .limit(2);
    if (byNik.error) throw new Error(byNik.error.message);
    if ((byNik.data || []).length > 1) throw new Error("NIK anak mengarah ke lebih dari satu data dependent.");
    existing = byNik.data?.[0] || null;
  }

  if (existing) {
    const linked = await supabase
      .from("vaccination_person_relationships")
      .select("parent_person_id")
      .eq("company_id", companyId)
      .eq("dependent_person_id", existing.id)
      .eq("active", true);
    if (linked.error) throw new Error(linked.error.message);
    const otherParent = (linked.data || []).find((item: any) => Number(item.parent_person_id) !== Number(parent.id));
    if (otherParent) throw new Error("Anak dengan NIK tersebut sudah terhubung ke parent lain. Review relasi sebelum menambahkan akses parent baru.");
  }

  if (!existing) {
    const relations = await supabase
      .from("vaccination_person_relationships")
      .select("dependent_person_id,dependent:vaccination_persons!vaccination_person_relationships_dependent_person_id_fkey(*)")
      .eq("company_id", companyId)
      .eq("parent_person_id", parent.id)
      .eq("active", true);
    if (relations.error) throw new Error(relations.error.message);
    const matches = (relations.data || [])
      .map((item: any) => Array.isArray(item.dependent) ? item.dependent[0] : item.dependent)
      .filter((item: any) => item?.id && historyNameKey(item.name_key || item.participant_name) === nameKey);
    if (matches.length > 1) throw new Error("Nama anak yang sama tercatat lebih dari satu kali pada parent ini. Tambahkan NIK anak untuk memastikan identitas.");
    existing = matches[0] || null;
  }

  const desired = personInsert(companyId, row);
  let person = existing;
  let created = false;
  if (!person) {
    const inserted = await supabase.from("vaccination_persons").insert(desired).select("*").single();
    if (inserted.error) throw new Error(inserted.error.message);
    person = inserted.data;
    created = true;
  } else {
    if (childNikKey && historyIdentityKey(person.nik_key || person.nik) && historyIdentityKey(person.nik_key || person.nik) !== childNikKey) {
      throw new Error("NIK anak konflik dengan data dependent existing.");
    }
    const patch: Record<string, unknown> = {};
    for (const key of ["nik", "nik_key", "phone", "birth_date", "gender"] as const) {
      if (!person[key] && (desired as any)[key]) patch[key] = (desired as any)[key];
    }
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      const updated = await supabase.from("vaccination_persons").update(patch).eq("id", person.id).select("*").single();
      if (updated.error) throw new Error(updated.error.message);
      person = updated.data;
    }
  }

  const relation = await supabase.from("vaccination_person_relationships").upsert({
    company_id: companyId,
    parent_person_id: parent.id,
    dependent_person_id: person.id,
    relationship_type: "CHILD",
    active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_id,parent_person_id,dependent_person_id", ignoreDuplicates: false });
  if (relation.error) throw new Error(relation.error.message);

  return { person, created };
}

function serviceInsert(companyId: number, personId: number, row: ManualHistoryParticipantRow, source: {
  sourceFileName: string;
  sourceFileHash: string;
  sourceSheet: string;
  sourceRow: number;
  batchId?: number | null;
  actor: string;
}) {
  if (!row.serviceName) return null;
  return {
    company_id: companyId,
    person_id: personId,
    service_date: row.serviceDate,
    service_category: historyServiceCategory(row.serviceName, row.productBrand),
    service_name: row.serviceName,
    product_brand: row.productBrand || null,
    dose_number: row.doseNumber,
    lot_number: row.lotNumber || null,
    location: row.location || null,
    next_due_date: row.nextDueDate,
    notes: row.notes || null,
    source_type: "ADMIN_MANUAL",
    source_year: row.serviceDate ? Number(row.serviceDate.slice(0, 4)) : null,
    source_filename: source.sourceFileName,
    source_file_hash: source.sourceFileHash,
    source_sheet: source.sourceSheet,
    source_row: source.sourceRow,
    raw_json: { ...row.raw, admin_entry: true, added_by: source.actor, added_at: new Date().toISOString() },
    import_batch_id: source.batchId || null,
  };
}

async function insertService(supabase: any, payload: any, ignoreDuplicate = false) {
  if (!payload) return null;
  const query = ignoreDuplicate
    ? supabase.from("vaccination_service_history").upsert(payload, { onConflict: "company_id,source_file_hash,source_sheet,source_row", ignoreDuplicates: true }).select("*")
    : supabase.from("vaccination_service_history").insert(payload).select("*");
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return Array.isArray(result.data) ? result.data[0] || null : result.data;
}

async function processRow(supabase: any, companyId: number, row: ManualHistoryParticipantRow, source: any, ignoreDuplicate = false) {
  const validation = validateManualHistoryParticipantRow(row);
  if (validation) throw new Error(validation);

  let resolved: any;
  let parent: any = null;
  if (row.participantType === "EMPLOYEE") {
    resolved = await resolveEmployee(supabase, companyId, row);
  } else {
    parent = await resolveParent(supabase, companyId, row);
    resolved = await resolveDependent(supabase, companyId, row, parent);
  }

  const payload = serviceInsert(companyId, Number(resolved.person.id), row, source);
  const service = await insertService(supabase, payload, ignoreDuplicate);
  return { person: resolved.person, personCreated: resolved.created, service, parent };
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!allowed(user)) return fail("Akses Tambah Peserta History ditolak.", 403);

  try {
    const contentType = req.headers.get("content-type") || "";
    const supabase = supabaseAdmin();
    const actor = historyUserLabel(user);

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const companyId = toInt(form.get("company_id"), 0);
      const file = form.get("file");
      if (!companyId) return fail("Perusahaan wajib dipilih.", 400);
      if (!(file instanceof File)) return fail("File Excel wajib dipilih.", 400);
      if (!/\.xlsx?$/i.test(file.name || "")) return fail("Gunakan file Excel .xlsx atau .xls.", 400);
      if (file.size > 15 * 1024 * 1024) return fail("Ukuran file maksimal 15 MB.", 400);
      const company = await activeCompany(supabase, companyId);
      const buffer = Buffer.from(await file.arrayBuffer());
      const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
      const parsed = parseManualHistoryParticipantWorkbook(buffer);

      const previous = await supabase
        .from("vaccination_history_import_batches")
        .select("id,status,imported_at")
        .eq("company_id", companyId)
        .eq("source_file_hash", fileHash)
        .eq("source_sheet", parsed.sheetName)
        .eq("status", "IMPORTED")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previous.error) throw new Error(previous.error.message);
      if (previous.data) {
        return ok({
          alreadyImported: true,
          message: "File yang sama sudah pernah diimport. Tidak ada peserta atau layanan yang diduplikasi.",
          batch_id: previous.data.id,
        });
      }

      const orderedRows = [
        ...parsed.rows.filter((row) => row.participantType === "EMPLOYEE"),
        ...parsed.rows.filter((row) => row.participantType === "DEPENDENT"),
      ];
      const batch = await supabase.from("vaccination_history_import_batches").insert({
        company_id: companyId,
        source_filename: file.name,
        source_file_hash: fileHash,
        source_sheet: parsed.sheetName,
        source_year: null,
        source_type: "ADMIN_PARTICIPANT_IMPORT",
        detected_template: "MANUAL_PARTICIPANT_TEMPLATE_V151_9",
        total_rows: parsed.rows.length,
        person_rows: parsed.rows.length,
        service_rows: parsed.rows.filter((row) => Boolean(row.serviceName)).length,
        dependent_rows: parsed.rows.filter((row) => row.participantType === "DEPENDENT").length,
        skipped_rows: 0,
        status: "IMPORTING",
        imported_by: actor,
        metadata: { source: "History Company Service - Tambah Peserta Manual" },
      }).select("*").single();
      if (batch.error) throw new Error(batch.error.message);

      let createdPersons = 0;
      let services = 0;
      let processed = 0;
      const errors: Array<{ row: number; message: string }> = [];
      for (const row of orderedRows) {
        try {
          const result = await processRow(supabase, companyId, row, {
            sourceFileName: file.name,
            sourceFileHash: fileHash,
            sourceSheet: parsed.sheetName,
            sourceRow: row.sourceRow,
            batchId: Number(batch.data.id),
            actor,
          }, true);
          processed += 1;
          if (result.personCreated) createdPersons += 1;
          if (result.service) services += 1;
        } catch (error: any) {
          errors.push({ row: row.sourceRow, message: String(error?.message || error) });
        }
      }

      await supabase.from("vaccination_history_import_batches").update({
        skipped_rows: errors.length,
        status: processed ? "IMPORTED" : "FAILED",
        metadata: {
          source: "History Company Service - Tambah Peserta Manual",
          processed,
          created_persons: createdPersons,
          inserted_services: services,
          errors: errors.slice(0, 100),
        },
      }).eq("id", batch.data.id);

      if (!processed) return fail("Tidak ada baris yang berhasil diimport. Periksa template dan identitas parent/karyawan.", 400, { errors: errors.slice(0, 20) });
      return ok({
        company,
        batch_id: batch.data.id,
        processed,
        created_persons: createdPersons,
        inserted_services: services,
        skipped: errors.length,
        errors: errors.slice(0, 20),
        message: `Import selesai: ${processed} baris diproses, ${createdPersons} peserta baru dibuat, ${services} layanan tersimpan${errors.length ? `, ${errors.length} baris perlu review` : ""}.`,
      });
    }

    const body = await req.json().catch(() => ({}));
    const companyId = toInt(body?.company_id, 0);
    if (!companyId) return fail("Perusahaan wajib dipilih.", 400);
    const company = await activeCompany(supabase, companyId);
    const row = manualHistoryParticipantRow(body, 1);
    const sourceHash = `admin-participant-${crypto.randomUUID()}`;
    const result = await processRow(supabase, companyId, row, {
      sourceFileName: "Admin Manual Participant",
      sourceFileHash: sourceHash,
      sourceSheet: "ADMIN",
      sourceRow: 1,
      batchId: null,
      actor,
    }, false);

    if (result.service) {
      await supabase.from("vaccination_history_service_audit").insert({
        service_id: result.service.id,
        company_id: companyId,
        person_id: result.person.id,
        action: "ADD",
        changed_by: actor,
        before_json: null,
        after_json: result.service,
        created_at: new Date().toISOString(),
      });
    }

    return ok({
      company,
      person: result.person,
      service: result.service,
      person_created: result.personCreated,
      message: result.personCreated
        ? `Peserta ${result.person.participant_name} berhasil ditambahkan${result.service ? " beserta history layanan" : ""}.`
        : `Peserta sudah terdaftar; data existing digunakan${result.service ? " dan layanan baru ditambahkan" : ""}.`,
    });
  } catch (error: any) {
    return fail(String(error?.message || error || "Gagal menambah peserta History."), 500);
  }
}

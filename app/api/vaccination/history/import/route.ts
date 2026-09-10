import crypto from "crypto";
import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin } from "../../_utils";
import {
  historyCompanyKey,
  historyEmailKey,
  historyIdentityKey,
  historyNameKey,
  historyText,
  historyUserLabel,
  historyYear,
} from "@/lib/vaccination/history";
import {
  parseVaccinationHistoryWorkbook,
  summarizeVaccinationHistoryRows,
  type VaccinationHistoryRow,
} from "@/lib/vaccination/historyImport";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHUNK = 300;

type PersonRow = {
  id?: number;
  company_id: number;
  participant_type: "EMPLOYEE" | "DEPENDENT";
  participant_name: string;
  name_key: string;
  employee_id: string | null;
  employee_key: string | null;
  nik: string | null;
  nik_key: string | null;
  email: string | null;
  email_key: string | null;
  phone: string | null;
  birth_date: string | null;
  gender: string | null;
  active: boolean;
};

type PersonRef = {
  id: number | null;
  data: PersonRow;
  existing: boolean;
};

async function insertChunks(supabase: any, table: string, rows: any[], options?: { upsert?: boolean; onConflict?: string; ignoreDuplicates?: boolean }) {
  const out: any[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    let query = options?.upsert
      ? supabase.from(table).upsert(chunk, { onConflict: options.onConflict, ignoreDuplicates: options.ignoreDuplicates })
      : supabase.from(table).insert(chunk);
    query = query.select("*");
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    out.push(...(result.data || []));
  }
  return out;
}

async function fetchCompanyPersons(supabase: any, companyId: number) {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const result = await supabase
      .from("vaccination_persons")
      .select("*")
      .eq("company_id", companyId)
      .order("id", { ascending: true })
      .range(start, start + pageSize - 1);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data || []));
    if ((result.data || []).length < pageSize) break;
  }
  return rows;
}

async function fetchCompanyRelationships(supabase: any, companyId: number) {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const result = await supabase
      .from("vaccination_person_relationships")
      .select("id,parent_person_id,dependent_person_id,relationship_type,active")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("id", { ascending: true })
      .range(start, start + pageSize - 1);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data || []));
    if ((result.data || []).length < pageSize) break;
  }
  return rows;
}

function personData(companyId: number, type: "EMPLOYEE" | "DEPENDENT", input: {
  name: string;
  employeeId?: string;
  nik?: string;
  email?: string;
  phone?: string;
  birthDate?: string | null;
  gender?: string;
}): PersonRow {
  const name = historyText(input.name) || (type === "EMPLOYEE" ? "Orang Tua / Wali" : "Dependent");
  const employeeId = historyText(input.employeeId);
  const nik = historyText(input.nik);
  const email = historyEmailKey(input.email);
  return {
    company_id: companyId,
    participant_type: type,
    participant_name: name,
    name_key: historyNameKey(name),
    employee_id: employeeId || null,
    employee_key: historyIdentityKey(employeeId) || null,
    nik: nik || null,
    nik_key: historyIdentityKey(nik) || null,
    email: email || null,
    email_key: email || null,
    phone: historyText(input.phone) || null,
    birth_date: input.birthDate || null,
    gender: historyText(input.gender) || null,
    active: true,
  };
}

function mergePerson(target: PersonRow, incoming: PersonRow) {
  const placeholder = /^orang tua \/ wali/i.test(target.participant_name || "");
  if ((placeholder || !target.participant_name) && incoming.participant_name && !/^orang tua \/ wali/i.test(incoming.participant_name)) {
    target.participant_name = incoming.participant_name;
    target.name_key = incoming.name_key;
  }
  for (const key of ["employee_id", "employee_key", "nik", "nik_key", "email", "email_key", "phone", "birth_date", "gender"] as const) {
    if (!target[key] && incoming[key]) (target as any)[key] = incoming[key];
  }
  return target;
}

function rowAdultData(companyId: number, row: VaccinationHistoryRow) {
  return personData(companyId, "EMPLOYEE", {
    name: row.participantName,
    employeeId: row.employeeId,
    nik: row.nik,
    email: row.email,
    phone: row.phone,
    birthDate: row.birthDate,
    gender: row.gender,
  });
}

function rowParentData(companyId: number, row: VaccinationHistoryRow) {
  const parentLabel = historyText(row.parentName) || `Orang Tua / Wali${row.parentEmployeeId ? ` (${row.parentEmployeeId})` : row.parentEmail ? ` (${row.parentEmail})` : ""}`;
  return personData(companyId, "EMPLOYEE", {
    name: parentLabel,
    employeeId: row.parentEmployeeId,
    nik: row.parentNik,
    email: row.parentEmail,
    phone: row.parentPhone,
  });
}

function rowChildData(companyId: number, row: VaccinationHistoryRow) {
  return personData(companyId, "DEPENDENT", {
    name: row.participantName,
    employeeId: row.employeeId,
    nik: row.nik,
    email: row.email,
    phone: row.phone,
    birthDate: row.birthDate,
    gender: row.gender,
  });
}

function bestStrongKey(data: PersonRow) {
  if (data.nik_key) return `nik:${data.nik_key}`;
  if (data.employee_key) return `employee:${data.employee_key}`;
  if (data.email_key) return `email:${data.email_key}`;
  return `name:${data.name_key}`;
}

function createAdultResolver(existing: any[]) {
  const byNik = new Map<string, PersonRef>();
  const byEmployee = new Map<string, PersonRef>();
  const byEmail = new Map<string, PersonRef>();
  const byName = new Map<string, PersonRef>();
  const refs = new Set<PersonRef>();

  function index(ref: PersonRef) {
    refs.add(ref);
    if (ref.data.nik_key) byNik.set(ref.data.nik_key, ref);
    if (ref.data.employee_key) byEmployee.set(ref.data.employee_key, ref);
    if (ref.data.email_key) byEmail.set(ref.data.email_key, ref);
    if (ref.data.name_key && !byName.has(ref.data.name_key)) byName.set(ref.data.name_key, ref);
  }

  for (const person of existing.filter((item) => item.participant_type === "EMPLOYEE")) {
    index({ id: Number(person.id), data: { ...person }, existing: true });
  }

  function resolve(data: PersonRow) {
    let ref = (data.nik_key && byNik.get(data.nik_key))
      || (data.employee_key && byEmployee.get(data.employee_key))
      || (data.email_key && byEmail.get(data.email_key))
      || null;
    if (!ref && !data.nik_key && !data.employee_key && !data.email_key) ref = byName.get(data.name_key) || null;
    if (ref) {
      mergePerson(ref.data, data);
      index(ref);
      return ref;
    }
    ref = { id: null, data, existing: false };
    index(ref);
    return ref;
  }

  function attachInserted(inserted: any[]) {
    for (const person of inserted) {
      const data = { ...person } as PersonRow;
      const ref = (data.nik_key && byNik.get(data.nik_key))
        || (data.employee_key && byEmployee.get(data.employee_key))
        || (data.email_key && byEmail.get(data.email_key))
        || byName.get(data.name_key);
      if (ref && !ref.id) {
        ref.id = Number(person.id);
        ref.data = data;
        index(ref);
      }
    }
  }

  return { resolve, refs, attachInserted };
}

function servicePayload(row: VaccinationHistoryRow, companyId: number, personId: number, batchId: number, fileName: string, fileHash: string, sheetName: string) {
  return {
    company_id: companyId,
    person_id: personId,
    service_date: row.serviceDate,
    service_category: row.serviceCategory || "VACCINATION",
    service_name: historyText(row.serviceName) || "Historical Service",
    product_brand: historyText(row.productBrand) || null,
    vaccine_id: null,
    dose_number: null,
    lot_number: null,
    location: historyText(row.location) || null,
    next_due_date: row.nextDueDate,
    notes: historyText(row.notes) || null,
    source_type: "HISTORICAL_IMPORT",
    source_year: row.sourceYear,
    source_filename: fileName,
    source_file_hash: fileHash,
    source_sheet: sheetName,
    source_row: row.sourceRow,
    raw_json: row.raw || {},
    import_batch_id: batchId,
  };
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  const role = String((user as any)?.role || "").trim().toLowerCase();
  if (!["admin", "vaccination_admin", "vaccination_supervisor"].includes(role)) return fail("Import History hanya untuk Admin/Supervisor Vaksinasi.", 403);

  try {
    const form = await req.formData();
    const file = form.get("file");
    const mode = historyText(form.get("mode") || "preview").toLowerCase();
    const companyName = historyText(form.get("companyName"));
    const fallbackYear = historyYear(form.get("sourceYear"));

    if (!(file instanceof File)) return fail("File Excel wajib dipilih.");
    if (!companyName) return fail("Nama perusahaan wajib diisi.");
    if (!/\.(xlsx|xls)$/i.test(file.name || "")) return fail("Gunakan file Excel .xlsx atau .xls.");
    if (file.size > 20 * 1024 * 1024) return fail("Ukuran file maksimal 20 MB.");

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const parsed = parseVaccinationHistoryWorkbook(buffer, fallbackYear);
    const summary = summarizeVaccinationHistoryRows(parsed.rows);
    const preview = parsed.rows.slice(0, 12).map((row) => ({
      row: row.sourceRow,
      type: row.participantType,
      name: row.participantName,
      employeeId: row.participantType === "DEPENDENT" ? row.parentEmployeeId : row.employeeId,
      email: row.participantType === "DEPENDENT" ? row.parentEmail : row.email,
      serviceDate: row.serviceDate,
      service: row.serviceName || "Identity only",
      brand: row.productBrand,
      location: row.location,
    }));

    if (mode !== "import") {
      return ok({
        mode: "preview",
        companyName,
        fileName: file.name,
        fileHash,
        template: parsed.template,
        sheetName: parsed.sheetName,
        warnings: parsed.warnings,
        summary,
        preview,
      });
    }

    const supabase = supabaseAdmin();
    const companyKey = historyCompanyKey(companyName);
    let companyResult = await supabase.from("vaccination_history_companies").select("*").eq("company_key", companyKey).maybeSingle();
    if (companyResult.error) throw new Error(companyResult.error.message);
    let company = companyResult.data;
    if (!company) {
      const inserted = await supabase.from("vaccination_history_companies").insert({ company_name: companyName, company_key: companyKey }).select("*").single();
      if (inserted.error) throw new Error(inserted.error.message);
      company = inserted.data;
    } else if (company.company_name !== companyName) {
      await supabase.from("vaccination_history_companies").update({ company_name: companyName, updated_at: new Date().toISOString() }).eq("id", company.id);
    }
    const companyId = Number(company.id);

    const previousBatch = await supabase
      .from("vaccination_history_import_batches")
      .select("id,status,imported_at")
      .eq("company_id", companyId)
      .eq("source_file_hash", fileHash)
      .eq("source_sheet", parsed.sheetName)
      .eq("status", "IMPORTED")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousBatch.error) throw new Error(previousBatch.error.message);
    if (previousBatch.data) {
      return ok({
        mode: "import",
        alreadyImported: true,
        message: "File yang sama sudah pernah diimport. Tidak ada data yang diduplikasi.",
        batchId: previousBatch.data.id,
        summary,
      });
    }

    const existingPersons = await fetchCompanyPersons(supabase, companyId);
    const adultResolver = createAdultResolver(existingPersons);
    const rowAdultRefs = new Map<number, PersonRef>();
    const dependentParentRefs = new Map<number, PersonRef>();
    let skippedRows = 0;

    for (const row of parsed.rows) {
      if (row.participantType === "EMPLOYEE") {
        const ref = adultResolver.resolve(rowAdultData(companyId, row));
        rowAdultRefs.set(row.sourceRow, ref);
      } else {
        const parent = rowParentData(companyId, row);
        if (!parent.nik_key && !parent.employee_key && !parent.email_key) {
          skippedRows += 1;
          continue;
        }
        dependentParentRefs.set(row.sourceRow, adultResolver.resolve(parent));
      }
    }

    const newAdults = Array.from(adultResolver.refs).filter((ref) => !ref.id).map((ref) => ref.data);
    if (newAdults.length) {
      const insertedAdults = await insertChunks(supabase, "vaccination_persons", newAdults);
      adultResolver.attachInserted(insertedAdults);
    }

    const updates = Array.from(adultResolver.refs)
      .filter((ref) => ref.id && ref.existing)
      .map((ref) => ({ ...ref.data, id: ref.id, updated_at: new Date().toISOString() }));
    if (updates.length) await insertChunks(supabase, "vaccination_persons", updates, { upsert: true, onConflict: "id" });

    const allPersonsAfterAdults = [...existingPersons];
    for (const ref of adultResolver.refs) {
      if (ref.id) allPersonsAfterAdults.push({ ...ref.data, id: ref.id });
    }
    const personById = new Map<number, any>();
    for (const person of allPersonsAfterAdults) if (person?.id) personById.set(Number(person.id), person);

    const existingRelationships = await fetchCompanyRelationships(supabase, companyId);
    const childByParentName = new Map<string, PersonRef>();
    for (const relationship of existingRelationships) {
      const child = personById.get(Number(relationship.dependent_person_id));
      if (!child) continue;
      const key = `${relationship.parent_person_id}|${child.name_key}`;
      childByParentName.set(key, { id: Number(child.id), data: { ...child }, existing: true });
    }

    const newChildRefs: PersonRef[] = [];
    const rowChildRefs = new Map<number, PersonRef>();
    const relationshipDrafts: Array<{ company_id: number; parent_person_id: number; dependent_ref: PersonRef; relationship_type: string; active: boolean }> = [];

    for (const row of parsed.rows.filter((item) => item.participantType === "DEPENDENT")) {
      const parentRef = dependentParentRefs.get(row.sourceRow);
      if (!parentRef?.id) continue;
      const childData = rowChildData(companyId, row);
      const relationKey = `${parentRef.id}|${childData.name_key}`;
      let childRef = childByParentName.get(relationKey);
      if (!childRef) {
        childRef = { id: null, data: childData, existing: false };
        childByParentName.set(relationKey, childRef);
        newChildRefs.push(childRef);
        relationshipDrafts.push({ company_id: companyId, parent_person_id: parentRef.id, dependent_ref: childRef, relationship_type: "CHILD", active: true });
      } else {
        mergePerson(childRef.data, childData);
      }
      rowChildRefs.set(row.sourceRow, childRef);
    }

    if (newChildRefs.length) {
      const insertedChildren = await insertChunks(supabase, "vaccination_persons", newChildRefs.map((ref) => ref.data));
      for (let index = 0; index < newChildRefs.length; index += 1) {
        const person = insertedChildren[index];
        if (!person) continue;
        newChildRefs[index].id = Number(person.id);
        newChildRefs[index].data = { ...person };
      }
    }

    const relationRows = relationshipDrafts
      .filter((item) => item.dependent_ref.id)
      .map((item) => ({
        company_id: item.company_id,
        parent_person_id: item.parent_person_id,
        dependent_person_id: item.dependent_ref.id,
        relationship_type: item.relationship_type,
        active: item.active,
      }));
    if (relationRows.length) {
      await insertChunks(supabase, "vaccination_person_relationships", relationRows, {
        upsert: true,
        onConflict: "company_id,parent_person_id,dependent_person_id",
        ignoreDuplicates: true,
      });
    }

    const batchInsert = await supabase.from("vaccination_history_import_batches").insert({
      company_id: companyId,
      source_filename: file.name,
      source_file_hash: fileHash,
      source_sheet: parsed.sheetName,
      source_year: fallbackYear || parsed.rows.find((row) => row.sourceYear)?.sourceYear || null,
      source_type: "HISTORICAL_EXCEL",
      detected_template: parsed.template,
      total_rows: summary.totalRows,
      person_rows: summary.personRows,
      service_rows: summary.serviceRows,
      dependent_rows: summary.dependentRows,
      skipped_rows: skippedRows,
      status: "IMPORTED",
      imported_by: historyUserLabel(user),
      metadata: { warnings: parsed.warnings, summary },
    }).select("*").single();
    if (batchInsert.error) throw new Error(batchInsert.error.message);
    const batchId = Number(batchInsert.data.id);

    const serviceRows: any[] = [];
    for (const row of parsed.rows) {
      if (row.identityOnly || !historyText(row.serviceName)) continue;
      const personRef = row.participantType === "DEPENDENT" ? rowChildRefs.get(row.sourceRow) : rowAdultRefs.get(row.sourceRow);
      if (!personRef?.id) continue;
      serviceRows.push(servicePayload(row, companyId, personRef.id, batchId, file.name, fileHash, parsed.sheetName));
    }

    const insertedServices = serviceRows.length
      ? await insertChunks(supabase, "vaccination_service_history", serviceRows, {
          upsert: true,
          onConflict: "company_id,source_file_hash,source_sheet,source_row",
          ignoreDuplicates: true,
        })
      : [];

    return ok({
      mode: "import",
      message: `Import selesai: ${summary.personRows} baris identitas diproses, ${insertedServices.length} history layanan baru tersimpan.`,
      company: { id: companyId, name: companyName, publicToken: company.public_token },
      batchId,
      template: parsed.template,
      warnings: parsed.warnings,
      summary: { ...summary, skippedRows, insertedServices: insertedServices.length },
    });
  } catch (error: any) {
    const message = String(error?.message || error || "Import history gagal.");
    if (/vaccination_history_companies|vaccination_persons|vaccination_service_history|vaccination_history_import_batches/i.test(message)) {
      return fail("Database History Vaksinasi belum siap. Jalankan sql/vaccination_history_v151.sql di Supabase SQL Editor terlebih dahulu.", 500, { detail: message });
    }
    return fail(message, 500);
  }
}

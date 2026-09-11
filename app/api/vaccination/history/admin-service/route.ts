import crypto from "crypto";
import { NextRequest } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { historyDateOnly, historyServiceCategory, historyText, historyUserLabel } from "@/lib/vaccination/history";
import { fail, ok, requireUser, supabaseAdmin, toInt } from "../../_utils";

function servicePayload(body: any) {
  const serviceName = historyText(body?.service_name);
  if (!serviceName) throw new Error("Nama layanan wajib diisi.");
  const serviceDate = historyDateOnly(body?.service_date);
  const nextDueDate = historyDateOnly(body?.next_due_date);
  const productBrand = historyText(body?.product_brand) || null;
  const dose = toInt(body?.dose_number, 0);
  return {
    service_date: serviceDate,
    service_category: historyText(body?.service_category) || historyServiceCategory(serviceName, productBrand),
    service_name: serviceName,
    product_brand: productBrand,
    dose_number: dose > 0 ? dose : null,
    lot_number: historyText(body?.lot_number) || null,
    location: historyText(body?.location) || null,
    next_due_date: nextDueDate,
    notes: historyText(body?.notes) || null,
  };
}

function allowed(user: any) {
  return Boolean(user && canVaccinationAccess(user, "dashboard"));
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!allowed(user)) return fail("Akses edit History ditolak.", 403);
  const body = await req.json().catch(() => ({}));
  const companyId = toInt(body?.company_id, 0);
  const personId = toInt(body?.person_id, 0);
  if (!companyId || !personId) return fail("Perusahaan dan peserta wajib dipilih.", 400);

  try {
    const payload = servicePayload(body);
    const supabase = supabaseAdmin();
    const { data: person, error: personError } = await supabase
      .from("vaccination_persons")
      .select("id,company_id,participant_name")
      .eq("id", personId)
      .eq("company_id", companyId)
      .eq("active", true)
      .maybeSingle();
    if (personError) throw new Error(personError.message);
    if (!person) return fail("Peserta History tidak ditemukan.", 404);

    const actor = historyUserLabel(user);
    const now = new Date().toISOString();
    const manualKey = `admin-${crypto.randomUUID()}`;
    const sourceYear = payload.service_date ? Number(payload.service_date.slice(0, 4)) : null;
    const insertPayload = {
      company_id: companyId,
      person_id: personId,
      ...payload,
      source_type: "ADMIN_MANUAL",
      source_year: sourceYear,
      source_filename: "Admin Manual Entry",
      source_file_hash: manualKey,
      source_sheet: "ADMIN",
      source_row: 1,
      raw_json: { manual: true, created_by: actor, created_at: now },
      import_batch_id: null,
    };

    const { data: service, error: insertError } = await supabase
      .from("vaccination_service_history")
      .insert(insertPayload)
      .select("*")
      .single();
    if (insertError) throw new Error(insertError.message);

    await supabase.from("vaccination_history_service_audit").insert({
      service_id: service.id,
      company_id: companyId,
      person_id: personId,
      action: "ADD",
      changed_by: actor,
      before_json: null,
      after_json: service,
      created_at: now,
    });

    return ok({ service, message: "Layanan berhasil ditambahkan dan langsung tampil di Portal Peserta." });
  } catch (error: any) {
    return fail(error?.message || "Gagal menambah layanan History.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const user = requireUser(req);
  if (!allowed(user)) return fail("Akses edit History ditolak.", 403);
  const body = await req.json().catch(() => ({}));
  const serviceId = toInt(body?.service_id, 0);
  const companyId = toInt(body?.company_id, 0);
  const personId = toInt(body?.person_id, 0);
  if (!serviceId || !companyId || !personId) return fail("Service, perusahaan, dan peserta wajib dipilih.", 400);

  try {
    const payload = servicePayload(body);
    const supabase = supabaseAdmin();
    const { data: before, error: beforeError } = await supabase
      .from("vaccination_service_history")
      .select("*")
      .eq("id", serviceId)
      .eq("company_id", companyId)
      .eq("person_id", personId)
      .maybeSingle();
    if (beforeError) throw new Error(beforeError.message);
    if (!before) return fail("History layanan tidak ditemukan.", 404);

    const actor = historyUserLabel(user);
    const now = new Date().toISOString();
    const raw = before.raw_json && typeof before.raw_json === "object" ? before.raw_json : {};
    const updatePayload = {
      ...payload,
      source_year: payload.service_date ? Number(payload.service_date.slice(0, 4)) : before.source_year,
      raw_json: {
        ...raw,
        admin_last_edit: {
          by: actor,
          at: now,
          previous: {
            service_date: before.service_date,
            service_name: before.service_name,
            product_brand: before.product_brand,
            next_due_date: before.next_due_date,
            location: before.location,
            dose_number: before.dose_number,
            lot_number: before.lot_number,
            notes: before.notes,
          },
        },
      },
    };

    const { data: service, error: updateError } = await supabase
      .from("vaccination_service_history")
      .update(updatePayload)
      .eq("id", serviceId)
      .eq("company_id", companyId)
      .eq("person_id", personId)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);

    await supabase.from("vaccination_history_service_audit").insert({
      service_id: service.id,
      company_id: companyId,
      person_id: personId,
      action: "EDIT",
      changed_by: actor,
      before_json: before,
      after_json: service,
      created_at: now,
    });

    return ok({ service, message: "History layanan berhasil diperbarui dan langsung tampil di Portal Peserta." });
  } catch (error: any) {
    return fail(error?.message || "Gagal memperbarui History layanan.", 500);
  }
}

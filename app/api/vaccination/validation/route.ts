import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { supabaseAdmin } from "../_utils";
import { reverseQueueDoneTrack, syncRegistrationTrackDone } from "@/lib/vaccination/queueDoneInventory";

// V530_VALIDATION_SERVICE_STATE_ISOLATION
// V520_SERVICE_SPECIFIC_QUEUE_MODE
// V518_RECORD_ONLY_VALIDATION_WORKFLOW
// VACCINATION_ROLE_GUARD_V150
// V148_VALIDATION_DETAIL_API
// V148_5_VALIDATION_FILTERS_AND_EXACT_STICKER
// V148_6_RECOVER_LABEL_RECORDS_AND_SESSION_LOCATIONS
// V148_6_1_SUPABASE_RELATION_TYPE_FIX

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(data: any, status = 200) {
  const res = NextResponse.json(data, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toId(value: any) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function missingColumn(error: any) {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "");
  return code === "42703" || msg.includes("column") || msg.includes("schema cache");
}

function parseQueueNumber(text: any) {
  const match = clean(text).match(/\b[A-Z]-\d+\b/i);
  return match ? match[0].toUpperCase() : "";
}

function productDetail(record: any) {
  return {
    record_id: toId(record?.id),
    vaccine_id: toId(record?.vaccine_id),
    lot_id: toId(record?.lot_id),
    vaccine_name: clean(record?.vaccine_name) || "Vaksin",
    lot_number: clean(record?.lot_number) || "-",
    dose_number: Number(record?.dose_number || 1),
    administered_at: record?.administered_at || null,
    administered_by: clean(record?.administered_by) || "-",
    note: clean(record?.notes) || "",
    status: clean(record?.status) || "ADMINISTERED",
  };
}

function itemDetail(item: any) {
  return {
    record_id: toId(item?.administered_record_id),
    vaccine_id: toId(item?.vaccine_id),
    lot_id: toId(item?.lot_id),
    vaccine_name: clean(item?.vaccine?.name || item?.vaccine_name) || "Vaksin",
    lot_number: clean(item?.lot?.lot_number || item?.lot_number) || "-",
    dose_number: Number(item?.dose_number || 1),
    administered_at: item?.administered_at || null,
    administered_by: "-",
    note: "",
    status: clean(item?.status) || "ADMINISTERED",
    service_mode: clean(item?.service_mode).toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY",
    sale_mode: clean(item?.sale_mode).toUpperCase() === "PACKAGE" ? "PACKAGE" : "NON_PACKAGE",
    package_dose_count: Math.max(1, Number(item?.package_dose_count || 1)),
    sales_price_snapshot: item?.sales_price_snapshot ?? null,
    price: item?.price ?? null,
    payment_surcharge_percent: item?.payment_surcharge_percent ?? null,
    payment_surcharge_amount: item?.payment_surcharge_amount ?? null,
    payment_total: item?.payment_total ?? null,
    payment_method: clean(item?.payment_method),
    payment_note: clean(item?.payment_note),
  };
}

function normalizeServiceMode(value: any): "HEALTHDAY" | "BAZAR" {
  return clean(value).toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
}

function queueFlags(row: any) {
  const flow = row.session?.existing_flow_config || {};
  const legacyQueue = flow?.queue !== false;
  return {
    healthdayQueueEnabled: flow?.queue_healthday === undefined ? legacyQueue : flow?.queue_healthday !== false,
    bazarQueueEnabled: flow?.queue_bazar === undefined ? legacyQueue : flow?.queue_bazar !== false,
  };
}

function isDoneTrackStatus(value: any) {
  return ["DONE", "FINISHED", "ADMINISTERED", "SELESAI"].includes(clean(value).toUpperCase());
}

function isPendingTrackStatus(value: any) {
  return ["PENDING_VALIDATION", "PENDING"].includes(clean(value).toUpperCase());
}

function serviceTrackStatus(row: any, serviceMode: "HEALTHDAY" | "BAZAR") {
  return clean(serviceMode === "BAZAR" ? row.bazar_queue_status : (row.queue_status || row.status)).toUpperCase();
}

function hasServiceTrack(row: any, itemRows: any[], serviceMode: "HEALTHDAY" | "BAZAR") {
  const itemExists = (itemRows || []).some((item: any) => normalizeServiceMode(item?.service_mode) === serviceMode);
  if (itemExists) return true;

  const serviceStatus = clean(row.patient_service_status || "").toUpperCase();
  if (serviceStatus === "COMBINATION" || serviceStatus === serviceMode) return true;

  if (serviceMode === "BAZAR") {
    return Boolean(clean(row.bazar_queue_number) || clean(row.bazar_queue_status));
  }
  return Boolean(clean(row.queue_number || row.queue_no || row.queue_label) || clean(row.queue_status || row.status));
}

function displayForService(
  row: any,
  serviceMode: "HEALTHDAY" | "BAZAR",
  recordRows: any[] = [],
  itemRows: any[] = [],
) {
  const recordProducts = (recordRows || []).map(productDetail);
  const itemProducts = (itemRows || []).map(itemDetail);
  const serviceItemProducts = itemProducts.filter((item: any) => normalizeServiceMode(item?.service_mode) === serviceMode);
  const products = serviceItemProducts.length ? serviceItemProducts : recordProducts;
  const recordIds = products.map((item) => item.record_id).filter(Boolean);
  const productName = products.length === 1
    ? products[0].vaccine_name
    : products.length > 1
      ? `${products.length} vaksin / layanan`
      : (row.product_name || row.vaccine_name || row.vaccine || row.batch_name || row.batchname || row.layanan || row.service_name || "Vaksin");

  const { healthdayQueueEnabled, bazarQueueEnabled } = queueFlags(row);
  const trackStatus = serviceTrackStatus(row, serviceMode);
  const done = isDoneTrackStatus(trackStatus);
  const serviceAdministeredAt = serviceItemProducts
    .map((item: any) => item?.administered_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null;

  return {
    id: row.id,
    row_key: `${row.id}:${serviceMode}`,
    session_id: row.session_id,
    queue_number: serviceMode === "BAZAR"
      ? (row.bazar_queue_number || "")
      : (row.queue_number || row.queue_no || parseQueueNumber(row.queue_label)),
    employee_id: clean(row.employee_id || row.mcu_id),
    payment_method: serviceMode === "BAZAR" ? clean(row.payment_method) : "",
    company_name: clean(row.session?.company_name || row.company_name),
    internal_queue_enabled: serviceMode === "BAZAR" ? bazarQueueEnabled : healthdayQueueEnabled,
    validation_service_mode: serviceMode,
    patient_name: row.patient_name || row.participant_name || row.name || row.full_name || row.nama || row.nama_peserta || "-",
    doctor_name: row.doctor_name || row.doctor || row.petugas_name || row.staff_name || row.administered_by || row.updated_by || "-",
    product_name: productName,
    lot_number: products.length === 1 ? products[0].lot_number : "",
    note: /pindah\s+lokasi\s+layanan/i.test(clean(row.status_note))
      ? clean(row.status_note)
      : (row.cancelled_note || row.status_note || row.note || row.notes || row.payment_note || row.product_note || row.keterangan || ""),
    print_status: row.print_status || "NOT_PRINTED",
    validation_status: done ? "DONE" : (isPendingTrackStatus(trackStatus) ? "PENDING" : trackStatus || "PENDING"),
    validated_at: serviceAdministeredAt || (done ? row.validated_at : null) || null,
    validated_by: done ? clean(row.validated_by) : "",
    queue_status: trackStatus,
    location: clean(row.session?.location || row.location) || "-",
    session_date: row.session?.session_date || row.session_date || null,
    session_name: clean(row.session?.session_name || row.session_name) || "-",
    products,
    record_ids: recordIds,
    raw: row,
  };
}

function displayLegacy(row: any, recordRows: any[] = [], itemRows: any[] = []) {
  const serviceStatus = clean(row.patient_service_status || "HEALTHDAY").toUpperCase();
  const mode: "HEALTHDAY" | "BAZAR" = serviceStatus === "BAZAR" ? "BAZAR" : "HEALTHDAY";
  const displayed = displayForService(row, mode, recordRows, itemRows);
  return {
    ...displayed,
    row_key: `${row.id}:LEGACY`,
    payment_method: clean(row.payment_method),
    validation_status: clean(row.validation_status) || displayed.validation_status,
    validated_at: row.validated_at || displayed.validated_at,
    validated_by: clean(row.validated_by) || displayed.validated_by,
  };
}

async function loadRecordsForRegistrations(supabase: any, registrationIds: number[]) {
  if (!registrationIds.length) return new Map<number, any[]>();

  const result = await supabase
    .from("vaccination_records")
    .select("id,registration_id,vaccine_id,lot_id,vaccine_name,lot_number,dose_number,administered_at,administered_by,notes,status")
    .in("registration_id", registrationIds)
    .order("administered_at", { ascending: true })
    .order("id", { ascending: true });

  if (result.error) throw new Error(result.error.message);

  const byRegistration = new Map<number, any[]>();
  for (const record of result.data || []) {
    const key = Number(record.registration_id);
    if (!byRegistration.has(key)) byRegistration.set(key, []);
    byRegistration.get(key)!.push(record);
  }
  return byRegistration;
}

type ValidationRemainderBackup = {
  item: any;
  record: any;
  lotId: number;
  lotStockUsed: number;
};

async function reverseValidationAdministeredRemainder(
  supabase: any,
  registrationId: number,
  serviceModeInput: any,
  actorInput: any,
) {
  const serviceMode = normalizeServiceMode(serviceModeInput);
  const actor = clean(actorInput) || "Tim Validasi";
  const now = new Date().toISOString();
  const itemResult = await supabase
    .from("vaccination_registration_items")
    .select("id,registration_id,vaccine_id,lot_id,status,service_mode,administered_record_id,administered_at,active")
    .eq("registration_id", registrationId)
    .eq("service_mode", serviceMode)
    .eq("active", true)
    .in("status", ["ADMINISTERED", "DONE", "FINISHED"])
    .limit(1000);
  if (itemResult.error) throw new Error(itemResult.error.message);

  const backups: ValidationRemainderBackup[] = [];
  try {
    for (const item of itemResult.data || []) {
      const recordId = Number(item.administered_record_id || 0);
      const lotId = Number(item.lot_id || 0);
      if (!recordId || !lotId) continue;
      const [recordResult, lotResult] = await Promise.all([
        supabase.from("vaccination_records").select("*").eq("id", recordId).eq("registration_id", registrationId).maybeSingle(),
        supabase.from("vaccination_vaccine_lots").select("id,stock_used").eq("id", lotId).maybeSingle(),
      ]);
      if (recordResult.error) throw new Error(recordResult.error.message);
      if (lotResult.error) throw new Error(lotResult.error.message);
      if (!recordResult.data || !lotResult.data) continue;
      if (["VOIDED", "CANCELLED", "CANCELED"].includes(clean(recordResult.data.status).toUpperCase())) continue;

      const backup: ValidationRemainderBackup = {
        item: { ...item },
        record: { ...recordResult.data },
        lotId,
        lotStockUsed: Number(lotResult.data.stock_used || 0),
      };

      const lotUpdate = await supabase
        .from("vaccination_vaccine_lots")
        .update({ stock_used: Math.max(0, backup.lotStockUsed - 1), updated_at: now })
        .eq("id", lotId);
      if (lotUpdate.error) throw new Error(lotUpdate.error.message);

      const recordUpdate = await supabase
        .from("vaccination_records")
        .update({
          status: "VOIDED",
          notes: `${clean(recordResult.data.notes)}${clean(recordResult.data.notes) ? " · " : ""}VALIDATION_CANCEL_REVERSAL:${serviceMode}:${actor}`,
        })
        .eq("id", recordId)
        .eq("registration_id", registrationId);
      if (recordUpdate.error) {
        await supabase.from("vaccination_vaccine_lots").update({ stock_used: backup.lotStockUsed, updated_at: new Date().toISOString() }).eq("id", lotId);
        throw new Error(recordUpdate.error.message);
      }

      const itemUpdate = await supabase
        .from("vaccination_registration_items")
        .update({ status: "WAITING", administered_record_id: null, administered_at: null, updated_at: now })
        .eq("id", Number(item.id))
        .eq("registration_id", registrationId);
      if (itemUpdate.error) {
        await supabase.from("vaccination_records").update({ status: backup.record.status, notes: backup.record.notes }).eq("id", recordId);
        await supabase.from("vaccination_vaccine_lots").update({ stock_used: backup.lotStockUsed, updated_at: new Date().toISOString() }).eq("id", lotId);
        throw new Error(itemUpdate.error.message);
      }
      backups.push(backup);
    }
  } catch (error) {
    for (const backup of [...backups].reverse()) {
      await supabase.from("vaccination_vaccine_lots").update({ stock_used: backup.lotStockUsed, updated_at: new Date().toISOString() }).eq("id", backup.lotId);
      await supabase.from("vaccination_records").update({ status: backup.record.status, notes: backup.record.notes }).eq("id", Number(backup.record.id));
      await supabase.from("vaccination_registration_items").update({
        status: backup.item.status,
        administered_record_id: backup.item.administered_record_id,
        administered_at: backup.item.administered_at,
        updated_at: new Date().toISOString(),
      }).eq("id", Number(backup.item.id));
    }
    throw error;
  }
  return backups;
}

async function restoreValidationAdministeredRemainder(supabase: any, backups: ValidationRemainderBackup[]) {
  for (const backup of [...backups].reverse()) {
    await supabase.from("vaccination_vaccine_lots").update({ stock_used: backup.lotStockUsed, updated_at: new Date().toISOString() }).eq("id", backup.lotId);
    await supabase.from("vaccination_records").update({ status: backup.record.status, notes: backup.record.notes }).eq("id", Number(backup.record.id));
    await supabase.from("vaccination_registration_items").update({
      status: backup.item.status,
      administered_record_id: backup.item.administered_record_id,
      administered_at: backup.item.administered_at,
      updated_at: new Date().toISOString(),
    }).eq("id", Number(backup.item.id));
  }
}

async function finalizeValidationAdministeredRemainder(supabase: any, backups: ValidationRemainderBackup[], registrationId: number, serviceModeInput: any, actorInput: any) {
  if (!backups.length) return;
  const serviceMode = normalizeServiceMode(serviceModeInput);
  const actor = clean(actorInput) || "Tim Validasi";
  const recordIds = backups.map((backup) => Number(backup.record.id)).filter(Boolean);
  if (recordIds.length) await supabase.from("vaccination_reminders").delete().in("record_id", recordIds);
  const auditRows = backups.map((backup) => ({
    vaccine_id: Number(backup.record.vaccine_id || backup.item.vaccine_id || 0) || null,
    lot_id: Number(backup.record.lot_id || backup.item.lot_id || 0) || null,
    movement_type: "validation_done_reversal_audit",
    qty: 0,
    reference_type: "registration",
    reference_id: registrationId,
    notes: `Validation Done reversed · ${serviceMode} · record ${Number(backup.record.id)} · by ${actor}`,
    created_by: actor,
  }));
  if (auditRows.length) await supabase.from("vaccination_inventory_movements").insert(auditRows);
}

async function loadItemsForRegistrations(supabase: any, registrationIds: number[]) {
  if (!registrationIds.length) return new Map<number, any[]>();

  const result = await supabase
    .from("vaccination_registration_items")
    .select("id,registration_id,vaccine_id,lot_id,dose_number,status,service_mode,administered_record_id,administered_at,active,sale_mode,package_dose_count,sales_price_snapshot,price,payment_method,payment_note,payment_surcharge_percent,payment_surcharge_amount,payment_total,vaccine:vaccination_vaccines(id,name,brand),lot:vaccination_vaccine_lots(id,lot_number)")
    .in("registration_id", registrationIds)
    .eq("active", true)
    .order("id", { ascending: true });

  if (result.error) throw new Error(result.error.message);

  const byRegistration = new Map<number, any[]>();
  for (const item of result.data || []) {
    const key = Number(item.registration_id);
    if (!byRegistration.has(key)) byRegistration.set(key, []);
    byRegistration.get(key)!.push(item);
  }
  return byRegistration;
}

// V547_VALIDATION_MOVE_SESSION_ZERO_STOCK_CATALOG_OPTIONS
export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return json({ ok: false, message: "Unauthorized", rows: [] }, 401);
  if (!canVaccinationAccess(user, "validation")) return json({ ok: false, message: "Akses Tim Validasi ditolak untuk role ini.", rows: [] }, 403);
  try {
    const url = new URL(req.url);
    const sessionId = clean(url.searchParams.get("session_id"));
    const getAction = clean(url.searchParams.get("action")).toLowerCase();
    const supabase = supabaseAdmin();

    if (getAction === "move-options") {
      const targetSessionId = toId(sessionId);
      const serviceMode = normalizeServiceMode(url.searchParams.get("service_mode"));
      if (!targetSessionId) return json({ ok: false, message: "Session tujuan wajib dipilih." }, 400);

      const [sessionResult, assignmentResult, allocationResult] = await Promise.all([
        supabase.from("vaccination_sessions").select("id,session_name,company_name,location,session_date,existing_flow_config,status").eq("id", targetSessionId).maybeSingle(),
        supabase.from("vaccination_session_product_assignments").select("vaccine_id,service_mode,active").eq("session_id", targetSessionId).eq("service_mode", serviceMode).eq("active", true).limit(10000),
        supabase.from("vaccination_session_stock_allocations").select("id,session_id,vaccine_id,lot_id,allocated_qty,service_mode,active").eq("session_id", targetSessionId).eq("service_mode", serviceMode).eq("active", true).limit(10000),
      ]);
      if (sessionResult.error) return json({ ok: false, message: sessionResult.error.message }, 500);
      if (!sessionResult.data) return json({ ok: false, message: "Session tujuan tidak ditemukan." }, 404);
      if (assignmentResult.error) return json({ ok: false, message: assignmentResult.error.message }, 500);
      if (allocationResult.error) return json({ ok: false, message: allocationResult.error.message }, 500);

      const assigned = new Set<number>((assignmentResult.data || []).map((row: any) => Number(row.vaccine_id || 0)).filter(Boolean));
      const allocations = allocationResult.data || [];
      const lotIds = Array.from(new Set<number>(allocations.map((row: any) => Number(row.lot_id || 0)).filter(Boolean)));
      const lotsResult = lotIds.length
        ? await supabase.from("vaccination_vaccine_lots").select("id,vaccine_id,lot_number,stock_scope,stock_session_id,active,vaccine:vaccination_vaccines(id,name,brand)").in("id", lotIds).eq("active", true)
        : { data: [], error: null } as any;
      if (lotsResult.error) return json({ ok: false, message: lotsResult.error.message }, 500);
      const usedResult = lotIds.length
        ? await supabase.from("vaccination_registration_items").select("lot_id,status").eq("session_id", targetSessionId).eq("service_mode", serviceMode).eq("active", true).in("lot_id", lotIds).limit(20000)
        : { data: [], error: null } as any;
      if (usedResult.error) return json({ ok: false, message: usedResult.error.message }, 500);
      const used = new Map<number, number>();
      for (const item of usedResult.data || []) {
        if (!["ADMINISTERED", "DONE", "FINISHED"].includes(clean(item.status).toUpperCase())) continue;
        const lotId = Number(item.lot_id || 0);
        used.set(lotId, (used.get(lotId) || 0) + 1);
      }
      const lotMap = new Map<number, any>((lotsResult.data || []).map((row: any) => [Number(row.id), row]));
      const options = allocations.map((allocation: any) => {
        const lot = lotMap.get(Number(allocation.lot_id || 0));
        if (!lot) return null;
        const vaccineId = Number(allocation.vaccine_id || lot.vaccine_id || 0);
        if (assigned.size && !assigned.has(vaccineId)) return null;
        if (clean(lot.stock_scope).toUpperCase() === "SESSION" && Number(lot.stock_session_id || 0) !== targetSessionId) return null;
        const remaining = Math.max(0, Number(allocation.allocated_qty || 0) - (used.get(Number(lot.id)) || 0));
        return {
          vaccine_id: vaccineId,
          vaccine_name: clean(lot.vaccine?.name) || `Produk ${vaccineId}`,
          brand: clean(lot.vaccine?.brand),
          lot_id: Number(lot.id),
          lot_number: clean(lot.lot_number),
          remaining,
          service_mode: serviceMode,
        };
      }).filter(Boolean);

      return json({ ok: true, session: sessionResult.data, serviceMode, options });
    }

    let query = supabase
      .from("vaccination_registrations")
      .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date,existing_flow_config)")
      .order("id", { ascending: false })
      .limit(1000);

    if (sessionId) query = query.eq("session_id", sessionId);
    query = query.or("queue_status.eq.PENDING_VALIDATION,bazar_queue_status.eq.PENDING_VALIDATION,validation_status.eq.PENDING,validation_status.eq.DONE");

    let result = await query;
    if (result.error && missingColumn(result.error)) {
      let fallback = supabase
        .from("vaccination_registrations")
        .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date,existing_flow_config)")
        .order("id", { ascending: false })
        .limit(1000);
      if (sessionId) fallback = fallback.eq("session_id", sessionId);
      result = await fallback;
    }

    if (result.error) {
      return json({ ok: false, message: result.error.message || "Gagal membaca daftar validasi.", rows: [] }, 500);
    }

    const validationRegistrations = (result.data || []).filter((row: any) => {
      const queueStatus = clean(row.queue_status || row.status).toUpperCase();
      const validationStatus = clean(row.validation_status).toUpperCase();
      const bazarQueueStatus = clean(row.bazar_queue_status).toUpperCase();
      return queueStatus === "PENDING_VALIDATION" || bazarQueueStatus === "PENDING_VALIDATION" || validationStatus === "PENDING" || validationStatus === "DONE";
    });

    const registrationIds = validationRegistrations.map((row: any) => Number(row.id)).filter(Boolean);
    let recordsByRegistration = new Map<number, any[]>();
    let itemsByRegistration = new Map<number, any[]>();
    try {
      recordsByRegistration = await loadRecordsForRegistrations(supabase, registrationIds);
      itemsByRegistration = await loadItemsForRegistrations(supabase, registrationIds);
    } catch (error: any) {
      return json({ ok: false, message: error?.message || "Gagal membaca detail layanan vaksin.", rows: [] }, 500);
    }

    const rows: any[] = [];
    for (const row of validationRegistrations) {
      const recordRows = recordsByRegistration.get(Number(row.id)) || [];
      const itemRows = itemsByRegistration.get(Number(row.id)) || [];
      const { healthdayQueueEnabled, bazarQueueEnabled } = queueFlags(row);

      // Standard/internal workflow keeps legacy validation behavior untouched.
      if (healthdayQueueEnabled && bazarQueueEnabled) {
        const validationStatus = clean(row.validation_status).toUpperCase();
        if (["PENDING", "DONE"].includes(validationStatus)) {
          rows.push(displayLegacy(row, recordRows, itemRows));
        }
        continue;
      }

      // Vendor/record-only workflow is isolated per service track.
      // One registration can therefore surface as two independent rows when
      // Healthday and Bazar are both external and both need validation.
      for (const serviceMode of ["HEALTHDAY", "BAZAR"] as const) {
        const queueEnabled = serviceMode === "BAZAR" ? bazarQueueEnabled : healthdayQueueEnabled;
        if (!hasServiceTrack(row, itemRows, serviceMode)) continue;

        const trackStatus = serviceTrackStatus(row, serviceMode);
        if (queueEnabled) {
          // V561: khusus Bazar internal queue, Queue DONE bukan vaksin DONE.
          // Setelah queue selesai, registration.validation_status=PENDING dan row
          // harus tetap muncul di Tim Validasi.
          if (serviceMode !== "BAZAR") continue;
          const validationStatus = clean(row.validation_status).toUpperCase();
          if (validationStatus !== "PENDING" && validationStatus !== "DONE") continue;
          const displayed = displayForService(row, serviceMode, recordRows, itemRows);
          displayed.validation_status = validationStatus;
          displayed.validated_at = validationStatus === "DONE" ? row.validated_at : null;
          displayed.validated_by = validationStatus === "DONE" ? clean(row.validated_by) : "";
          rows.push(displayed);
          continue;
        }

        if (!isPendingTrackStatus(trackStatus) && !isDoneTrackStatus(trackStatus)) continue;
        rows.push(displayForService(row, serviceMode, recordRows, itemRows));
      }
    }

    // V148.6: pilihan lokasi berasal dari vaccination_sessions, bukan hanya peserta pending.
    let sessionLocationQuery = supabase
      .from("vaccination_sessions")
      .select("id,session_name,company_name,location,session_date,existing_flow_config,status")
      .order("session_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(2000);

    // V546: filter Session pada tabel Validasi tidak boleh membatasi daftar tujuan Pindah Lokasi.
    // Rows tetap difilter oleh sessionId di query registrasi di atas, tetapi dropdown tujuan
    // harus membaca seluruh Session agar peserta bisa benar-benar dipindahkan.
    const sessionLocationResult = await sessionLocationQuery;
    const sessionLocations = sessionLocationResult.error
      ? []
      : (sessionLocationResult.data || [])
          .map((session: any) => ({
            session_id: Number(session.id),
            session_name: clean(session.session_name) || `Session ${session.id}`,
            company_name: clean(session.company_name),
            location: clean(session.location),
            session_date: session.session_date || null,
            existing_flow_config: session.existing_flow_config || null,
            status: clean(session.status),
          }))
          .filter((session: any) => session.location);

    // V548: expose cancelled/moved history separately without mixing it back into active validation rows.
    let cancelledQuery = supabase
      .from("vaccination_registrations")
      .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date,existing_flow_config)")
      .order("id", { ascending: false })
      .limit(1000);
    if (sessionId) cancelledQuery = cancelledQuery.eq("session_id", sessionId);
    const cancelledResult = await cancelledQuery;

    const cancelledSource = cancelledResult.error ? [] : (cancelledResult.data || []).filter((row: any) => {
      const statuses = [row.validation_status, row.queue_status, row.bazar_queue_status]
        .map((value) => clean(value).toUpperCase());
      return statuses.some((status) => ["CANCELLED", "CANCELED"].includes(status));
    });

    const cancelledIds = cancelledSource.map((row: any) => Number(row.id)).filter(Boolean);
    const cancelledRecordsByRegistration = await loadRecordsForRegistrations(supabase, cancelledIds);
    const cancelledItemsByRegistration = await loadItemsForRegistrations(supabase, cancelledIds);
    const cancelledRows: any[] = [];

    for (const row of cancelledSource) {
      const recordRows = cancelledRecordsByRegistration.get(Number(row.id)) || [];
      const itemRows = cancelledItemsByRegistration.get(Number(row.id)) || [];
      const { healthdayQueueEnabled, bazarQueueEnabled } = queueFlags(row);

      if (healthdayQueueEnabled && bazarQueueEnabled) {
        const displayed = displayLegacy(row, recordRows, itemRows);
        displayed.validation_status = "CANCELLED";
        cancelledRows.push(displayed);
        continue;
      }

      let pushed = false;
      for (const serviceMode of ["HEALTHDAY", "BAZAR"] as const) {
        const queueEnabled = serviceMode === "BAZAR" ? bazarQueueEnabled : healthdayQueueEnabled;
        if (queueEnabled) continue;
        if (!hasServiceTrack(row, itemRows, serviceMode)) continue;
        const trackStatus = clean(serviceTrackStatus(row, serviceMode)).toUpperCase();
        if (!["CANCELLED", "CANCELED"].includes(trackStatus)) continue;
        const displayed = displayForService(row, serviceMode, recordRows, itemRows);
        displayed.validation_status = "CANCELLED";
        cancelledRows.push(displayed);
        pushed = true;
      }

      // Defensive fallback for older records whose per-service columns were not populated.
      if (!pushed && ["CANCELLED", "CANCELED"].includes(clean(row.validation_status).toUpperCase())) {
        const displayed = displayLegacy(row, recordRows, itemRows);
        displayed.validation_status = "CANCELLED";
        cancelledRows.push(displayed);
      }
    }

    const movedRows = cancelledRows.filter((row: any) => /pindah\s+lokasi\s+layanan/i.test(clean(row.note)));
    const plainCancelledRows = cancelledRows.filter((row: any) => !/pindah\s+lokasi\s+layanan/i.test(clean(row.note)));

    return json({
      ok: true,
      rows,
      moved_rows: movedRows,
      cancelled_rows: plainCancelledRows,
      session_locations: sessionLocations,
      sessions: sessionLocations,
    });
  } catch (error: any) {
    return json({ ok: false, message: error?.message || "Gagal membaca validasi.", rows: [] }, 500);
  }
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return json({ ok: false, message: "Unauthorized" }, 401);
  if (!canVaccinationAccess(user, "validation")) return json({ ok: false, message: "Akses Tim Validasi ditolak untuk role ini." }, 403);
  try {
    const body = await req.json().catch(() => ({}));
    const action = clean(body.action).toUpperCase();
    const id = toId(body.id ?? body.registration_id ?? body.registrationId);
    const sessionId = clean(body.session_id ?? body.sessionId);
    const queueNumber = clean(body.queue_number ?? body.queueNumber);
    const actor = clean(body.actor || body.petugas || body.user || "Tim Validasi");
    const note = clean(body.note || body.cancelled_note || body.reason);
    const requestedServiceMode = clean(body.service_mode || body.serviceMode).toUpperCase();
    const serviceMode: "HEALTHDAY" | "BAZAR" | null = requestedServiceMode === "BAZAR"
      ? "BAZAR"
      : requestedServiceMode === "HEALTHDAY"
        ? "HEALTHDAY"
        : null;
    const supabase = supabaseAdmin();

    let rowId = id;
    if (!rowId && queueNumber) {
      let find = supabase
        .from("vaccination_registrations")
        .select("id")
        .eq("queue_number", queueNumber)
        .order("id", { ascending: false })
        .limit(1);
      if (sessionId) find = find.eq("session_id", sessionId);
      const found = await find.maybeSingle();
      rowId = toId(found.data?.id);
    }

    if (!rowId) return json({ ok: false, message: "ID peserta/registrasi tidak terbaca." }, 400);

    const now = new Date().toISOString();

    // V148.6 recovery hanya membuat vaccination_records yang hilang untuk keperluan label.
    // TIDAK mengurangi stok dan TIDAK membuat inventory movement baru.
    if (action === "ENSURE_LABEL_RECORDS" || action === "ENSURE_PRINT_RECORDS") {
      const registrationResult = await supabase
        .from("vaccination_registrations")
        .select("*")
        .eq("id", rowId)
        .maybeSingle();

      if (registrationResult.error || !registrationResult.data) {
        return json({ ok: false, message: registrationResult.error?.message || "Registrasi tidak ditemukan." }, 404);
      }

      const registration = registrationResult.data;

      const itemsResult = await supabase
        .from("vaccination_registration_items")
        .select("id,registration_id,vaccine_id,lot_id,dose_number,status,administered_record_id,administered_at,item_note,payment_note,active,vaccine:vaccination_vaccines(id,name,brand),lot:vaccination_vaccine_lots(id,lot_number)")
        .eq("registration_id", rowId)
        .eq("active", true)
        .order("id", { ascending: true });

      if (itemsResult.error) {
        return json({ ok: false, message: itemsResult.error.message || "Gagal membaca item vaksin." }, 500);
      }

      const existingResult = await supabase
        .from("vaccination_records")
        .select("id,registration_id,session_id,vaccine_id,lot_id,vaccine_name,lot_number,dose_number,administered_at,administered_by,status")
        .eq("registration_id", rowId)
        .order("id", { ascending: true });

      if (existingResult.error) {
        return json({ ok: false, message: existingResult.error.message || "Gagal membaca vaccination record." }, 500);
      }

      const existingRecords: any[] = [...(existingResult.data || [])];
      const ensuredIds: number[] = [];

      for (const item of itemsResult.data || []) {
        const vaccineId = toId(item.vaccine_id);
        const lotId = toId(item.lot_id);
        const doseNumber = Number(item.dose_number || 1);
        if (!vaccineId || !lotId) continue;

        let record = existingRecords.find((candidate: any) =>
          Number(candidate.id) === Number(item.administered_record_id)
        );

        if (!record) {
          record = existingRecords.find((candidate: any) =>
            Number(candidate.vaccine_id) === vaccineId &&
            Number(candidate.lot_id) === lotId &&
            Number(candidate.dose_number || 1) === doseNumber
          );
        }

        if (!record) {
          const administeredAt = item.administered_at || registration.updated_at || registration.created_at || now;
          const administeredBy = clean(
            registration.administered_by ||
            registration.doctor_name ||
            registration.petugas_name ||
            registration.updated_by ||
            actor
          ) || actor || "Tim Validasi";

          // V148.6.1: Supabase relation hasil select dapat ditipkan sebagai array.
          // Normalisasi ke satu object sebelum membaca name / lot_number.
          const vaccineRelation: any = Array.isArray(item.vaccine) ? item.vaccine[0] : item.vaccine;
          const lotRelation: any = Array.isArray(item.lot) ? item.lot[0] : item.lot;

          const payload = {
            registration_id: rowId,
            session_id: Number(registration.session_id),
            participant_name: clean(registration.participant_name || registration.patient_name || registration.name) || "Peserta",
            vaccine_id: vaccineId,
            lot_id: lotId,
            vaccine_name: clean(vaccineRelation?.name || (item as any).vaccine_name) || "Vaksin",
            lot_number: clean(lotRelation?.lot_number || (item as any).lot_number) || "-",
            dose_number: doseNumber,
            administered_at: administeredAt,
            administered_by: administeredBy,
            notes: clean(item.item_note || item.payment_note || "") || null,
            status: "ADMINISTERED",
          };

          const inserted = await supabase
            .from("vaccination_records")
            .insert(payload)
            .select("*")
            .single();

          if (inserted.error || !inserted.data) {
            return json({ ok: false, message: inserted.error?.message || "Gagal membuat record label." }, 500);
          }

          record = inserted.data;
          existingRecords.push(record);
        }

        const recordId = Number(record.id);
        if (recordId > 0) ensuredIds.push(recordId);

        const itemUpdate = await supabase
          .from("vaccination_registration_items")
          .update({
            administered_record_id: recordId,
            administered_at: item.administered_at || record.administered_at || now,
            status: "ADMINISTERED",
          })
          .eq("id", item.id);

        if (itemUpdate.error) {
          return json({ ok: false, message: itemUpdate.error.message || "Gagal menghubungkan record label ke item." }, 500);
        }
      }

      // Jika item legacy tidak tersedia tetapi record sebenarnya sudah ada, tetap gunakan record yang ada.
      if (!ensuredIds.length) {
        for (const record of existingRecords) {
          const recordId = Number(record.id);
          if (recordId > 0) ensuredIds.push(recordId);
        }
      }

      const recordIds = Array.from(new Set(ensuredIds));
      if (!recordIds.length) {
        return json({ ok: false, message: "Data vaksin/lot belum cukup untuk membuat label. Cek item vaksin peserta." }, 400);
      }

      const stickerUrl = recordIds.length === 1
        ? `/vaccination/sticker/${recordIds[0]}`
        : `/vaccination/sticker/bulk?ids=${encodeURIComponent(recordIds.join(","))}`;

      return json({
        ok: true,
        message: `${recordIds.length} record label siap dicetak.`,
        record_ids: recordIds,
        stickerUrl,
      });
    }
    let payload: any = {};

    const registrationStateResult = await supabase
      .from("vaccination_registrations")
      .select("id,session_id,patient_service_status,queue_status,bazar_queue_status,validation_status")
      .eq("id", rowId)
      .maybeSingle();
    if (registrationStateResult.error || !registrationStateResult.data) {
      return json({ ok: false, message: registrationStateResult.error?.message || "Registrasi tidak ditemukan." }, 404);
    }
    const registrationState = registrationStateResult.data;

    const sessionModeResult = await supabase
      .from("vaccination_sessions")
      .select("id,existing_flow_config")
      .eq("id", registrationState.session_id)
      .maybeSingle();
    if (sessionModeResult.error) {
      return json({ ok: false, message: sessionModeResult.error.message || "Gagal membaca mode Session." }, 500);
    }
    const flow = sessionModeResult.data?.existing_flow_config || {};
    const legacyQueue = flow?.queue !== false;
    const healthdayQueueEnabled = flow?.queue_healthday === undefined ? legacyQueue : flow?.queue_healthday !== false;
    const bazarQueueEnabled = flow?.queue_bazar === undefined ? legacyQueue : flow?.queue_bazar !== false;
    const serviceSpecificExternal = Boolean(
      serviceMode &&
      ((serviceMode === "HEALTHDAY" && !healthdayQueueEnabled) || (serviceMode === "BAZAR" && !bazarQueueEnabled))
    );
    const reversedModes: Array<"HEALTHDAY" | "BAZAR"> = [];
    const remainderBackups = new Map<"HEALTHDAY" | "BAZAR", ValidationRemainderBackup[]>();
    const reverseDoneMode = async (mode: "HEALTHDAY" | "BAZAR") => {
      const state = clean(mode === "BAZAR" ? registrationState.bazar_queue_status : registrationState.queue_status).toUpperCase();
      const validationDone = clean(registrationState.validation_status).toUpperCase() === "DONE";
      if (!isDoneTrackStatus(state) && !validationDone) return;
      const reversed = await reverseQueueDoneTrack(supabase, rowId!, mode, actor);
      if (Number(reversed?.reversed || 0) > 0) reversedModes.push(mode);
      try {
        const backups = await reverseValidationAdministeredRemainder(supabase, rowId!, mode, actor);
        if (backups.length) remainderBackups.set(mode, backups);
      } catch (error) {
        if (Number(reversed?.reversed || 0) > 0) { try { await syncRegistrationTrackDone(supabase, rowId!, mode, actor); } catch {} }
        throw error;
      }
    };
    const cancelAction = ["BATAL", "CANCELLED", "CANCELED", "MOVE_TO_CLINIC"].includes(action);

    const aggregateValidationStatus = (nextHealthdayStatus: string, nextBazarStatus: string) => {
      const externalStatuses: string[] = [];
      if (!healthdayQueueEnabled && hasServiceTrack(registrationState, [], "HEALTHDAY")) externalStatuses.push(clean(nextHealthdayStatus).toUpperCase());
      if (!bazarQueueEnabled && hasServiceTrack(registrationState, [], "BAZAR")) externalStatuses.push(clean(nextBazarStatus).toUpperCase());
      if (!externalStatuses.length) return clean(registrationState.validation_status) || null;
      if (externalStatuses.some((status) => isPendingTrackStatus(status))) return "PENDING";
      if (externalStatuses.every((status) => isDoneTrackStatus(status))) return "DONE";
      if (externalStatuses.every((status) => ["CANCELLED", "CANCELED"].includes(status))) return "CANCELLED";
      if (externalStatuses.some((status) => isDoneTrackStatus(status))) return "DONE";
      return clean(registrationState.validation_status) || null;
    };

    if (serviceSpecificExternal) {
      const currentHealthdayStatus = clean(registrationState.queue_status).toUpperCase();
      const currentBazarStatus = clean(registrationState.bazar_queue_status).toUpperCase();
      let nextHealthdayStatus = currentHealthdayStatus;
      let nextBazarStatus = currentBazarStatus;

      if (action === "SEND_TO_VALIDATION" || action === "PENDING_VALIDATION") {
        try { await reverseDoneMode(serviceMode!); } catch (reverseError: any) { return json({ ok: false, message: reverseError?.message || "Gagal mengembalikan stok saat mengubah stage." }, 409); }
        if (serviceMode === "BAZAR") nextBazarStatus = "PENDING_VALIDATION";
        else nextHealthdayStatus = "PENDING_VALIDATION";
        payload = {
          ...(serviceMode === "BAZAR" ? { bazar_queue_status: nextBazarStatus } : { queue_status: nextHealthdayStatus }),
          validation_status: "PENDING",
          print_status: "NOT_PRINTED",
          updated_at: now,
        };
      } else if (action === "PRINTED") {
        payload = { print_status: "PRINTED", printed_by: actor, printed_at: now, updated_at: now };
      } else if (action === "SELESAI" || action === "DONE" || action === "VALIDATED") {
        try {
          await syncRegistrationTrackDone(supabase, rowId, serviceMode, actor);
        } catch (syncError: any) {
          return json({ ok: false, message: syncError?.message || "Gagal menyelesaikan pencatatan dan pemakaian stok." }, 409);
        }
        if (serviceMode === "BAZAR") nextBazarStatus = "DONE";
        else nextHealthdayStatus = "DONE";
        payload = {
          ...(serviceMode === "BAZAR" ? { bazar_queue_status: nextBazarStatus } : { queue_status: nextHealthdayStatus }),
          validation_status: aggregateValidationStatus(nextHealthdayStatus, nextBazarStatus),
          validated_by: actor,
          validated_at: now,
          updated_at: now,
        };
      } else if (cancelAction) {
        if (!note) return json({ ok: false, message: "Alasan Cancel wajib diisi." }, 400);
        try { await reverseDoneMode(serviceMode!); } catch (reverseError: any) { return json({ ok: false, message: reverseError?.message || "Gagal mengembalikan stok saat Cancel." }, 409); }
        if (serviceMode === "BAZAR") nextBazarStatus = "CANCELLED";
        else nextHealthdayStatus = "CANCELLED";
        payload = {
          ...(serviceMode === "BAZAR" ? { bazar_queue_status: nextBazarStatus } : { queue_status: nextHealthdayStatus }),
          validation_status: aggregateValidationStatus(nextHealthdayStatus, nextBazarStatus),
          cancelled_by: actor,
          cancelled_at: now,
          cancelled_note: note,
          ...(action === "MOVE_TO_CLINIC" ? { status_note: note } : {}),
          updated_at: now,
        };
      } else {
        return json({ ok: false, message: "Action tidak dikenali." }, 400);
      }
    } else {
      // Preserve standard/internal validation workflow exactly as before.
      if (action === "SEND_TO_VALIDATION" || action === "PENDING_VALIDATION") {
        try {
          if (serviceMode) await reverseDoneMode(serviceMode);
          else {
            const serviceStatus = clean(registrationState.patient_service_status || "HEALTHDAY").toUpperCase();
            if (serviceStatus === "BAZAR") await reverseDoneMode("BAZAR");
            else await reverseDoneMode("HEALTHDAY");
          }
        } catch (reverseError: any) { return json({ ok: false, message: reverseError?.message || "Gagal mengembalikan stok saat mengubah stage." }, 409); }
        payload = { queue_status: "PENDING_VALIDATION", validation_status: "PENDING", print_status: "NOT_PRINTED", updated_at: now };
      } else if (action === "PRINTED") {
        payload = { print_status: "PRINTED", printed_by: actor, printed_at: now, updated_at: now };
      } else if (action === "SELESAI" || action === "DONE" || action === "VALIDATED") {
        payload = { queue_status: "DONE", validation_status: "DONE", validated_by: actor, validated_at: now, updated_at: now };
      } else if (cancelAction) {
        if (!note) return json({ ok: false, message: "Note wajib diisi jika status Batal." }, 400);
        try {
          if (serviceMode) await reverseDoneMode(serviceMode);
          else {
            const serviceStatus = clean(registrationState.patient_service_status || "HEALTHDAY").toUpperCase();
            if (serviceStatus === "BAZAR") await reverseDoneMode("BAZAR");
            else await reverseDoneMode("HEALTHDAY");
          }
        } catch (reverseError: any) { return json({ ok: false, message: reverseError?.message || "Gagal mengembalikan stok saat Cancel." }, 409); }
        payload = { queue_status: "CANCELLED", validation_status: "CANCELLED", cancelled_by: actor, cancelled_at: now, cancelled_note: note, ...(action === "MOVE_TO_CLINIC" ? { status_note: note } : {}), updated_at: now };
      } else {
        return json({ ok: false, message: "Action tidak dikenali." }, 400);
      }

      if (action === "SELESAI" || action === "DONE" || action === "VALIDATED") {
        const serviceStatus = clean(registrationState.patient_service_status || "HEALTHDAY").toUpperCase();
        const hasHealthday = serviceStatus === "HEALTHDAY" || serviceStatus === "COMBINATION";
        const hasBazar = serviceStatus === "BAZAR" || serviceStatus === "COMBINATION";
        try {
          if (hasHealthday && !healthdayQueueEnabled) await syncRegistrationTrackDone(supabase, rowId, "HEALTHDAY", actor);
          // V561: Bazar-only selalu dipotong stoknya dari Tim Validasi,
          // termasuk saat Bazar memakai antrean internal.
          if (hasBazar && (serviceStatus === "BAZAR" || !bazarQueueEnabled)) {
            await syncRegistrationTrackDone(supabase, rowId, "BAZAR", actor);
          }
        } catch (syncError: any) {
          return json({ ok: false, message: syncError?.message || "Gagal menyelesaikan pencatatan dan pemakaian stok." }, 409);
        }
      }
    }

    let result = await supabase
      .from("vaccination_registrations")
      .update(payload)
      .eq("id", rowId)
      .select("*")
      .maybeSingle();

    if (result.error && missingColumn(result.error)) {
      const fallback: any = { updated_at: now };
      if (action === "SEND_TO_VALIDATION" || action === "PENDING_VALIDATION") fallback.queue_status = "PENDING_VALIDATION";
      if (action === "SELESAI" || action === "DONE" || action === "VALIDATED") fallback.queue_status = "DONE";
      if (cancelAction) fallback.queue_status = "CANCELLED";
      result = await supabase
        .from("vaccination_registrations")
        .update(fallback)
        .eq("id", rowId)
        .select("*")
        .maybeSingle();
    }

    if (result.error) {
      for (const backups of remainderBackups.values()) {
        try { await restoreValidationAdministeredRemainder(supabase, backups); } catch {}
      }
      if (reversedModes.length) {
        for (const reversedMode of reversedModes) {
          try { await syncRegistrationTrackDone(supabase, rowId, reversedMode, actor); } catch {}
        }
      }
      return json({ ok: false, message: result.error.message || "Gagal update status validasi." }, 500);
    }

    for (const [mode, backups] of remainderBackups.entries()) {
      try { await finalizeValidationAdministeredRemainder(supabase, backups, rowId!, mode, actor); } catch {}
    }

    return json({ ok: true, row: result.data || null });
  } catch (error: any) {
    return json({ ok: false, message: error?.message || "Gagal update validasi." }, 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../_utils";

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
    vaccine_name: clean(item?.vaccine?.name || item?.vaccine_name) || "Vaksin",
    lot_number: clean(item?.lot?.lot_number || item?.lot_number) || "-",
    dose_number: Number(item?.dose_number || 1),
    administered_at: item?.administered_at || null,
    administered_by: "-",
    note: "",
    status: clean(item?.status) || "ADMINISTERED",
  };
}

function display(row: any, recordRows: any[] = [], itemRows: any[] = []) {
  const products = (recordRows || []).length
    ? (recordRows || []).map(productDetail)
    : (itemRows || []).map(itemDetail);
  const firstRecord = recordRows?.[0] || null;
  const recordIds = products.map((item) => item.record_id).filter(Boolean);
  const productName = products.length === 1
    ? products[0].vaccine_name
    : products.length > 1
      ? `${products.length} vaksin / layanan`
      : (row.product_name || row.vaccine_name || row.vaccine || row.batch_name || row.batchname || row.layanan || row.service_name || "Vaksin");

  return {
    id: row.id,
    session_id: row.session_id,
    queue_number: row.queue_number || row.queue_no || parseQueueNumber(row.queue_label),
    patient_name: row.patient_name || row.participant_name || row.name || row.full_name || row.nama || row.nama_peserta || "-",
    doctor_name: clean(firstRecord?.administered_by) || row.doctor_name || row.doctor || row.petugas_name || row.staff_name || row.administered_by || row.updated_by || "-",
    product_name: productName,
    lot_number: products.length === 1 ? products[0].lot_number : "",
    note: row.note || row.notes || row.status_note || firstRecord?.notes || row.payment_note || row.product_note || row.keterangan || "",
    print_status: row.print_status || "NOT_PRINTED",
    validation_status: row.validation_status || "PENDING",
    queue_status: row.queue_status || row.status || "",
    location: clean(row.session?.location || row.location) || "-",
    session_date: row.session?.session_date || row.session_date || null,
    session_name: clean(row.session?.session_name || row.session_name) || "-",
    products,
    record_ids: recordIds,
    raw: row,
  };
}

async function loadRecordsForRegistrations(supabase: any, registrationIds: number[]) {
  if (!registrationIds.length) return new Map<number, any[]>();

  const result = await supabase
    .from("vaccination_records")
    .select("id,registration_id,vaccine_name,lot_number,dose_number,administered_at,administered_by,notes,status")
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

async function loadItemsForRegistrations(supabase: any, registrationIds: number[]) {
  if (!registrationIds.length) return new Map<number, any[]>();

  const result = await supabase
    .from("vaccination_registration_items")
    .select("id,registration_id,vaccine_id,lot_id,dose_number,status,administered_record_id,administered_at,active,vaccine:vaccination_vaccines(id,name,brand),lot:vaccination_vaccine_lots(id,lot_number)")
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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = clean(url.searchParams.get("session_id"));
    const supabase = supabaseAdmin();

    let query = supabase
      .from("vaccination_registrations")
      .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date)")
      .order("id", { ascending: false })
      .limit(1000);

    if (sessionId) query = query.eq("session_id", sessionId);
    query = query.or("queue_status.eq.PENDING_VALIDATION,validation_status.eq.PENDING");

    let result = await query;
    if (result.error && missingColumn(result.error)) {
      let fallback = supabase
        .from("vaccination_registrations")
        .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date)")
        .order("id", { ascending: false })
        .limit(1000);
      if (sessionId) fallback = fallback.eq("session_id", sessionId);
      result = await fallback;
    }

    if (result.error) {
      return json({ ok: false, message: result.error.message || "Gagal membaca daftar validasi.", rows: [] }, 500);
    }

    const pendingRegistrations = (result.data || []).filter((row: any) => {
      const queueStatus = clean(row.queue_status || row.status).toUpperCase();
      const validationStatus = clean(row.validation_status).toUpperCase();
      return queueStatus === "PENDING_VALIDATION" || validationStatus === "PENDING";
    });

    const registrationIds = pendingRegistrations.map((row: any) => Number(row.id)).filter(Boolean);
    let recordsByRegistration = new Map<number, any[]>();
    let itemsByRegistration = new Map<number, any[]>();
    try {
      recordsByRegistration = await loadRecordsForRegistrations(supabase, registrationIds);
      itemsByRegistration = await loadItemsForRegistrations(supabase, registrationIds);
    } catch (error: any) {
      return json({ ok: false, message: error?.message || "Gagal membaca detail layanan vaksin.", rows: [] }, 500);
    }

    const rows = pendingRegistrations.map((row: any) =>
      display(
        row,
        recordsByRegistration.get(Number(row.id)) || [],
        itemsByRegistration.get(Number(row.id)) || []
      )
    );

    // V148.6: pilihan lokasi berasal dari vaccination_sessions, bukan hanya peserta pending.
    let sessionLocationQuery = supabase
      .from("vaccination_sessions")
      .select("id,session_name,company_name,location,session_date")
      .order("session_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(2000);

    if (sessionId) sessionLocationQuery = sessionLocationQuery.eq("id", sessionId);

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
          }))
          .filter((session: any) => session.location);

    return json({ ok: true, rows, session_locations: sessionLocations });
  } catch (error: any) {
    return json({ ok: false, message: error?.message || "Gagal membaca validasi.", rows: [] }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = clean(body.action).toUpperCase();
    const id = toId(body.id ?? body.registration_id ?? body.registrationId);
    const sessionId = clean(body.session_id ?? body.sessionId);
    const queueNumber = clean(body.queue_number ?? body.queueNumber);
    const actor = clean(body.actor || body.petugas || body.user || "Tim Validasi");
    const note = clean(body.note || body.cancelled_note || body.reason);
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

    if (action === "SEND_TO_VALIDATION" || action === "PENDING_VALIDATION") {
      payload = { queue_status: "PENDING_VALIDATION", validation_status: "PENDING", print_status: "NOT_PRINTED", updated_at: now };
    } else if (action === "PRINTED") {
      payload = { print_status: "PRINTED", printed_by: actor, printed_at: now, updated_at: now };
    } else if (action === "SELESAI" || action === "DONE" || action === "VALIDATED") {
      payload = { queue_status: "DONE", validation_status: "DONE", validated_by: actor, validated_at: now, updated_at: now };
    } else if (action === "BATAL" || action === "CANCELLED" || action === "CANCELED") {
      if (!note) return json({ ok: false, message: "Note wajib diisi jika status Batal." }, 400);
      payload = { queue_status: "CANCELLED", validation_status: "CANCELLED", cancelled_by: actor, cancelled_at: now, cancelled_note: note, updated_at: now };
    } else {
      return json({ ok: false, message: "Action tidak dikenali." }, 400);
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
      if (action === "BATAL" || action === "CANCELLED" || action === "CANCELED") fallback.queue_status = "CANCELLED";
      result = await supabase
        .from("vaccination_registrations")
        .update(fallback)
        .eq("id", rowId)
        .select("*")
        .maybeSingle();
    }

    if (result.error) {
      return json({ ok: false, message: result.error.message || "Gagal update status validasi." }, 500);
    }

    return json({ ok: true, row: result.data ? display(result.data) : null });
  } catch (error: any) {
    return json({ ok: false, message: error?.message || "Gagal update validasi." }, 500);
  }
}

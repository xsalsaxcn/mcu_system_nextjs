// V531_PRODUCT_SERIES_NEXT_DUE
// V511_QUEUE_DONE_INVENTORY_SYNC
// Vaccination-only helper. Keeps queue DONE, registration item status, vaccination record,
// lot stock_used, and inventory movement aligned without touching queue UI/print/sticker.

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalizeServiceMode(value: any): "HEALTHDAY" | "BAZAR" {
  return String(value || "").trim().toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
}

function isFinalItemStatus(value: any) {
  return ["ADMINISTERED", "DONE", "FINISHED"].includes(String(value || "").trim().toUpperCase());
}

function marker(track: "HEALTHDAY" | "BAZAR") {
  return `QUEUE_DONE_SYNC:${track}`;
}

async function validateSessionStockAccess(
  supabase: any,
  sessionId: number,
  lot: any,
  serviceModeInput: any,
) {
  const serviceMode = normalizeServiceMode(serviceModeInput);
  const globalRemaining =
    Number(lot?.stock_initial || 0) +
    Number(lot?.stock_added || 0) -
    Number(lot?.stock_used || 0);

  if (globalRemaining <= 0) {
    throw new Error(`Stock Lot ${lot?.lot_number || "-"} sudah habis.`);
  }

  const allocationResult = await supabase
    .from("vaccination_session_stock_allocations")
    .select("id,session_id,lot_id,allocated_qty,dedicated,active,service_mode")
    .eq("lot_id", Number(lot?.id))
    .eq("active", true);

  if (allocationResult.error) {
    const code = String(allocationResult.error?.code || "");
    const message = String(allocationResult.error?.message || "").toLowerCase();
    if (code === "42P01" || message.includes("vaccination_session_stock_allocations")) return;
    throw new Error(allocationResult.error.message || "Gagal memvalidasi stok session.");
  }

  const dedicatedRows = (allocationResult.data || []).filter((row: any) => row.dedicated !== false);
  if (!dedicatedRows.length) return;

  const owned = dedicatedRows.find(
    (row: any) =>
      Number(row.session_id) === Number(sessionId) &&
      normalizeServiceMode(row.service_mode) === serviceMode,
  );
  if (!owned) {
    throw new Error(
      `Lot ${lot?.lot_number || "-"} tidak memiliki alokasi ${serviceMode === "BAZAR" ? "Bazar" : "Healthday"} untuk session ini.`,
    );
  }

  const usedResult = await supabase
    .from("vaccination_registration_items")
    .select("id,lot_id,service_mode,status,registration:vaccination_registrations!inner(session_id)")
    .eq("lot_id", Number(lot?.id))
    .eq("service_mode", serviceMode)
    .in("status", ["ADMINISTERED", "DONE"])
    .eq("registration.session_id", sessionId)
    .eq("active", true)
    .limit(20000);
  if (usedResult.error) throw new Error(usedResult.error.message);

  const used = (usedResult.data || []).length;
  if (Number(owned.allocated_qty || 0) - used <= 0) {
    throw new Error(
      `Alokasi ${serviceMode === "BAZAR" ? "Bazar" : "Healthday"} Lot ${lot?.lot_number || "-"} untuk session ini sudah habis.`,
    );
  }
}


async function nextDueDateForSeries(supabase: any, vaccine: any, doseNumber: number, administeredAtIso: string) {
  let days: number | null = null;
  const setting = await supabase
    .from("vaccination_vaccine_series_settings")
    .select("is_series,schedule")
    .eq("vaccine_id", Number(vaccine?.id || 0))
    .maybeSingle();
  if (!setting.error && setting.data?.is_series === true && Array.isArray(setting.data.schedule)) {
    const row = setting.data.schedule.find((item: any) => Number(item?.dose_number) === Number(doseNumber));
    if (row && Number(row.next_due_days) > 0) days = Number(row.next_due_days);
  }
  if (days == null && Number(vaccine?.default_next_dose_days) > 0) days = Number(vaccine.default_next_dose_days);
  if (days == null || days <= 0) return null;
  const date = new Date(administeredAtIso);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function syncRegistrationTrackDone(
  supabase: any,
  registrationId: number,
  serviceModeInput: any,
  actorInput: any,
) {
  const serviceMode = normalizeServiceMode(serviceModeInput);
  const actor = clean(actorInput) || "queue";
  const now = new Date().toISOString();

  const registrationResult = await supabase
    .from("vaccination_registrations")
    .select("*")
    .eq("id", registrationId)
    .single();
  if (registrationResult.error) throw new Error(registrationResult.error.message);
  const registration = registrationResult.data;

  const itemsResult = await supabase
    .from("vaccination_registration_items")
    .select("*")
    .eq("registration_id", registrationId)
    .eq("service_mode", serviceMode)
    .eq("active", true)
    .order("id", { ascending: true });
  if (itemsResult.error) throw new Error(itemsResult.error.message);

  let synced = 0;
  let alreadyDone = 0;
  let skippedWithoutLot = 0;

  for (const item of itemsResult.data || []) {
    if (isFinalItemStatus(item.status) && Number(item.administered_record_id || 0)) {
      alreadyDone += 1;
      continue;
    }
    const vaccineId = Number(item.vaccine_id || 0);
    const lotId = Number(item.lot_id || 0);
    if (!vaccineId || !lotId) {
      skippedWithoutLot += 1;
      continue;
    }

    const [vaccineResult, lotResult] = await Promise.all([
      supabase.from("vaccination_vaccines").select("*").eq("id", vaccineId).single(),
      supabase.from("vaccination_vaccine_lots").select("*").eq("id", lotId).single(),
    ]);
    if (vaccineResult.error) throw new Error(vaccineResult.error.message);
    if (lotResult.error) throw new Error(lotResult.error.message);
    const vaccine = vaccineResult.data;
    const lot = lotResult.data;
    if (Number(lot.vaccine_id || 0) !== vaccineId) {
      throw new Error(`Lot ${lot.lot_number || lotId} tidak sesuai dengan produk ${vaccine.name || vaccineId}.`);
    }

    const existingRecordResult = await supabase
      .from("vaccination_records")
      .select("*")
      .eq("registration_id", registrationId)
      .eq("vaccine_id", vaccineId)
      .eq("lot_id", lotId)
      .eq("dose_number", Math.max(1, Number(item.dose_number || 1)))
      .order("id", { ascending: false })
      .limit(1);
    if (existingRecordResult.error) throw new Error(existingRecordResult.error.message);

    let record = (existingRecordResult.data || [])[0] || null;
    let createdHere = false;
    let lotIncremented = false;
    try {
      if (!record) {
        await validateSessionStockAccess(supabase, Number(registration.session_id || 0), lot, serviceMode);

        const doseNumber = Math.max(1, Number(item.dose_number || 1));
        const nextDueDate = await nextDueDateForSeries(supabase, vaccine, doseNumber, now);
        const recordResult = await supabase
          .from("vaccination_records")
          .insert({
            registration_id: registrationId,
            session_id: registration.session_id,
            participant_name: registration.participant_name,
            vaccine_id: vaccineId,
            lot_id: lotId,
            vaccine_name: vaccine.name,
            lot_number: lot.lot_number,
            dose_number: doseNumber,
            administered_at: now,
            administered_by: actor,
            next_due_date: nextDueDate,
            notes: marker(serviceMode),
            status: "ADMINISTERED",
          })
          .select("*")
          .single();
        if (recordResult.error) throw new Error(recordResult.error.message);
        record = recordResult.data;
        createdHere = true;

        const lotUpdate = await supabase
          .from("vaccination_vaccine_lots")
          .update({
            stock_used: Number(lot.stock_used || 0) + 1,
            updated_at: now,
          })
          .eq("id", lotId);
        if (lotUpdate.error) throw new Error(lotUpdate.error.message);
        lotIncremented = true;

        const movementResult = await supabase.from("vaccination_inventory_movements").insert({
          vaccine_id: vaccineId,
          lot_id: lotId,
          movement_type: "administered",
          qty: -1,
          reference_type: "vaccination_record",
          reference_id: record.id,
          notes: `${marker(serviceMode)} · ${registration.participant_name || "Peserta"} · ${vaccine.name || "Produk"} · Lot ${lot.lot_number || "-"}`,
          created_by: actor,
        });
        if (movementResult.error) throw new Error(movementResult.error.message);
      }

      const itemUpdate = await supabase
        .from("vaccination_registration_items")
        .update({
          status: "ADMINISTERED",
          administered_record_id: record.id,
          administered_at: record.administered_at || now,
          updated_at: now,
        })
        .eq("id", item.id)
        .eq("registration_id", registrationId);
      if (itemUpdate.error) throw new Error(itemUpdate.error.message);
      synced += 1;
    } catch (error) {
      if (createdHere && record?.id) {
        await supabase
          .from("vaccination_inventory_movements")
          .delete()
          .eq("reference_type", "vaccination_record")
          .eq("reference_id", Number(record.id));
        if (lotIncremented) {
          const currentLot = await supabase
            .from("vaccination_vaccine_lots")
            .select("id,stock_used")
            .eq("id", lotId)
            .maybeSingle();
          if (!currentLot.error && currentLot.data?.id) {
            await supabase
              .from("vaccination_vaccine_lots")
              .update({
                stock_used: Math.max(0, Number(currentLot.data.stock_used || 0) - 1),
                updated_at: new Date().toISOString(),
              })
              .eq("id", lotId);
          }
        }
        await supabase.from("vaccination_records").delete().eq("id", Number(record.id));
      }
      throw error;
    }
  }

  return { synced, alreadyDone, skippedWithoutLot, serviceMode };
}

export async function reverseQueueDoneTrack(
  supabase: any,
  registrationId: number,
  serviceModeInput: any,
  actorInput: any,
) {
  const serviceMode = normalizeServiceMode(serviceModeInput);
  const actor = clean(actorInput) || "queue";
  const now = new Date().toISOString();

  const itemsResult = await supabase
    .from("vaccination_registration_items")
    .select("*")
    .eq("registration_id", registrationId)
    .eq("service_mode", serviceMode)
    .eq("active", true)
    .order("id", { ascending: true });
  if (itemsResult.error) throw new Error(itemsResult.error.message);

  let reversed = 0;
  for (const item of itemsResult.data || []) {
    const recordId = Number(item.administered_record_id || 0);
    if (!recordId || !isFinalItemStatus(item.status)) continue;

    const recordResult = await supabase
      .from("vaccination_records")
      .select("*")
      .eq("id", recordId)
      .eq("registration_id", registrationId)
      .maybeSingle();
    if (recordResult.error) throw new Error(recordResult.error.message);
    const record = recordResult.data;
    if (!record || !clean(record.notes).includes(marker(serviceMode))) continue;

    const movementResult = await supabase
      .from("vaccination_inventory_movements")
      .select("id")
      .eq("reference_type", "vaccination_record")
      .eq("reference_id", recordId)
      .eq("movement_type", "administered");
    if (movementResult.error) throw new Error(movementResult.error.message);

    if ((movementResult.data || []).length) {
      const deleteMovement = await supabase
        .from("vaccination_inventory_movements")
        .delete()
        .in("id", (movementResult.data || []).map((row: any) => Number(row.id)).filter(Boolean));
      if (deleteMovement.error) throw new Error(deleteMovement.error.message);
    }

    const lotResult = await supabase
      .from("vaccination_vaccine_lots")
      .select("id,stock_used")
      .eq("id", Number(record.lot_id || 0))
      .maybeSingle();
    if (lotResult.error) throw new Error(lotResult.error.message);
    if (lotResult.data?.id) {
      const lotUpdate = await supabase
        .from("vaccination_vaccine_lots")
        .update({
          stock_used: Math.max(0, Number(lotResult.data.stock_used || 0) - 1),
          updated_at: now,
        })
        .eq("id", Number(lotResult.data.id));
      if (lotUpdate.error) throw new Error(lotUpdate.error.message);
    }

    await supabase.from("vaccination_reminders").delete().eq("record_id", recordId);
    const deleteRecord = await supabase.from("vaccination_records").delete().eq("id", recordId);
    if (deleteRecord.error) throw new Error(deleteRecord.error.message);

    const itemUpdate = await supabase
      .from("vaccination_registration_items")
      .update({
        status: "WAITING",
        administered_record_id: null,
        administered_at: null,
        updated_at: now,
      })
      .eq("id", item.id)
      .eq("registration_id", registrationId);
    if (itemUpdate.error) throw new Error(itemUpdate.error.message);

    await supabase.from("vaccination_inventory_movements").insert({
      vaccine_id: Number(record.vaccine_id || 0) || null,
      lot_id: Number(record.lot_id || 0) || null,
      movement_type: "queue_done_reversal_audit",
      qty: 0,
      reference_type: "registration",
      reference_id: registrationId,
      notes: `${marker(serviceMode)} reversed by ${actor}`,
      created_by: actor,
    });
    reversed += 1;
  }

  return { reversed, serviceMode };
}

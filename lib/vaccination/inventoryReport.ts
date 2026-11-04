import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function num(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function dayKey(value: any) {
  const raw = clean(value);
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function inRange(value: any, from: string, to: string) {
  const key = dayKey(value);
  if (!from && !to) return true;
  if (!key) return false;
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

function uniq(values: any[]) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function isCancelled(value: any) {
  return ["CANCELLED", "CANCELED", "VOID", "BATAL"].includes(clean(value).toUpperCase());
}

function isInitial(type: any) {
  return ["INITIAL", "OPENING", "OPENING_BALANCE"].includes(clean(type).toUpperCase());
}

function isStockIn(type: any) {
  return ["STOCK_IN", "IN", "ADD", "ADDED", "RESTOCK", "RETURN_STOCK", "STOCK_RETURN", "RETURN_IN", "ADJUSTMENT_IN", "STOCK_TRANSFER_IN"].includes(clean(type).toUpperCase());
}

function isAdjustmentOut(type: any) {
  return ["STOCK_OUT_ADJUSTMENT", "ADJUSTMENT_OUT", "MANUAL_STOCK_OUT", "STOCK_REDUCTION", "STOCK_TRANSFER_OUT"].includes(clean(type).toUpperCase());
}

function isInternalText(value: any) {
  const text = clean(value);
  if (!text) return false;
  return /\bV\d{2,4}(?:[._-]R?\d+)?\b|\b(repair|migration|rollback|collector|runner|debug|legacy)\b|QUEUE_DONE_SYNC|vaccination_[a-z_]+|stock_session_id|session_id|lot_id|reference_id/i.test(text);
}

function friendlyNote(value: any, fallback = "") {
  let text = clean(value);
  if (!text || isInternalText(text)) return fallback;
  text = text
    .replace(/^\[Inventory\]\s*/i, "")
    .replace(/\s*·\s*(target|source) lot \d+\s*$/i, "")
    .replace(/QUEUE_DONE_SYNC:(HEALTHDAY|BAZAR)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text || fallback;
}

function movementSource(row: any, fallback = "") {
  const note = friendlyNote(row?.notes);
  if (!note || ["jumlah awal lot", "tambahan stok", "initial stock", "stock in"].includes(note.toLowerCase())) {
    return fallback || "Input Inventory";
  }
  return note;
}

function movementServiceMode(row: any) {
  const haystack = `${clean(row?.movement_type)} ${clean(row?.notes)}`.toUpperCase();
  if (haystack.includes("BAZAR")) return "BAZAR";
  if (haystack.includes("HEALTHDAY")) return "HEALTHDAY";
  return "";
}

function participantFromMovementNote(row: any) {
  const raw = clean(row?.notes);
  if (!raw) return "";
  const parts = raw.split("·").map((part: string) => clean(part)).filter(Boolean);
  if (parts.length >= 2 && /^QUEUE_DONE_SYNC:/i.test(parts[0])) return parts[1] || "";
  return "";
}

function logicalLotKey(vaccineId: any, lotNumber: any, sessionId: any) {
  return `${Number(vaccineId || 0)}::${clean(lotNumber).toUpperCase()}::${Number(sessionId || 0)}`;
}

// V581_INVENTORY_REPORT_COMPLETE_LOT_HISTORY:
// PostgREST can cap a .limit(20000) response at the project max_rows (often
// 1000). Never calculate participant/history counts from a silently truncated
// global response. Page every relevant operational read deterministically.
const V581_PAGE_SIZE = 500;
const V581_MAX_ROWS = 50000;

async function v581ReadPaged(label: string, makePage: (from: number, to: number) => any): Promise<any[]> {
  const rows: any[] = [];
  for (let start = 0; start < V581_MAX_ROWS; start += V581_PAGE_SIZE) {
    const result = await makePage(start, start + V581_PAGE_SIZE - 1);
    if (result?.error) throw new Error(`Gagal membaca ${label}: ${result.error.message}`);
    if (!Array.isArray(result?.data)) throw new Error(`Gagal membaca ${label}: respons bukan array.`);
    rows.push(...result.data);
    if (result.data.length < V581_PAGE_SIZE) return rows;
  }
  throw new Error(`Safety stop: ${label} melebihi ${V581_MAX_ROWS} baris. Laporan ditolak agar riwayat tidak terpotong.`);
}

// V518_INVENTORY_PAYMENT_METHOD_TRACE
export type InventoryReportFilters = {
  vaccineIds?: number[];
  lotIds?: number[];
  from?: string;
  to?: string;
};

export async function buildVaccinationInventoryReport(filters: InventoryReportFilters = {}) {
  const supabase = getSupabaseAdmin();
  const vaccineIds = new Set((filters.vaccineIds || []).map(Number).filter(Boolean));
  const lotIds = new Set((filters.lotIds || []).map(Number).filter(Boolean));
  const from = clean(filters.from);
  const to = clean(filters.to);

  // V581: a Lot detail request must be filtered on the server BEFORE any page
  // limit. Global reports are also paged so all existing sessions stay complete.
  const requestedLotIds = Array.from(lotIds);
  const [vaccinesResult, lotsResult, movementRows, recordRows] = await Promise.all([
    supabase.from("vaccination_vaccines").select("id,name,brand,active").order("name", { ascending: true }).limit(5000),
    supabase.from("vaccination_vaccine_lots").select("id,vaccine_id,lot_number,expiry_date,stock_initial,stock_added,stock_used,stock_physical_count,inventory_notes,stock_scope,stock_company_name,stock_session_id,created_at,active").order("id", { ascending: true }).limit(10000),
    v581ReadPaged("movement inventory", (start, end) => {
      let query = supabase.from("vaccination_inventory_movements")
        .select("id,vaccine_id,lot_id,movement_type,qty,reference_type,reference_id,notes,created_by,created_at");
      if (requestedLotIds.length) query = query.in("lot_id", requestedLotIds);
      return query.order("id", { ascending: true }).range(start, end);
    }),
    v581ReadPaged("record vaksinasi", (start, end) => {
      let query = supabase.from("vaccination_records")
        .select("id,registration_id,session_id,participant_name,vaccine_id,lot_id,vaccine_name,lot_number,dose_number,administered_at,administered_by,status,sticker_printed_at,created_at");
      if (requestedLotIds.length) query = query.in("lot_id", requestedLotIds);
      return query.order("id", { ascending: true }).range(start, end);
    }),
  ]);

  for (const result of [vaccinesResult, lotsResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const vaccines = vaccinesResult.data || [];
  const vaccineMap = new Map<number, any>(vaccines.map((row: any) => [Number(row.id), row]));
  const allLots = lotsResult.data || [];
  const lots = allLots.filter((row: any) => {
    if (vaccineIds.size && !vaccineIds.has(Number(row.vaccine_id))) return false;
    if (lotIds.size && !lotIds.has(Number(row.id))) return false;
    return true;
  });
  const allowedLotIds = new Set(lots.map((row: any) => Number(row.id)));

  const rawRecords = recordRows;
  const allRecords = rawRecords.filter((row: any) => !isCancelled(row.status));
  const recordMap = new Map<number, any>(rawRecords.map((row: any) => [Number(row.id), row]));
  const allowedLogicalLotKeys = new Set(
    lots.map((row: any) => logicalLotKey(row.vaccine_id, row.lot_number, row.stock_session_id)),
  );
  const records = allRecords.filter((row: any) =>
    allowedLotIds.has(Number(row.lot_id))
    || allowedLogicalLotKeys.has(logicalLotKey(row.vaccine_id, row.lot_number, row.session_id)),
  );
  const movements = movementRows.filter((row: any) => allowedLotIds.has(Number(row.lot_id)));

  let stockAllocations: any[] = [];
  if (allowedLotIds.size) {
    const allocationResult = await supabase
      .from("vaccination_session_stock_allocations")
      .select("lot_id,session_id,service_mode,allocated_qty,dedicated,active")
      .in("lot_id", Array.from(allowedLotIds))
      .eq("active", true)
      .limit(20000);
    if (!allocationResult.error) stockAllocations = allocationResult.data || [];
  }
  const lotServiceModes = new Map<number, Set<string>>();
  for (const allocation of stockAllocations) {
    const lotId = Number(allocation?.lot_id || 0);
    if (!lotId) continue;
    const mode = clean(allocation?.service_mode).toUpperCase();
    if (!["HEALTHDAY", "BAZAR"].includes(mode)) continue;
    if (!lotServiceModes.has(lotId)) lotServiceModes.set(lotId, new Set<string>());
    lotServiceModes.get(lotId)!.add(mode);
  }
  function serviceModeForLot(lotId: number, vaccineName: string) {
    if (/(?:^|\s|-)BAZAR(?:$|\s|-)/i.test(vaccineName)) return "BAZAR";
    const positiveModes = stockAllocations
      .filter((row: any) => Number(row?.lot_id || 0) === Number(lotId) && Number(row?.allocated_qty || 0) > 0)
      .map((row: any) => clean(row?.service_mode).toUpperCase())
      .filter((mode: string) => ["HEALTHDAY", "BAZAR"].includes(mode));
    const modes = Array.from(new Set(positiveModes));
    if (modes.length > 1) return "BOTH";
    if (modes.length === 1) return modes[0];
    return "HEALTHDAY";
  }

  const movementRegistrationIds = movements
    .filter((row: any) => clean(row.reference_type).toLowerCase() === "registration")
    .map((row: any) => Number(row.reference_id || 0))
    .filter(Boolean);
  const movementRecordRegistrationIds = movements
    .filter((row: any) => clean(row.reference_type).toLowerCase() === "vaccination_record")
    .map((row: any) => recordMap.get(Number(row.reference_id || 0))?.registration_id)
    .map(Number)
    .filter(Boolean);
  const registrationIds = uniq([
    ...records.map((row: any) => row.registration_id),
    ...movementRegistrationIds,
    ...movementRecordRegistrationIds,
  ]).map(Number).filter(Boolean);
  async function v581ReadRegistrations(ids: number[]): Promise<any[]> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    const found: any[] = [];
    // Bounded IN lists prevent oversized request URLs and default max_rows caps.
    for (let start = 0; start < uniqueIds.length; start += 250) {
      const result = await supabase
        .from("vaccination_registrations")
        .select("id,session_id,participant_name,employee_id,nik,mcu_id,company_name,department,queue_number,queue_status,print_status,validation_status,payment_method")
        .in("id", uniqueIds.slice(start, start + 250))
        .limit(250);
      // V581: don't silently turn a failed participant join into "Peserta".
      if (result.error) throw new Error(`Gagal membaca nama peserta riwayat Inventory: ${result.error.message}`);
      found.push(...(result.data || []));
    }
    return found;
  }
  let registrations = await v581ReadRegistrations(registrationIds);
  let registrationMap = new Map<number, any>(registrations.map((row: any) => [Number(row.id), row]));

  // V514: pricing/service trace per administered record.
  // Registration item snapshots are the source of truth for Package vs Non Package.
  let registrationItems: any[] = [];
  if (allowedLotIds.size) {
    // V581 critical fix: the old query read *all* administered items and
    // filtered Lot ID afterwards. Under max_rows this silently lost valid Done
    // transactions (e.g. N28 shows 1 instead of 11). Filter by Lot in SQL.
    registrationItems = await v581ReadPaged("item vaksinasi Done", (start, end) =>
      supabase
        .from("vaccination_registration_items")
        .select("id,registration_id,session_id,vaccine_id,lot_id,service_mode,status,administered_record_id,sales_option_id,sale_mode,package_dose_count,sales_price_snapshot,payment_method,active,administered_at")
        .in("lot_id", Array.from(allowedLotIds))
        .eq("active", true)
        .in("status", ["ADMINISTERED", "DONE", "FINISHED"])
        .order("id", { ascending: true })
        .range(start, end),
    );
  }

  // V558: canonical registration items are the same operational truth used by Validation.
  // Ensure their registrations are loaded even when an old vaccination_record / movement reference is missing.
  const missingItemRegistrationIds = Array.from(new Set(
    registrationItems
      .map((row: any) => Number(row.registration_id || 0))
      .filter((id: number) => id && !registrationMap.has(id)),
  ));
  if (missingItemRegistrationIds.length) {
    registrations.push(...await v581ReadRegistrations(missingItemRegistrationIds));
    registrationMap = new Map<number, any>(registrations.map((row: any) => [Number(row.id), row]));
  }

  const canonicalItemsByLotId = new Map<number, any[]>();
  for (const item of registrationItems) {
    const lotId = Number(item.lot_id || 0);
    if (!lotId) continue;
    const bucket = canonicalItemsByLotId.get(lotId) || [];
    bucket.push(item);
    canonicalItemsByLotId.set(lotId, bucket);
  }

  // The administered movement can carry a participant name even when a
  // historical registration name was not available. Match by exact record ID;
  // never borrow a name from another participant or another Session/Lot.
  const participantNoteByRecordId = new Map<number, string>();
  for (const movement of movements) {
    if (clean(movement.movement_type).toUpperCase() !== "ADMINISTERED") continue;
    if (clean(movement.reference_type).toLowerCase() !== "vaccination_record") continue;
    const recordId = Number(movement.reference_id || 0);
    const participant = participantFromMovementNote(movement);
    if (recordId && participant) participantNoteByRecordId.set(recordId, participant);
  }

  const itemByRecordId = new Map<number, any>();
  const fallbackItemsByKey = new Map<string, any[]>();
  for (const item of registrationItems) {
    const recordId = Number(item.administered_record_id || 0);
    if (recordId) itemByRecordId.set(recordId, item);
    const key = `${Number(item.registration_id || 0)}:${Number(item.vaccine_id || 0)}:${Number(item.lot_id || 0)}`;
    const bucket = fallbackItemsByKey.get(key) || [];
    bucket.push(item);
    fallbackItemsByKey.set(key, bucket);
  }

  function itemForRecord(record: any) {
    const direct = itemByRecordId.get(Number(record?.id || 0));
    if (direct) return direct;
    const key = `${Number(record?.registration_id || 0)}:${Number(record?.vaccine_id || 0)}:${Number(record?.lot_id || 0)}`;
    const candidates = fallbackItemsByKey.get(key) || [];
    return candidates.find((row: any) =>
      ["ADMINISTERED", "DONE", "FINISHED"].includes(clean(row?.status).toUpperCase()),
    ) || candidates[0] || null;
  }

  function itemForRegistrationLot(registrationId: number, vaccineId: number, lotId: number) {
    const key = `${Number(registrationId || 0)}:${Number(vaccineId || 0)}:${Number(lotId || 0)}`;
    const candidates = fallbackItemsByKey.get(key) || [];
    return candidates.find((row: any) =>
      ["ADMINISTERED", "DONE", "FINISHED"].includes(clean(row?.status).toUpperCase()),
    ) || candidates[0] || null;
  }

  const transferReferenceSessionIds = movements
    .filter((row: any) => clean(row.reference_type).toLowerCase().startsWith("inventory_transfer"))
    .map((row: any) => Number(row.reference_id || 0))
    .filter(Boolean);
  const sessionIds = uniq([
    ...records.map((row: any) => row.session_id),
    ...registrations.map((row: any) => row.session_id),
    ...lots.map((row: any) => row.stock_session_id),
    ...transferReferenceSessionIds,
  ]).map(Number).filter(Boolean);
  let sessions: any[] = [];
  if (sessionIds.length) {
    const result = await supabase
      .from("vaccination_sessions")
      .select("id,session_name,company_name,location,session_date,time_slot,status")
      .in("id", sessionIds);
    if (!result.error) sessions = result.data || [];
  }
  const sessionMap = new Map<number, any>(sessions.map((row: any) => [Number(row.id), row]));

  const details: any[] = [];
  const lotSummaries: any[] = [];

  for (const lot of lots) {
    const lotId = Number(lot.id);
    const vaccine = vaccineMap.get(Number(lot.vaccine_id)) || {};
    const vaccineName = clean(vaccine.name) || "Vaksin";
    const brand = clean(vaccine.brand);
    const lotMovements = movements.filter((row: any) => Number(row.lot_id) === lotId);
    const lotLogicalKey = logicalLotKey(lot.vaccine_id, lot.lot_number, lot.stock_session_id);
    const lotRecords = records.filter((row: any) =>
      Number(row.lot_id) === lotId
      || logicalLotKey(row.vaccine_id, row.lot_number, row.session_id) === lotLogicalKey,
    );
    const ownerSession = sessionMap.get(Number(lot.stock_session_id || 0)) || null;
    const ownerCompany = clean(lot.stock_company_name) || clean(ownerSession?.company_name);
    const ownerSessionName = clean(ownerSession?.session_name);
    const ownerLocation = clean(ownerSession?.location);
    const lotServiceMode = serviceModeForLot(lotId, vaccineName);

    const lotCanonicalItems = canonicalItemsByLotId.get(lotId) || [];
    const canonicalRecordIds = new Set(
      lotCanonicalItems.map((row: any) => Number(row.administered_record_id || 0)).filter(Boolean),
    );
    const canonicalRegistrationIds = new Set(
      lotCanonicalItems.map((row: any) => Number(row.registration_id || 0)).filter(Boolean),
    );
    const legacyLotRecords = lotRecords.filter((record: any) => {
      const recordId = Number(record?.id || 0);
      if (recordId && canonicalRecordIds.has(recordId)) return false;
      const registrationId = Number(record?.registration_id || 0);
      if (registrationId && canonicalRegistrationIds.has(registrationId)) {
        const matchingItem = lotCanonicalItems.find((item: any) =>
          Number(item.registration_id || 0) === registrationId
          && Number(item.vaccine_id || 0) === Number(record.vaccine_id || 0),
        );
        if (matchingItem) return false;
      }
      return true;
    });

    const administeredMovements = lotMovements.filter(
      (row: any) => clean(row?.movement_type).toUpperCase() === "ADMINISTERED",
    );
    const lotRecordIds = new Set(lotRecords.map((row: any) => Number(row.id || 0)).filter(Boolean));
    const lotRecordRegistrationIds = new Set(lotRecords.map((row: any) => Number(row.registration_id || 0)).filter(Boolean));
    const fallbackAdministeredMovements = administeredMovements.filter((movement: any) => {
      const referenceType = clean(movement?.reference_type).toLowerCase();
      const referenceId = Number(movement?.reference_id || 0);
      if (referenceType === "vaccination_record" && referenceId && (lotRecordIds.has(referenceId) || canonicalRecordIds.has(referenceId))) return false;
      if (referenceType === "registration" && referenceId && (lotRecordRegistrationIds.has(referenceId) || canonicalRegistrationIds.has(referenceId))) return false;
      return true;
    });
    const fallbackAdministeredUsedAll = fallbackAdministeredMovements.reduce(
      (sum: number, movement: any) => sum + Math.max(1, Math.abs(num(movement?.qty))),
      0,
    );

    // V558: when canonical active administered items exist, they are the source of truth
    // for participant usage because this is what Validation displays. Legacy records /
    // movements are only additive when no canonical item represents them.
    const traceableUsedAll = lotCanonicalItems.length + legacyLotRecords.length + fallbackAdministeredUsedAll;
    const canonicalUsedAll = lotCanonicalItems.length > 0
      ? traceableUsedAll
      : Math.max(num(lot.stock_used), traceableUsedAll);
    const legacyUnattributedUsed = lotCanonicalItems.length > 0
      ? 0
      : Math.max(0, canonicalUsedAll - traceableUsedAll);
    const hasDateFilter = Boolean(from || to);

    const initialMovements = lotMovements.filter((row: any) => isInitial(row.movement_type));
    if (initialMovements.length) {
      for (const movement of initialMovements) {
        if (!inRange(movement.created_at, from, to) && (from || to)) continue;
        details.push({
          date: movement.created_at,
          direction: "IN",
          movement_type: "Jumlah Awal",
          company: ownerCompany || movementSource(movement, "Input stok awal"),
          participant: "",
          employee_id: "",
          mcu_id: "",
          session: ownerSessionName,
          session_id: Number(ownerSession?.id || 0) || null,
          location: ownerLocation,
          service_mode: lotServiceMode,
          lot_id: lotId,
          vaccine_id: Number(lot.vaccine_id),
          vaccine: vaccineName,
          brand,
          lot: clean(lot.lot_number),
          dose: "",
          doctor: clean(movement.created_by),
          qty: Math.abs(num(movement.qty)),
          print_status: "",
          validation_status: "",
          reference: "",
          note: friendlyNote(movement.notes, "Tambah stok"),
        });
      }
    } else if (num(lot.stock_initial) > 0 && (!from && !to || inRange(lot.created_at, from, to))) {
      details.push({
        date: lot.created_at,
        direction: "IN",
        movement_type: "Jumlah Awal",
        company: ownerCompany || "Input stok awal",
        participant: "",
        employee_id: "",
        mcu_id: "",
        session: ownerSessionName,
        session_id: Number(ownerSession?.id || 0) || null,
        location: ownerLocation,
        service_mode: lotServiceMode,
        lot_id: lotId,
        vaccine_id: Number(lot.vaccine_id),
        vaccine: vaccineName,
        brand,
        lot: clean(lot.lot_number),
        dose: "",
        doctor: "",
        qty: num(lot.stock_initial),
        print_status: "",
        validation_status: "",
        reference: "vaccine_lot",
        note: "Stock awal lot",
      });
    }

    const stockInMovements = lotMovements.filter((row: any) => isStockIn(row.movement_type));
    const stockInMovementTotalAll = stockInMovements.reduce((sum: number, movement: any) => sum + Math.abs(num(movement.qty)), 0);
    if (stockInMovements.length) {
      for (const movement of stockInMovements) {
        if (!inRange(movement.created_at, from, to)) continue;
        const movementType = clean(movement.movement_type).toUpperCase();
        const inboundLabel = movementType === "STOCK_TRANSFER_IN" ? "Transfer Stok Masuk" : movementType === "RETURN_STOCK" ? "Retur Stok" : "Tambahan Stok";
        details.push({
          date: movement.created_at,
          direction: "IN",
          movement_type: inboundLabel,
          company: ownerCompany || movementSource(movement, inboundLabel),
          participant: "",
          employee_id: "",
          mcu_id: "",
          session: ownerSessionName,
          session_id: Number(ownerSession?.id || 0) || null,
          location: ownerLocation,
          service_mode: lotServiceMode,
          lot_id: lotId,
          vaccine_id: Number(lot.vaccine_id),
          vaccine: vaccineName,
          brand,
          lot: clean(lot.lot_number),
          dose: "",
          doctor: clean(movement.created_by),
          qty: Math.abs(num(movement.qty)),
          print_status: "",
          validation_status: "",
          reference: "",
          note: friendlyNote(movement.notes, "Tambah stok"),
        });
      }

      // V150.12: if the cumulative lot field contains legacy inbound that is
      // not represented by movement rows, keep that delta visible in the
      // no-date-filter report instead of silently dropping it.
      const legacyInboundGap = Math.max(0, num(lot.stock_added) - stockInMovementTotalAll);
      if (!hasDateFilter && legacyInboundGap > 0) {
        details.push({
          date: lot.created_at,
          direction: "IN",
          movement_type: "Tambahan Stok",
          company: ownerCompany || friendlyNote(lot.inventory_notes, "Tambah stok"),
          participant: "",
          employee_id: "",
          mcu_id: "",
          session: ownerSessionName,
          session_id: Number(ownerSession?.id || 0) || null,
          location: ownerLocation,
          service_mode: lotServiceMode,
          lot_id: lotId,
          vaccine_id: Number(lot.vaccine_id),
          vaccine: vaccineName,
          brand,
          lot: clean(lot.lot_number),
          dose: "",
          doctor: "",
          qty: legacyInboundGap,
          print_status: "",
          validation_status: "",
          reference: "",
          note: "Tambahan stok lama belum memiliki detail transaksi lengkap.",
        });
      }
    } else if (num(lot.stock_added) > 0 && (!from && !to || inRange(lot.created_at, from, to))) {
      details.push({
        date: lot.created_at,
        direction: "IN",
        movement_type: "Tambahan Stok",
        company: ownerCompany || friendlyNote(lot.inventory_notes, "Tambah stok"),
        participant: "",
        employee_id: "",
        mcu_id: "",
        session: ownerSessionName,
        session_id: Number(ownerSession?.id || 0) || null,
        location: ownerLocation,
        service_mode: lotServiceMode,
        lot_id: lotId,
        vaccine_id: Number(lot.vaccine_id),
        vaccine: vaccineName,
        brand,
        lot: clean(lot.lot_number),
        dose: "",
        doctor: "",
        qty: num(lot.stock_added),
        print_status: "",
        validation_status: "",
        reference: "vaccine_lot",
        note: friendlyNote(lot.inventory_notes, "Tambah stok"),
      });
    }

    // V558: render exactly one participant transaction per canonical administered item.
    // This keeps Inventory detail aligned with Validation Selesai even if historical
    // vaccination_record / movement references are incomplete after testing resets.
    for (const item of lotCanonicalItems) {
      const registration = registrationMap.get(Number(item.registration_id || 0)) || {};
      const directRecord = recordMap.get(Number(item.administered_record_id || 0)) || null;
      const fallbackRecord = directRecord || lotRecords.find((record: any) =>
        Number(record.registration_id || 0) === Number(item.registration_id || 0)
        && Number(record.vaccine_id || 0) === Number(item.vaccine_id || 0),
      ) || null;
      const session = sessionMap.get(Number(item.session_id || registration.session_id || fallbackRecord?.session_id || lot.stock_session_id || 0)) || ownerSession || {};
      const eventDate = item.administered_at || fallbackRecord?.administered_at || fallbackRecord?.created_at || null;
      if (!inRange(eventDate, from, to)) continue;

      const rawServiceMode = clean(item?.service_mode).toUpperCase();
      const serviceMode = ["HEALTHDAY", "BAZAR"].includes(rawServiceMode)
        ? rawServiceMode
        : lotServiceMode;
      const saleMode = serviceMode === "BAZAR"
        ? (clean(item?.sale_mode).toUpperCase() === "PACKAGE" ? "PACKAGE" : "NON_PACKAGE")
        : serviceMode === "HEALTHDAY" ? "FREE" : "UNMAPPED";

      details.push({
        date: eventDate,
        direction: "OUT",
        movement_type: "Terpakai",
        company: clean(registration.company_name) || clean(session.company_name) || ownerCompany || "Perusahaan belum dicatat",
        participant: clean(registration.participant_name)
          || clean(fallbackRecord?.participant_name)
          || participantNoteByRecordId.get(Number(item.administered_record_id || fallbackRecord?.id || 0))
          || "",
        employee_id: clean(registration.employee_id),
        mcu_id: clean(registration.mcu_id),
        session: clean(session.session_name) || ownerSessionName,
        session_id: Number(session.id || item.session_id || registration.session_id || lot.stock_session_id || 0) || null,
        location: clean(session.location) || ownerLocation,
        lot_id: lotId,
        record_id: Number(item.administered_record_id || fallbackRecord?.id || 0) || null,
        registration_id: Number(item.registration_id || 0) || null,
        vaccine_id: Number(item.vaccine_id || lot.vaccine_id),
        vaccine: clean(fallbackRecord?.vaccine_name) || vaccineName,
        brand,
        lot: clean(fallbackRecord?.lot_number) || clean(lot.lot_number),
        dose: Number(fallbackRecord?.dose_number || 1),
        service_mode: serviceMode,
        sale_mode: saleMode,
        package_dose_count: saleMode === "PACKAGE" ? Math.max(1, Number(item?.package_dose_count || 1)) : null,
        sales_price_snapshot: item?.sales_price_snapshot == null ? null : num(item.sales_price_snapshot),
        payment_method: clean(item?.payment_method || registration?.payment_method),
        doctor: clean(fallbackRecord?.administered_by),
        qty: 1,
        print_status: clean(registration.print_status),
        validation_status: clean(registration.validation_status) || "DONE",
        reference: clean(registration.queue_number),
        note: "Pemakaian peserta",
      });
    }

    // Keep truly legacy administered records only when no canonical item already
    // represents that participant transaction.
    for (const record of legacyLotRecords) {
      if (!inRange(record.administered_at || record.created_at, from, to)) continue;
      const registration = registrationMap.get(Number(record.registration_id)) || {};
      const session = sessionMap.get(Number(record.session_id || registration.session_id)) || {};
      const registrationItem = itemForRecord(record);
      const rawServiceMode = clean(registrationItem?.service_mode).toUpperCase();
      const serviceMode =
        rawServiceMode === "BAZAR"
          ? "BAZAR"
          : rawServiceMode === "HEALTHDAY"
            ? "HEALTHDAY"
            : lotServiceMode;
      const saleMode =
        serviceMode === "BAZAR"
          ? (registrationItem
              ? (clean(registrationItem?.sale_mode).toUpperCase() === "PACKAGE" ? "PACKAGE" : "NON_PACKAGE")
              : "UNMAPPED")
          : serviceMode === "HEALTHDAY"
            ? "FREE"
            : "UNMAPPED";
      details.push({
        date: record.administered_at || record.created_at,
        direction: "OUT",
        movement_type: "Terpakai",
        company: clean(registration.company_name) || clean(session.company_name) || "Perusahaan belum dicatat",
        participant: clean(registration.participant_name)
          || clean(record.participant_name)
          || participantNoteByRecordId.get(Number(record.id || 0))
          || "",
        employee_id: clean(registration.employee_id),
        mcu_id: clean(registration.mcu_id),
        session: clean(session.session_name),
        session_id: Number(session.id || record.session_id || registration.session_id || 0) || null,
        location: clean(session.location),
        lot_id: lotId,
        record_id: Number(record.id || 0) || null,
        registration_id: Number(record.registration_id || 0) || null,
        vaccine_id: Number(record.vaccine_id),
        vaccine: clean(record.vaccine_name) || vaccineName,
        brand,
        lot: clean(record.lot_number) || clean(lot.lot_number),
        dose: Number(record.dose_number || 1),
        service_mode: serviceMode,
        sale_mode: saleMode,
        package_dose_count: saleMode === "PACKAGE" ? Math.max(1, Number(registrationItem?.package_dose_count || 1)) : null,
        sales_price_snapshot: registrationItem?.sales_price_snapshot == null ? null : num(registrationItem.sales_price_snapshot),
        payment_method: clean(registrationItem?.payment_method || registration?.payment_method),
        doctor: clean(record.administered_by),
        qty: 1,
        print_status: clean(registration.print_status) || (record.sticker_printed_at ? "PRINTED" : ""),
        validation_status: clean(registration.validation_status),
        reference: clean(registration.queue_number),
        note: clean(registration.department),
      });
    }


    for (const movement of fallbackAdministeredMovements) {
      if (!inRange(movement.created_at, from, to)) continue;
      const referenceType = clean(movement.reference_type).toLowerCase();
      const referenceId = Number(movement.reference_id || 0);
      const referencedRecord = referenceType === "vaccination_record" ? recordMap.get(referenceId) : null;
      const referencedRegistration = referenceType === "registration"
        ? registrationMap.get(referenceId)
        : referencedRecord
          ? registrationMap.get(Number(referencedRecord.registration_id || 0))
          : null;
      const registrationId = Number(referencedRegistration?.id || referencedRecord?.registration_id || 0);
      const contextItem = referencedRecord
        ? itemForRecord(referencedRecord)
        : itemForRegistrationLot(registrationId, Number(lot.vaccine_id), lotId);
      const contextSession = sessionMap.get(
        Number(referencedRegistration?.session_id || referencedRecord?.session_id || contextItem?.session_id || lot.stock_session_id || 0),
      ) || ownerSession || null;
      const contextServiceRaw = clean(contextItem?.service_mode).toUpperCase() || movementServiceMode(movement) || lotServiceMode;
      const contextService = contextServiceRaw === "BAZAR"
        ? "BAZAR"
        : contextServiceRaw === "HEALTHDAY"
          ? "HEALTHDAY"
          : contextServiceRaw === "BOTH"
            ? "BOTH"
            : lotServiceMode;
      const contextSaleMode = contextService === "BAZAR"
        ? (clean(contextItem?.sale_mode).toUpperCase() === "PACKAGE" ? "PACKAGE" : contextItem ? "NON_PACKAGE" : "UNMAPPED")
        : contextService === "HEALTHDAY"
          ? "FREE"
          : "UNMAPPED";
      const participant = clean(referencedRegistration?.participant_name)
        || clean(referencedRecord?.participant_name)
        || participantFromMovementNote(movement);

      details.push({
        date: movement.created_at || contextItem?.administered_at || referencedRecord?.administered_at || referencedRecord?.created_at || null,
        direction: "OUT",
        movement_type: "Terpakai",
        company: clean(referencedRegistration?.company_name) || clean(contextSession?.company_name) || ownerCompany || "Perusahaan belum dicatat",
        participant,
        employee_id: clean(referencedRegistration?.employee_id),
        mcu_id: clean(referencedRegistration?.mcu_id),
        session: clean(contextSession?.session_name) || ownerSessionName,
        session_id: Number(contextSession?.id || referencedRegistration?.session_id || referencedRecord?.session_id || lot.stock_session_id || 0) || null,
        location: clean(contextSession?.location) || ownerLocation,
        lot_id: lotId,
        record_id: Number(referencedRecord?.id || 0) || null,
        registration_id: registrationId || null,
        vaccine_id: Number(lot.vaccine_id),
        vaccine: clean(referencedRecord?.vaccine_name) || vaccineName,
        brand,
        lot: clean(referencedRecord?.lot_number) || clean(lot.lot_number),
        dose: referencedRecord ? Number(referencedRecord?.dose_number || 1) : "",
        service_mode: contextService,
        sale_mode: contextSaleMode,
        package_dose_count: contextSaleMode === "PACKAGE" ? Math.max(1, Number(contextItem?.package_dose_count || 1)) : null,
        sales_price_snapshot: contextItem?.sales_price_snapshot == null ? null : num(contextItem.sales_price_snapshot),
        payment_method: clean(contextItem?.payment_method || referencedRegistration?.payment_method),
        doctor: clean(referencedRecord?.administered_by) || clean(movement.created_by),
        qty: Math.max(1, Math.abs(num(movement.qty))),
        print_status: clean(referencedRegistration?.print_status),
        validation_status: clean(referencedRegistration?.validation_status) || "DONE",
        reference: clean(referencedRegistration?.queue_number),
        note: participant ? "Pemakaian peserta" : friendlyNote(movement.notes, "Pemakaian stok"),
      });
    }

    // V512: expose every non-canonical inventory movement in Pelaporan Inventory too.
    // Initial/stock-in are already rendered above, while administered is represented by
    // vaccination_records to avoid double-counting the same participant usage.
    for (const movement of lotMovements) {
      if (!inRange(movement.created_at, from, to)) continue;
      const type = clean(movement.movement_type).toUpperCase();
      if (isInitial(type) || isStockIn(type) || type === "ADMINISTERED") continue;

      let direction = "AUDIT";
      let label = clean(movement.movement_type) || "Riwayat Inventory";
      if (type === "STOCK_TRANSFER" || type === "STOCK_TRANSFER_SERVICE") {
        direction = "TRANSFER";
        label = "Transfer Stok";
      } else if (type === "STOCK_TRANSFER_OUT") {
        direction = "OUT";
        label = "Transfer Stok Keluar";
      } else if (type === "STOCK_TRANSFER_IN") {
        direction = "IN";
        label = "Transfer Stok Masuk";
      } else if (type === "PHYSICAL_CHECK") {
        direction = "AUDIT";
        label = "Pemeriksaan Stok Fisik";
      } else if (type === "STOCK_TRANSFER_OUT") {
        direction = "OUT";
        label = "Transfer Stok Keluar";
      } else if (type === "ADJUSTMENT_MINUS" || isAdjustmentOut(type)) {
        direction = "OUT";
        label = "Koreksi Stok Keluar";
      } else if (type === "QUEUE_DONE_REVERSAL_AUDIT") {
        direction = "AUDIT";
        label = "Pembatalan Selesai";
      } else if (num(movement.qty) < 0) {
        direction = "OUT";
      } else if (num(movement.qty) > 0) {
        direction = "IN";
      }

      const referenceType = clean(movement.reference_type).toLowerCase();
      const referencedRecord = referenceType === "vaccination_record" ? recordMap.get(Number(movement.reference_id || 0)) : null;
      const referencedRegistration = referenceType === "registration"
        ? registrationMap.get(Number(movement.reference_id || 0))
        : referencedRecord
          ? registrationMap.get(Number(referencedRecord.registration_id || 0))
          : null;
      const referencedSession = referencedRegistration
        ? sessionMap.get(Number(referencedRegistration.session_id || 0))
        : referenceType.startsWith("inventory_transfer")
          ? sessionMap.get(Number(movement.reference_id || 0))
          : null;
      const contextSession = referencedSession || ownerSession || null;
      const contextRecord = referencedRecord || null;
      const contextItem = contextRecord ? itemForRecord(contextRecord) : null;
      const contextService = clean(contextItem?.service_mode).toUpperCase() || movementServiceMode(movement) || lotServiceMode;
      const contextSaleMode = contextService === "BAZAR"
        ? (clean(contextItem?.sale_mode).toUpperCase() === "PACKAGE" ? "PACKAGE" : contextItem ? "NON_PACKAGE" : "")
        : contextService === "HEALTHDAY" ? "FREE" : "";

      details.push({
        date: movement.created_at,
        direction,
        movement_type: label,
        company: clean(referencedRegistration?.company_name) || clean(contextSession?.company_name) || ownerCompany || movementSource(movement, "Inventory"),
        participant: clean(referencedRegistration?.participant_name) || clean(contextRecord?.participant_name),
        employee_id: clean(referencedRegistration?.employee_id),
        mcu_id: clean(referencedRegistration?.mcu_id),
        session: clean(contextSession?.session_name) || ownerSessionName,
        session_id: Number(contextSession?.id || lot.stock_session_id || 0) || null,
        location: clean(contextSession?.location) || ownerLocation,
        lot_id: lotId,
        record_id: Number(contextRecord?.id || 0) || null,
        registration_id: Number(referencedRegistration?.id || 0) || null,
        vaccine_id: Number(lot.vaccine_id),
        vaccine: vaccineName,
        brand,
        lot: clean(lot.lot_number),
        dose: contextRecord ? Number(contextRecord?.dose_number || 1) : "",
        service_mode: contextService || "UNMAPPED",
        sale_mode: contextSaleMode || "UNMAPPED",
        package_dose_count: contextSaleMode === "PACKAGE" ? Math.max(1, Number(contextItem?.package_dose_count || 1)) : null,
        sales_price_snapshot: contextItem?.sales_price_snapshot == null ? null : num(contextItem.sales_price_snapshot),
        payment_method: clean(contextItem?.payment_method || referencedRegistration?.payment_method),
        doctor: clean(contextRecord?.administered_by) || clean(movement.created_by),
        qty: num(movement.qty),
        print_status: clean(referencedRegistration?.print_status),
        validation_status: clean(referencedRegistration?.validation_status),
        reference: referencedRegistration?.queue_number ? clean(referencedRegistration.queue_number) : "",
        note: type === "QUEUE_DONE_REVERSAL_AUDIT"
          ? "Stok dikembalikan karena koreksi status selesai."
          : friendlyNote(movement.notes, label),
      });
    }

    // If old stock_used contains usage that predates / lacks vaccination_records, show
    // one explicit reconciliation row so drill-down and export still total to the same
    // number as the Inventory table/card. A date filter cannot safely date legacy usage,
    // therefore this reconciliation row is only included for the cumulative view.
    if (!hasDateFilter && legacyUnattributedUsed > 0) {
      details.push({
        date: null,
        direction: "OUT",
        movement_type: "Pemakaian Belum Teridentifikasi",
        company: ownerCompany || "Riwayat lama",
        participant: "",
        employee_id: "",
        mcu_id: "",
        session: ownerSessionName,
        session_id: Number(ownerSession?.id || 0) || null,
        location: ownerLocation,
        service_mode: lotServiceMode,
        lot_id: lotId,
        vaccine_id: Number(lot.vaccine_id),
        vaccine: vaccineName,
        brand,
        lot: clean(lot.lot_number),
        dose: "",
        doctor: "",
        qty: legacyUnattributedUsed,
        print_status: "",
        validation_status: "",
        reference: "",
        note: `${legacyUnattributedUsed} pemakaian belum memiliki detail peserta/tanggal yang dapat ditelusuri.`,
      });
    }

    const traceableUsedFiltered = details
      .filter((row: any) => Number(row.lot_id || 0) === lotId && row.direction === "OUT" && row.movement_type === "Terpakai")
      .reduce((sum: number, row: any) => sum + Math.max(1, Math.abs(num(row.qty))), 0);
    const filteredUsed = hasDateFilter ? traceableUsedFiltered : canonicalUsedAll;
    const filteredMovementAdded = details
      .filter((row: any) => row.vaccine_id === Number(lot.vaccine_id) && row.lot === clean(lot.lot_number) && row.direction === "IN" && row.movement_type !== "Jumlah Awal")
      .reduce((sum: number, row: any) => sum + Math.abs(num(row.qty)), 0);
    // No date filter = cumulative inventory. Reconcile the persisted lot field
    // with traceable stock-in/return movements and never let one stale source
    // lower the canonical total. Date-filtered reports remain movement-based.
    const filteredAdded = hasDateFilter
      ? filteredMovementAdded
      : Math.max(num(lot.stock_added), stockInMovementTotalAll, filteredMovementAdded);
    const filteredInitial = num(lot.stock_initial);
    const filteredAdjustmentOut = lotMovements
      .filter((movement: any) => isAdjustmentOut(movement.movement_type))
      .filter((movement: any) => !hasDateFilter || inRange(movement.created_at, from, to))
      .reduce((sum: number, movement: any) => sum + Math.abs(num(movement.qty)), 0);
    const remaining = filteredInitial + filteredAdded - filteredUsed - filteredAdjustmentOut;
    const outCompanies = uniq([
      ...lotCanonicalItems.map((item: any) => {
        const reg = registrationMap.get(Number(item.registration_id || 0)) || {};
        const session = sessionMap.get(Number(item.session_id || reg.session_id || lot.stock_session_id || 0)) || {};
        return clean(reg.company_name) || clean(session.company_name);
      }),
      ...legacyLotRecords.map((row: any) => {
        const reg = registrationMap.get(Number(row.registration_id)) || {};
        const session = sessionMap.get(Number(row.session_id || reg.session_id)) || {};
        return clean(reg.company_name) || clean(session.company_name);
      }),
    ]);
    const inSources = uniq(lotMovements.filter((row: any) => isInitial(row.movement_type) || isStockIn(row.movement_type)).map((row: any) => movementSource(row)));

    lotSummaries.push({
      lot_id: lotId,
      vaccine_id: Number(lot.vaccine_id),
      vaccine_name: vaccineName,
      brand,
      lot_number: clean(lot.lot_number),
      company: ownerCompany,
      session: ownerSessionName,
      session_id: Number(ownerSession?.id || lot.stock_session_id || 0) || null,
      location: ownerLocation,
      service_mode: lotServiceMode,
      initial: filteredInitial,
      added: filteredAdded,
      used: filteredUsed,
      adjustment_out: filteredAdjustmentOut,
      remaining,
      physical: lot.stock_physical_count == null ? null : num(lot.stock_physical_count),
      diff: lot.stock_physical_count == null ? null : num(lot.stock_physical_count) - remaining,
      unattributed_used: hasDateFilter ? 0 : legacyUnattributedUsed,
      in_sources: inSources.length ? inSources : [ownerLocation || "Input Inventory"],
      out_companies: outCompanies,
    });
  }

  const summary = lotSummaries.reduce(
    (acc: any, row: any) => {
      acc.initial += num(row.initial);
      acc.added += num(row.added);
      acc.used += num(row.used);
      acc.remaining += num(row.remaining);
      if (row.diff != null) acc.diff += num(row.diff);
      return acc;
    },
    { initial: 0, added: 0, used: 0, remaining: 0, diff: 0 },
  );

  details.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  return {
    filters: { vaccineIds: Array.from(vaccineIds), lotIds: Array.from(lotIds), from, to },
    products: vaccines.map((row: any) => ({ id: Number(row.id), name: clean(row.name), brand: clean(row.brand), active: row.active !== false })),
    summary,
    lotSummaries,
    details,
  };
}

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
  return ["STOCK_IN", "IN", "ADD", "ADDED", "RESTOCK", "RETURN_STOCK", "STOCK_RETURN", "RETURN_IN", "ADJUSTMENT_IN"].includes(clean(type).toUpperCase());
}

function movementSource(row: any) {
  const note = clean(row?.notes);
  if (!note || ["jumlah awal lot", "tambahan stok", "initial stock", "stock in"].includes(note.toLowerCase())) {
    return "Sumber belum dicatat";
  }
  return note;
}

export type InventoryReportFilters = {
  vaccineIds?: number[];
  from?: string;
  to?: string;
};

export async function buildVaccinationInventoryReport(filters: InventoryReportFilters = {}) {
  const supabase = getSupabaseAdmin();
  const vaccineIds = new Set((filters.vaccineIds || []).map(Number).filter(Boolean));
  const from = clean(filters.from);
  const to = clean(filters.to);

  const [vaccinesResult, lotsResult, movementsResult, recordsResult] = await Promise.all([
    supabase.from("vaccination_vaccines").select("id,name,brand,active").order("name", { ascending: true }).limit(5000),
    supabase.from("vaccination_vaccine_lots").select("id,vaccine_id,lot_number,expiry_date,stock_initial,stock_added,stock_used,stock_physical_count,inventory_notes,created_at,active").order("id", { ascending: true }).limit(10000),
    supabase.from("vaccination_inventory_movements").select("id,vaccine_id,lot_id,movement_type,qty,reference_type,reference_id,notes,created_by,created_at").order("created_at", { ascending: true }).limit(20000),
    supabase.from("vaccination_records").select("id,registration_id,session_id,participant_name,vaccine_id,lot_id,vaccine_name,lot_number,dose_number,administered_at,administered_by,status,sticker_printed_at,created_at").order("administered_at", { ascending: true }).limit(20000),
  ]);

  for (const result of [vaccinesResult, lotsResult, movementsResult, recordsResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const vaccines = vaccinesResult.data || [];
  const vaccineMap = new Map<number, any>(vaccines.map((row: any) => [Number(row.id), row]));
  const allLots = lotsResult.data || [];
  const lots = vaccineIds.size
    ? allLots.filter((row: any) => vaccineIds.has(Number(row.vaccine_id)))
    : allLots;
  const allowedLotIds = new Set(lots.map((row: any) => Number(row.id)));

  const allRecords = (recordsResult.data || []).filter((row: any) => !isCancelled(row.status));
  const records = allRecords.filter((row: any) => allowedLotIds.has(Number(row.lot_id)));
  const movements = (movementsResult.data || []).filter((row: any) => allowedLotIds.has(Number(row.lot_id)));

  const registrationIds = uniq(records.map((row: any) => row.registration_id)).map(Number).filter(Boolean);
  let registrations: any[] = [];
  if (registrationIds.length) {
    const result = await supabase
      .from("vaccination_registrations")
      .select("id,session_id,participant_name,employee_id,nik,mcu_id,company_name,department,queue_number,queue_status,print_status,validation_status")
      .in("id", registrationIds);
    if (!result.error) registrations = result.data || [];
  }
  const registrationMap = new Map<number, any>(registrations.map((row: any) => [Number(row.id), row]));

  const sessionIds = uniq([
    ...records.map((row: any) => row.session_id),
    ...registrations.map((row: any) => row.session_id),
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
    const lotRecords = records.filter((row: any) => Number(row.lot_id) === lotId);

    // V150.1: keep Inventory card/report usage identical to the canonical Inventory API.
    // Legacy stock_used can be higher than traceable vaccination_records; when no date
    // range is active, preserve that cumulative value instead of silently lowering usage.
    const traceableUsedAll = lotRecords.length;
    const canonicalUsedAll = Math.max(num(lot.stock_used), traceableUsedAll);
    const legacyUnattributedUsed = Math.max(0, canonicalUsedAll - traceableUsedAll);
    const hasDateFilter = Boolean(from || to);

    const initialMovements = lotMovements.filter((row: any) => isInitial(row.movement_type));
    if (initialMovements.length) {
      for (const movement of initialMovements) {
        if (!inRange(movement.created_at, from, to) && (from || to)) continue;
        details.push({
          date: movement.created_at,
          direction: "IN",
          movement_type: "Jumlah Awal",
          company: movementSource(movement),
          participant: "",
          employee_id: "",
          mcu_id: "",
          session: "",
          location: "",
          vaccine_id: Number(lot.vaccine_id),
          vaccine: vaccineName,
          brand,
          lot: clean(lot.lot_number),
          dose: "",
          doctor: clean(movement.created_by),
          qty: Math.abs(num(movement.qty)),
          print_status: "",
          validation_status: "",
          reference: clean(movement.reference_type),
          note: clean(movement.notes),
        });
      }
    } else if (num(lot.stock_initial) > 0 && (!from && !to || inRange(lot.created_at, from, to))) {
      details.push({
        date: lot.created_at,
        direction: "IN",
        movement_type: "Jumlah Awal",
        company: "Sumber belum dicatat",
        participant: "",
        employee_id: "",
        mcu_id: "",
        session: "",
        location: "",
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
    if (stockInMovements.length) {
      for (const movement of stockInMovements) {
        if (!inRange(movement.created_at, from, to)) continue;
        details.push({
          date: movement.created_at,
          direction: "IN",
          movement_type: "Tambahan Stok",
          company: movementSource(movement),
          participant: "",
          employee_id: "",
          mcu_id: "",
          session: "",
          location: "",
          vaccine_id: Number(lot.vaccine_id),
          vaccine: vaccineName,
          brand,
          lot: clean(lot.lot_number),
          dose: "",
          doctor: clean(movement.created_by),
          qty: Math.abs(num(movement.qty)),
          print_status: "",
          validation_status: "",
          reference: clean(movement.reference_type),
          note: clean(movement.notes),
        });
      }
    } else if (num(lot.stock_added) > 0 && (!from && !to || inRange(lot.created_at, from, to))) {
      details.push({
        date: lot.created_at,
        direction: "IN",
        movement_type: "Tambahan Stok",
        company: clean(lot.inventory_notes) || "Sumber belum dicatat",
        participant: "",
        employee_id: "",
        mcu_id: "",
        session: "",
        location: "",
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
        note: clean(lot.inventory_notes),
      });
    }

    for (const record of lotRecords) {
      if (!inRange(record.administered_at || record.created_at, from, to)) continue;
      const registration = registrationMap.get(Number(record.registration_id)) || {};
      const session = sessionMap.get(Number(record.session_id || registration.session_id)) || {};
      details.push({
        date: record.administered_at || record.created_at,
        direction: "OUT",
        movement_type: "Terpakai",
        company: clean(registration.company_name) || clean(session.company_name) || "Perusahaan belum dicatat",
        participant: clean(registration.participant_name) || clean(record.participant_name),
        employee_id: clean(registration.employee_id),
        mcu_id: clean(registration.mcu_id),
        session: clean(session.session_name),
        location: clean(session.location),
        vaccine_id: Number(record.vaccine_id),
        vaccine: clean(record.vaccine_name) || vaccineName,
        brand,
        lot: clean(record.lot_number) || clean(lot.lot_number),
        dose: Number(record.dose_number || 1),
        doctor: clean(record.administered_by),
        qty: 1,
        print_status: clean(registration.print_status) || (record.sticker_printed_at ? "PRINTED" : ""),
        validation_status: clean(registration.validation_status),
        reference: clean(registration.queue_number),
        note: clean(registration.department),
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
        movement_type: "Terpakai - rekonsiliasi legacy",
        company: "Perusahaan belum terpetakan",
        participant: "",
        employee_id: "",
        mcu_id: "",
        session: "",
        location: "",
        vaccine_id: Number(lot.vaccine_id),
        vaccine: vaccineName,
        brand,
        lot: clean(lot.lot_number),
        dose: "",
        doctor: "",
        qty: legacyUnattributedUsed,
        print_status: "",
        validation_status: "",
        reference: "vaccination_vaccine_lots.stock_used",
        note: `Rekonsiliasi ${legacyUnattributedUsed} pemakaian lama yang belum memiliki vaccination_records.`,
      });
    }

    const traceableUsedFiltered = lotRecords.filter((row: any) => inRange(row.administered_at || row.created_at, from, to)).length;
    const filteredUsed = hasDateFilter ? traceableUsedFiltered : canonicalUsedAll;
    const filteredAdded = details
      .filter((row: any) => row.vaccine_id === Number(lot.vaccine_id) && row.lot === clean(lot.lot_number) && row.movement_type === "Tambahan Stok")
      .reduce((sum: number, row: any) => sum + num(row.qty), 0);
    const filteredInitial = num(lot.stock_initial);
    const remaining = filteredInitial + filteredAdded - filteredUsed;
    const outCompanies = uniq(lotRecords.map((row: any) => {
      const reg = registrationMap.get(Number(row.registration_id)) || {};
      const session = sessionMap.get(Number(row.session_id || reg.session_id)) || {};
      return clean(reg.company_name) || clean(session.company_name);
    }));
    const inSources = uniq(lotMovements.filter((row: any) => isInitial(row.movement_type) || isStockIn(row.movement_type)).map(movementSource));

    lotSummaries.push({
      lot_id: lotId,
      vaccine_id: Number(lot.vaccine_id),
      vaccine_name: vaccineName,
      brand,
      lot_number: clean(lot.lot_number),
      initial: filteredInitial,
      added: filteredAdded,
      used: filteredUsed,
      remaining,
      physical: lot.stock_physical_count == null ? null : num(lot.stock_physical_count),
      diff: lot.stock_physical_count == null ? null : num(lot.stock_physical_count) - remaining,
      unattributed_used: hasDateFilter ? 0 : legacyUnattributedUsed,
      in_sources: inSources.length ? inSources : ["Sumber belum dicatat"],
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
    filters: { vaccineIds: Array.from(vaccineIds), from, to },
    products: vaccines.map((row: any) => ({ id: Number(row.id), name: clean(row.name), brand: clean(row.brand), active: row.active !== false })),
    summary,
    lotSummaries,
    details,
  };
}

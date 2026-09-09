import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { canVaccinationAccess } from "@/lib/vaccination/access";
// VACCINATION_ROLE_GUARD_V150
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

export const dynamic = "force-dynamic";

// VACCINATION_INVENTORY_COMPANY_TRACE_V149
// Read-only inventory audit endpoint.
// OUT company is derived from vaccination_record -> registration/session.
// Historical IN source is read from inventory movement notes because the current
// vaccination_inventory_movements schema has no dedicated company/source column.

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function unique(values: any[]) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function normalKey(value: any) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function productLotKey(vaccineName: any, lotNumber: any) {
  return `${normalKey(vaccineName)}|||${normalKey(lotNumber)}`;
}

function isCancelledRecord(record: any) {
  return ["CANCELLED", "CANCELED", "VOID", "BATAL"].includes(
    clean(record?.status).toUpperCase(),
  );
}

function isInitialMovement(movement: any) {
  return ["INITIAL", "OPENING", "OPENING_BALANCE"].includes(
    clean(movement?.movement_type).toUpperCase(),
  );
}

function isStockInMovement(movement: any) {
  return [
    "STOCK_IN",
    "IN",
    "ADD",
    "ADDED",
    "RESTOCK",
    "RETURN_STOCK",
    "STOCK_RETURN",
    "RETURN_IN",
    "ADJUSTMENT_IN",
  ].includes(clean(movement?.movement_type).toUpperCase());
}

function sourceFromMovement(movement: any) {
  const note = clean(movement?.notes);
  const generic = new Set([
    "",
    "jumlah awal lot",
    "tambahan stok",
    "initial stock",
    "stock in",
  ]);
  if (generic.has(note.toLowerCase())) return "Sumber belum dicatat";
  return note;
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "inventory") && !canVaccinationAccess(user, "dashboard")) return fail("Akses audit inventory ditolak untuk role ini.", 403);

  try {
    const supabase = getSupabaseAdmin();

    const [lotsResult, vaccinesResult, movementsResult, recordsResult] =
      await Promise.all([
        supabase
          .from("vaccination_vaccine_lots")
          .select(
            "id,vaccine_id,lot_number,expiry_date,stock_initial,stock_added,stock_used,stock_physical_count,inventory_notes,created_at",
          )
          .order("id", { ascending: true })
          .limit(10000),
        supabase
          .from("vaccination_vaccines")
          .select("id,name,brand")
          .order("name", { ascending: true })
          .limit(5000),
        supabase
          .from("vaccination_inventory_movements")
          .select(
            "id,vaccine_id,lot_id,movement_type,qty,reference_type,reference_id,notes,created_by,created_at",
          )
          .order("created_at", { ascending: false })
          .limit(10000),
        supabase
          .from("vaccination_records")
          .select(
            "id,registration_id,session_id,vaccine_id,lot_id,vaccine_name,lot_number,dose_number,administered_at,administered_by,status,created_at",
          )
          .order("administered_at", { ascending: false })
          .limit(10000),
      ]);

    if (lotsResult.error) return fail(lotsResult.error.message, 500);
    if (vaccinesResult.error) return fail(vaccinesResult.error.message, 500);
    if (movementsResult.error) return fail(movementsResult.error.message, 500);
    if (recordsResult.error) return fail(recordsResult.error.message, 500);

    const lots = lotsResult.data || [];
    const vaccines = vaccinesResult.data || [];
    const movements = movementsResult.data || [];
    const records = (recordsResult.data || []).filter(
      (record: any) => !isCancelledRecord(record),
    );

    const vaccineMap = new Map<number, any>();
    for (const vaccine of vaccines) {
      vaccineMap.set(Number(vaccine.id), vaccine);
    }

    const registrationIds = unique(
      records.map((record: any) => record.registration_id),
    )
      .map(Number)
      .filter(Boolean);

    let registrations: any[] = [];
    if (registrationIds.length) {
      const result = await supabase
        .from("vaccination_registrations")
        .select(
          "id,session_id,participant_name,queue_number,company_name,updated_at",
        )
        .in("id", registrationIds);
      if (!result.error) registrations = result.data || [];
    }

    const registrationMap = new Map<number, any>();
    for (const registration of registrations) {
      registrationMap.set(Number(registration.id), registration);
    }

    const sessionIds = unique([
      ...records.map((record: any) => record.session_id),
      ...registrations.map((registration: any) => registration.session_id),
    ])
      .map(Number)
      .filter(Boolean);

    let sessions: any[] = [];
    if (sessionIds.length) {
      const result = await supabase
        .from("vaccination_sessions")
        .select("id,session_name,company_name,location,session_date")
        .in("id", sessionIds);
      if (!result.error) sessions = result.data || [];
    }

    const sessionMap = new Map<number, any>();
    for (const session of sessions) {
      sessionMap.set(Number(session.id), session);
    }

    function vaccineNameFor(lot: any) {
      return clean(vaccineMap.get(Number(lot?.vaccine_id))?.name) || "Vaksin";
    }

    function companyForRecord(record: any) {
      const registration = registrationMap.get(Number(record?.registration_id));
      const session =
        sessionMap.get(
          Number(record?.session_id || registration?.session_id),
        ) || {};
      return (
        clean(registration?.company_name) ||
        clean(session?.company_name) ||
        "Perusahaan belum dicatat"
      );
    }

    function sessionForRecord(record: any) {
      const registration = registrationMap.get(Number(record?.registration_id));
      return (
        sessionMap.get(
          Number(record?.session_id || registration?.session_id),
        ) || {}
      );
    }

    const recordsByLot = new Map<number, any[]>();
    for (const record of records) {
      const lotId = Number(record.lot_id);
      if (!lotId) continue;
      const bucket = recordsByLot.get(lotId) || [];
      bucket.push(record);
      recordsByLot.set(lotId, bucket);
    }

    const movementsByLot = new Map<number, any[]>();
    for (const movement of movements) {
      const lotId = Number(movement.lot_id);
      if (!lotId) continue;
      const bucket = movementsByLot.get(lotId) || [];
      bucket.push(movement);
      movementsByLot.set(lotId, bucket);
    }

    const lotCompanySummary = lots.map((lot: any) => {
      const lotId = Number(lot.id);
      const vaccineName = vaccineNameFor(lot);
      const lotMovements = movementsByLot.get(lotId) || [];
      const lotRecords = recordsByLot.get(lotId) || [];

      const incomingMovements = lotMovements.filter(
        (movement: any) =>
          isInitialMovement(movement) || isStockInMovement(movement),
      );

      let inSources = unique(incomingMovements.map(sourceFromMovement));
      if (!inSources.length && numberValue(lot.stock_initial) > 0) {
        inSources = ["Sumber belum dicatat"];
      }

      const outCompanies = unique(lotRecords.map(companyForRecord));

      const used = lotRecords.length;
      const remaining =
        numberValue(lot.stock_initial) +
        numberValue(lot.stock_added) -
        used;
      const physical =
        lot.stock_physical_count === null ||
        lot.stock_physical_count === undefined
          ? null
          : numberValue(lot.stock_physical_count);
      const diff = physical === null ? null : physical - remaining;

      return {
        lot_id: lotId,
        vaccine_id: Number(lot.vaccine_id),
        vaccine_name: vaccineName,
        lot_number: clean(lot.lot_number) || "-",
        key: productLotKey(vaccineName, lot.lot_number),
        in_sources: inSources,
        out_companies: outCompanies,
        initial: numberValue(lot.stock_initial),
        added: numberValue(lot.stock_added),
        used,
        remaining,
        physical,
        diff,
        inventory_notes: clean(lot.inventory_notes),
      };
    });

    const initialRows: any[] = [];
    const stockInRows: any[] = [];
    const usedRows: any[] = [];
    const remainingRows: any[] = [];
    const diffRows: any[] = [];

    for (const lot of lots) {
      const lotId = Number(lot.id);
      const vaccineName = vaccineNameFor(lot);
      const lotNumber = clean(lot.lot_number) || "-";
      const lotMovements = movementsByLot.get(lotId) || [];
      const lotRecords = recordsByLot.get(lotId) || [];

      const initialMovements = lotMovements.filter(isInitialMovement);
      if (initialMovements.length) {
        for (const movement of initialMovements) {
          initialRows.push({
            id: `initial-${movement.id}`,
            direction: "IN",
            type: "Jumlah Awal",
            date: movement.created_at,
            vaccine_name: vaccineName,
            lot_number: lotNumber,
            qty: numberValue(movement.qty),
            company_or_source: sourceFromMovement(movement),
            reference: clean(movement.reference_type),
            notes: clean(movement.notes),
          });
        }
      } else if (numberValue(lot.stock_initial) > 0) {
        initialRows.push({
          id: `initial-lot-${lotId}`,
          direction: "IN",
          type: "Jumlah Awal",
          date: lot.created_at,
          vaccine_name: vaccineName,
          lot_number: lotNumber,
          qty: numberValue(lot.stock_initial),
          company_or_source: "Sumber belum dicatat",
          reference: "vaccine_lot",
          notes: "Data awal lot; sumber perusahaan belum tersimpan pada schema lama.",
        });
      }

      const inMovements = lotMovements.filter(isStockInMovement);
      if (inMovements.length) {
        for (const movement of inMovements) {
          stockInRows.push({
            id: `in-${movement.id}`,
            direction: "IN",
            type: "Tambahan Stok",
            date: movement.created_at,
            vaccine_name: vaccineName,
            lot_number: lotNumber,
            qty: numberValue(movement.qty),
            company_or_source: sourceFromMovement(movement),
            reference: clean(movement.reference_type),
            notes: clean(movement.notes),
          });
        }
      } else if (numberValue(lot.stock_added) > 0) {
        stockInRows.push({
          id: `in-lot-${lotId}`,
          direction: "IN",
          type: "Tambahan Stok",
          date: lot.created_at,
          vaccine_name: vaccineName,
          lot_number: lotNumber,
          qty: numberValue(lot.stock_added),
          company_or_source:
            clean(lot.inventory_notes) || "Sumber belum dicatat",
          reference: "vaccine_lot",
          notes:
            clean(lot.inventory_notes) ||
            "Tambahan stok lama; sumber perusahaan belum tersimpan terstruktur.",
        });
      }

      for (const record of lotRecords) {
        const registration = registrationMap.get(Number(record.registration_id));
        const session = sessionForRecord(record);
        usedRows.push({
          id: `out-${record.id}`,
          direction: "OUT",
          type: "Terpakai",
          date: record.administered_at || record.created_at,
          vaccine_name: clean(record.vaccine_name) || vaccineName,
          lot_number: clean(record.lot_number) || lotNumber,
          qty: 1,
          company_or_source: companyForRecord(record),
          reference: clean(session.session_name) || "Administered",
          notes: [
            clean(registration?.queue_number),
            clean(registration?.participant_name),
            clean(session?.location),
          ]
            .filter(Boolean)
            .join(" · "),
        });
      }

      const used = lotRecords.length;
      const remaining =
        numberValue(lot.stock_initial) +
        numberValue(lot.stock_added) -
        used;
      const physical =
        lot.stock_physical_count === null ||
        lot.stock_physical_count === undefined
          ? null
          : numberValue(lot.stock_physical_count);
      const diff = physical === null ? null : physical - remaining;
      const companies = unique(lotRecords.map(companyForRecord));
      const sources = unique(
        lotMovements
          .filter(
            (movement: any) =>
              isInitialMovement(movement) || isStockInMovement(movement),
          )
          .map(sourceFromMovement),
      );

      remainingRows.push({
        id: `remaining-${lotId}`,
        direction: "BALANCE",
        type: "Sisa Sistem",
        date: null,
        vaccine_name: vaccineName,
        lot_number: lotNumber,
        qty: remaining,
        company_or_source: [
          sources.length ? `IN: ${sources.join(", ")}` : "IN: -",
          companies.length ? `OUT: ${companies.join(", ")}` : "OUT: -",
        ].join(" | "),
        reference: "Saldo lot",
        notes: `Awal ${numberValue(lot.stock_initial)} + Tambahan ${numberValue(
          lot.stock_added,
        )} - Terpakai ${used}`,
      });

      if (physical !== null) {
        diffRows.push({
          id: `diff-${lotId}`,
          direction: "AUDIT",
          type: "Selisih",
          date: null,
          vaccine_name: vaccineName,
          lot_number: lotNumber,
          qty: diff,
          company_or_source: companies.join(", ") || "-",
          reference: "Stock opname",
          notes: `Sisa fisik ${physical} - Sisa sistem ${remaining}`,
        });
      }
    }

    const summary = {
      initial: lotCompanySummary.reduce(
        (sum: number, row: any) => sum + numberValue(row.initial),
        0,
      ),
      added: lotCompanySummary.reduce(
        (sum: number, row: any) => sum + numberValue(row.added),
        0,
      ),
      used: lotCompanySummary.reduce(
        (sum: number, row: any) => sum + numberValue(row.used),
        0,
      ),
      remaining: lotCompanySummary.reduce(
        (sum: number, row: any) => sum + numberValue(row.remaining),
        0,
      ),
      diff: lotCompanySummary.reduce(
        (sum: number, row: any) =>
          sum + (row.diff === null ? 0 : numberValue(row.diff)),
        0,
      ),
    };

    return ok({
      marker: "VACCINATION_INVENTORY_COMPANY_TRACE_V149",
      summary,
      lotCompanySummary,
      buckets: {
        initial: initialRows,
        stock_in: stockInRows,
        used: usedRows,
        remaining: remainingRows,
        diff: diffRows,
      },
      note:
        "OUT perusahaan berasal dari registration/session. IN historis memakai notes inventory karena schema movement lama belum memiliki kolom company/source khusus.",
    });
  } catch (error: any) {
    return fail(
      error?.message || "Gagal mengambil detail pergerakan inventory vaksin.",
      500,
    );
  }
}

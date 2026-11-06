import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../_utils";
import { verifyVaccinationBazarPublicToken } from "@/lib/vaccination/bazarPublicPortal";
import {
  historyCompanyKey,
  historyEmailKey,
  historyIdentityKey,
  historyNameKey,
  historyText,
} from "@/lib/vaccination/history";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CatalogItem = {
  vaccineId: number;
  lotId: number;
  vaccineName: string;
  brand: string;
  lotNumber: string;
  expiryDate: string | null;
  stockRemaining: number | null;
  masterPrice: number | null;
  salesOptions: Array<{
    id: number;
    saleMode: "PACKAGE" | "NON_PACKAGE";
    packageDoseCount: number;
    price: number;
    label: string;
  }>;
};

function json(data: any, status = 200) {
  const res = NextResponse.json(data, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeSaleMode(value: any): "PACKAGE" | "NON_PACKAGE" {
  return clean(value).toUpperCase() === "PACKAGE" ? "PACKAGE" : "NON_PACKAGE";
}


// V601: Employee ID is a family/company lookup key, not a unique person identity.
// Fail closed on conflicting names/NIK even if one legacy person id happens to match.
function sameBookingPerson(a: any, b: any): boolean {
  const norm = (value: any) => clean(value).toUpperCase().replace(/\s+/g, " ");
  const aid = Number(a?.history_person_id || a?.historyPersonId || 0);
  const bid = Number(b?.history_person_id || b?.historyPersonId || 0);
  const apid = Number(a?.participant_id || a?.participantId || 0);
  const bpid = Number(b?.participant_id || b?.participantId || 0);
  const anik = norm(a?.nik), bnik = norm(b?.nik);
  const aname = norm(a?.participant_name || a?.participantName || a?.name);
  const bname = norm(b?.participant_name || b?.participantName || b?.name);
  const aemp = norm(a?.employee_id || a?.employeeId);
  const bemp = norm(b?.employee_id || b?.employeeId);
  if (aid && bid && aid !== bid) return false;
  if (apid && bpid && apid !== bpid) return false;
  if (anik && bnik && anik !== bnik) return false;
  if (aname && bname && aname !== bname) return false;
  if (aid && bid && aid === bid) return true;
  if (apid && bpid && apid === bpid) return true;
  if (anik && bnik && anik === bnik) return true;
  return Boolean(aname && bname && aname === bname && aemp && bemp && aemp === bemp);
}

function safeQuantity(value: any): number {
  const number = Number(value == null ? 1 : value);
  if (!Number.isInteger(number) || number < 1 || number > 3) {
    throw new Error("Jumlah dosis berbayar harus 1 sampai 3 per produk. Hubungi tim untuk kebutuhan khusus.");
  }
  return number;
}

function safeStartDose(value: any): number {
  const number = Number(value == null ? 1 : value);
  if (!Number.isInteger(number) || number < 1 || number > 10) {
    throw new Error("Nomor dosis pertama yang dibeli tidak valid.");
  }
  return number;
}

function money(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function bazarUsesInternalQueue(session: any) {
  const config = session?.existing_flow_config || {};
  const legacy = config?.queue !== false;
  return config?.queue_bazar === undefined ? legacy : config?.queue_bazar !== false;
}

async function getSession(supabase: any, sessionId: number) {
  const result = await supabase
    .from("vaccination_sessions")
    .select("id,session_name,company_name,location,session_date,status,source_id,source_name,existing_queue_profile,existing_flow_config")
    .eq("id", sessionId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("Session tidak ditemukan.");
  if (clean(result.data.status).toUpperCase() === "CANCELLED") throw new Error("Session sudah dibatalkan.");
  return result.data;
}


async function loadServiceStockRemaining(supabase: any, sessionId: number) {
  const allocationsResult = await supabase
    .from("vaccination_session_stock_allocations")
    .select("lot_id,service_mode,allocated_qty,active")
    .eq("session_id", sessionId)
    .eq("service_mode", "BAZAR")
    .eq("active", true)
    .limit(10000);
  if (allocationsResult.error) throw new Error(allocationsResult.error.message);

  const allocations = allocationsResult.data || [];
  const lotIds = Array.from(
    new Set<number>(
      allocations
        .map((row: any) => Number(row.lot_id || 0))
        .filter((id: number) => id > 0),
    ),
  );
  if (!lotIds.length) return { enabled: false, map: new Map<number, number>() };

  // V570_R1_SELFBOOKING_STOCK_CANONICAL_CAP:
  // allocation tetap menentukan jatah layanan Bazar, tetapi stok publik tidak
  // boleh melebihi stok Lot canonical yang sama dengan Inventory.
  const [itemsResult, lotsResult, movementsResult] = await Promise.all([
    supabase
      .from("vaccination_registration_items")
      .select("lot_id,service_mode,status,active,registration:vaccination_registrations!inner(session_id)")
      .in("lot_id", lotIds)
      .eq("active", true)
      .in("status", ["ADMINISTERED", "DONE", "FINISHED"])
      .eq("registration.session_id", sessionId)
      .limit(20000),
    supabase
      .from("vaccination_vaccine_lots")
      .select("id,stock_initial,stock_added,stock_used,active")
      .in("id", lotIds)
      .eq("active", true)
      .limit(10000),
    supabase
      .from("vaccination_inventory_movements")
      .select("lot_id,movement_type,qty")
      .in("lot_id", lotIds)
      .limit(20000),
  ]);

  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (lotsResult.error) throw new Error(lotsResult.error.message);
  if (movementsResult.error) throw new Error(movementsResult.error.message);

  const totalUsed = new Map<number, number>();
  const bazarUsed = new Map<number, number>();
  const trackedLots = new Set<number>();

  for (const row of itemsResult.data || []) {
    const lotId = Number((row as any).lot_id || 0);
    if (!lotId) continue;
    trackedLots.add(lotId);
    totalUsed.set(lotId, (totalUsed.get(lotId) || 0) + 1);
    if (clean((row as any).service_mode).toUpperCase() === "BAZAR") {
      bazarUsed.set(lotId, (bazarUsed.get(lotId) || 0) + 1);
    }
  }

  const inboundTypes = new Set([
    "STOCK_IN",
    "IN",
    "ADD",
    "ADDED",
    "RESTOCK",
    "RETURN_STOCK",
    "STOCK_RETURN",
    "RETURN_IN",
    "ADJUSTMENT_IN",
    "STOCK_TRANSFER_IN",
  ]);
  const adjustmentOutTypes = new Set([
    "STOCK_OUT_ADJUSTMENT",
    "ADJUSTMENT_OUT",
    "MANUAL_STOCK_OUT",
    "STOCK_REDUCTION",
    "STOCK_TRANSFER_OUT",
  ]);
  const inboundByLot = new Map<number, number>();
  const adjustmentOutByLot = new Map<number, number>();

  for (const row of movementsResult.data || []) {
    const lotId = Number((row as any).lot_id || 0);
    if (!lotId) continue;
    const type = clean((row as any).movement_type).toUpperCase();
    const qty = Math.abs(Number((row as any).qty || 0));
    if (inboundTypes.has(type)) {
      inboundByLot.set(lotId, (inboundByLot.get(lotId) || 0) + qty);
    }
    if (adjustmentOutTypes.has(type)) {
      adjustmentOutByLot.set(
        lotId,
        (adjustmentOutByLot.get(lotId) || 0) + qty,
      );
    }
  }

  const lotRemaining = new Map<number, number>();
  for (const row of lotsResult.data || []) {
    const lotId = Number((row as any).id || 0);
    if (!lotId) continue;
    const initial = Number((row as any).stock_initial || 0);
    const added = Math.max(
      Number((row as any).stock_added || 0),
      inboundByLot.get(lotId) || 0,
    );
    const used = trackedLots.has(lotId)
      ? totalUsed.get(lotId) || 0
      : Math.max(0, Number((row as any).stock_used || 0));
    const adjustmentOut = adjustmentOutByLot.get(lotId) || 0;
    lotRemaining.set(
      lotId,
      Math.max(0, initial + added - used - adjustmentOut),
    );
  }

  const allocatedByLot = new Map<number, number>();
  for (const row of allocations) {
    const lotId = Number((row as any).lot_id || 0);
    if (!lotId) continue;
    allocatedByLot.set(
      lotId,
      (allocatedByLot.get(lotId) || 0) +
        Math.max(0, Number((row as any).allocated_qty || 0)),
    );
  }

  const map = new Map<number, number>();
  for (const [lotId, allocated] of allocatedByLot.entries()) {
    const allocationRemaining = Math.max(
      0,
      allocated - (bazarUsed.get(lotId) || 0),
    );
    const canonicalRemaining = lotRemaining.get(lotId);

    // Never show/sell more than the canonical Lot can physically/systemically hold.
    map.set(
      lotId,
      canonicalRemaining === undefined
        ? allocationRemaining
        : Math.min(allocationRemaining, canonicalRemaining),
    );
  }

  return { enabled: allocations.length > 0, map };
}

async function loadBazarCatalog(supabase: any, sessionId: number): Promise<CatalogItem[]> {
  const [assignmentResult, sessionLotsResult, stock] = await Promise.all([
    supabase
      .from("vaccination_session_product_assignments")
      .select("vaccine_id")
      .eq("session_id", sessionId)
      .eq("service_mode", "BAZAR")
      .eq("active", true)
      .limit(10000),
    // V527: same effective source used by Register for legacy Bazar catalog:
    // active lot owned by this Session + active priced product.
    supabase
      .from("vaccination_vaccine_lots")
      .select("id,vaccine_id,lot_number,expiry_date,active,stock_scope,stock_session_id,vaccine:vaccination_vaccines(id,name,brand,price,price_category,active)")
      .eq("stock_scope", "SESSION")
      .eq("stock_session_id", sessionId)
      .eq("active", true)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(10000),
    loadServiceStockRemaining(supabase, sessionId),
  ]);
  if (assignmentResult.error) throw new Error(assignmentResult.error.message);
  if (sessionLotsResult.error) throw new Error(sessionLotsResult.error.message);

  const assignedIds = new Set<number>(
    (assignmentResult.data || [])
      .map((row: any) => Number(row.vaccine_id || 0))
      .filter((id: number) => id > 0),
  );

  const vaccineIds = Array.from(
    new Set<number>(
      (sessionLotsResult.data || [])
        .map((row: any) => Number(row.vaccine_id || 0))
        .filter((id: number) => id > 0),
    ),
  );
  if (!vaccineIds.length) return [];

  const offersResult = await supabase
    .from("vaccination_vaccine_sales_options")
    .select("id,vaccine_id,sale_mode,package_dose_count,price,label,active")
    .in("vaccine_id", vaccineIds)
    .eq("active", true)
    .order("vaccine_id", { ascending: true });
  if (offersResult.error) throw new Error(offersResult.error.message);

  const offersByVaccine = new Map<number, any[]>();
  for (const offer of offersResult.data || []) {
    const vaccineId = Number((offer as any).vaccine_id || 0);
    if (!vaccineId) continue;
    if (!offersByVaccine.has(vaccineId)) offersByVaccine.set(vaccineId, []);
    offersByVaccine.get(vaccineId)!.push(offer);
  }

  const catalog: CatalogItem[] = [];
  const seen = new Set<string>();
  for (const row of sessionLotsResult.data || []) {
    const vaccineId = Number((row as any).vaccine_id || 0);
    const lotId = Number((row as any).id || 0);
    if (!vaccineId || !lotId) continue;

    const vaccine: any = Array.isArray((row as any).vaccine)
      ? (row as any).vaccine[0]
      : (row as any).vaccine;
    if (!vaccine || vaccine.active === false) continue;

    const rawOffers = offersByVaccine.get(vaccineId) || [];
    const masterPrice = vaccine.price == null ? null : money(vaccine.price);
    const hasPricedOffer = rawOffers.some((offer: any) => money(offer?.price) > 0);
    const namedBazar = /(^|[^A-Z])BAZAR([^A-Z]|$)/i.test(clean(vaccine.name));
    const assignedBazar = assignedIds.has(vaccineId);
    const allocatedBazar = stock.map.has(lotId);

    // If explicit Bazar metadata exists, respect it. Legacy named/allocated rows are
    // also valid. When the Session has no Bazar assignments at all, preserve the
    // Register compatibility rule: a priced Session-scoped lot is Bazar-capable.
    const legacyPricedFallback = assignedIds.size === 0 && (Number(masterPrice || 0) > 0 || hasPricedOffer);
    if (!assignedBazar && !allocatedBazar && !namedBazar && !legacyPricedFallback) continue;

    const key = `${vaccineId}:${lotId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const salesOptions = rawOffers
      .map((offer: any) => ({
        id: Number(offer.id),
        saleMode: normalizeSaleMode(offer.sale_mode),
        packageDoseCount: Math.max(1, Number(offer.package_dose_count || 1)),
        price: money(offer.price),
        label: clean(offer.label) || (normalizeSaleMode(offer.sale_mode) === "PACKAGE" ? "Paket" : "Non Paket"),
      }))
      .filter((offer: any) => offer.price > 0);

    if (masterPrice && !salesOptions.some((offer: any) => offer.saleMode === "NON_PACKAGE")) {
      salesOptions.unshift({ id: 0, saleMode: "NON_PACKAGE", packageDoseCount: 1, price: masterPrice, label: "Non Paket" });
    }
    if (!salesOptions.length) continue;

    const remaining = stock.enabled ? Number(stock.map.get(lotId) || 0) : null;
    if (stock.enabled && remaining <= 0) continue;

    catalog.push({
      vaccineId,
      lotId,
      vaccineName: clean(vaccine.name) || "Produk Bazar",
      brand: clean(vaccine.brand),
      lotNumber: clean((row as any).lot_number) || "-",
      expiryDate: (row as any).expiry_date || null,
      stockRemaining: remaining,
      masterPrice,
      salesOptions,
    });
  }

  return catalog.sort((a, b) => `${a.vaccineName} ${a.brand}`.localeCompare(`${b.vaccineName} ${b.brand}`, "id"));
}

async function resolveHistoryCompany(supabase: any, companyName: string) {
  const key = historyCompanyKey(companyName);
  if (!key || key === "unknown-company") return null;
  const existing = await supabase
    .from("vaccination_history_companies")
    .select("id,company_name,company_key,active")
    .eq("company_key", key)
    .eq("active", true)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;

  const inserted = await supabase
    .from("vaccination_history_companies")
    .insert({ company_name: companyName, company_key: key, active: true })
    .select("id,company_name,company_key,active")
    .single();
  if (inserted.error) throw new Error(inserted.error.message);
  return inserted.data;
}

function operationalPerson(row: any, companyName: string) {
  return {
    sourceType: "DATABASE",
    participantId: Number(row?.id || 0) || null,
    historyPersonId: null,
    name: clean(row?.name || row?.participant_name),
    employeeId: clean(row?.employee_id || row?.employee_nik || row?.external_id || row?.mcu_id || row?.barcode_value),
    nik: clean(row?.nik || row?.ktp || row?.nik_ktp),
    email: clean(row?.email || row?.email_company || row?.company_email),
    phone: clean(row?.phone || row?.no_hp || row?.mobile || row?.phone_number),
    department: clean(row?.department || row?.departement || row?.division || row?.unit),
    gender: clean(row?.gender || row?.jenis_kelamin),
    birthDate: row?.birth_date || row?.date_of_birth || row?.dob || null,
    companyName,
  };
}

function historyPerson(row: any, companyName: string) {
  return {
    sourceType: "HISTORY",
    participantId: null,
    historyPersonId: Number(row?.id || 0) || null,
    name: clean(row?.participant_name),
    employeeId: clean(row?.employee_id),
    nik: clean(row?.nik),
    email: clean(row?.email),
    phone: clean(row?.phone),
    department: "",
    gender: clean(row?.gender),
    birthDate: row?.birth_date || null,
    companyName,
  };
}

function mergePerson(primary: any, secondary: any) {
  if (!primary) return secondary;
  if (!secondary) return primary;
  return {
    ...primary,
    participantId: primary.participantId || secondary.participantId || null,
    historyPersonId: primary.historyPersonId || secondary.historyPersonId || null,
    name: primary.name || secondary.name,
    employeeId: primary.employeeId || secondary.employeeId,
    nik: primary.nik || secondary.nik,
    email: primary.email || secondary.email,
    phone: primary.phone || secondary.phone,
    department: primary.department || secondary.department,
    gender: primary.gender || secondary.gender,
    birthDate: primary.birthDate || secondary.birthDate,
    sourceType: primary.sourceType === secondary.sourceType ? primary.sourceType : "DATABASE + HISTORY",
  };
}

async function lookupByEmployeeId(supabase: any, session: any, employeeIdInput: string) {
  const employeeKey = historyIdentityKey(employeeIdInput);
  if (!employeeKey) return null;

  let operational: any = null;
  const sourceId = Number(session.source_id || 0);
  if (sourceId) {
    const fields = ["employee_id", "employee_nik", "external_id", "mcu_id", "barcode_value"];
    for (const field of fields) {
      const result = await supabase
        .from("participants")
        .select("*")
        .eq("source_id", sourceId)
        .eq(field, employeeIdInput)
        .limit(2);
      if (result.error) continue;
      if ((result.data || []).length) {
        operational = operationalPerson(result.data![0], clean(session.company_name));
        break;
      }
    }
  }

  const company = await resolveHistoryCompany(supabase, clean(session.company_name));
  let history: any = null;
  if (company?.id) {
    const result = await supabase
      .from("vaccination_persons")
      .select("id,participant_type,participant_name,employee_id,employee_key,nik,email,phone,birth_date,gender,active")
      .eq("company_id", Number(company.id))
      .eq("participant_type", "EMPLOYEE")
      .eq("active", true)
      .eq("employee_key", employeeKey)
      .limit(2);
    if (result.error) throw new Error(result.error.message);
    if ((result.data || []).length > 1) throw new Error("ID peserta mengarah ke lebih dari satu data. Hubungi petugas registrasi.");
    if (result.data?.[0]) history = historyPerson(result.data[0], clean(session.company_name));
  }

  return mergePerson(operational, history);
}


async function linkedBazarFamilyMembers(supabase: any, session: any, parent: any) {
  const parentPersonId = Number(parent?.historyPersonId || 0);
  if (!parentPersonId) return [];
  const company = await resolveHistoryCompany(supabase, clean(session.company_name));
  if (!company?.id) return [];
  const links = await supabase.from("vaccination_person_relationships")
    .select("dependent_person_id")
    .eq("company_id", Number(company.id))
    .eq("parent_person_id", parentPersonId)
    .eq("active", true).limit(100);
  // Relationship table is optional for older Sessions; do not break parent booking.
  if (links.error) return [];
  const ids = Array.from(new Set<number>((links.data || [])
    .map((row: any) => Number(row.dependent_person_id || 0)).filter((id: number) => id > 0)));
  if (!ids.length) return [];
  const people = await supabase.from("vaccination_persons")
    .select("id,participant_name,employee_id,nik,email,phone,birth_date,gender,active,participant_type,company_id")
    .eq("company_id", Number(company.id)).eq("active", true)
    .in("id", ids).limit(100);
  if (people.error) return [];
  return (people.data || []).filter((row: any) => row.participant_type === "DEPENDENT")
    .map((row: any) => ({ ...historyPerson(row, clean(session.company_name)),
      employeeId: clean(parent.employeeId), participantId: null }));
}

async function saveStandardPerson(supabase: any, session: any, body: any) {
  const company = await resolveHistoryCompany(supabase, clean(session.company_name));
  if (!company?.id) throw new Error("Perusahaan untuk session ini belum tersedia.");

  const name = historyText(body.name || body.participantName);
  const employeeId = historyText(body.employeeId || body.employee_id);
  const nik = historyText(body.nik);
  const email = historyEmailKey(body.email);
  const phone = historyText(body.phone);
  const gender = historyText(body.gender);
  const birthDate = clean(body.birthDate || body.birth_date);
  if (!name || !employeeId || !nik || !email || !phone || !gender || !birthDate) {
    throw new Error("Lengkapi Nama, NIK KTP, NIP/Employee ID, Email, No. HP, Jenis Kelamin, dan Tanggal Lahir.");
  }

  const employeeKey = historyIdentityKey(employeeId);
  const existing = await supabase
    .from("vaccination_persons")
    .select("*")
    .eq("company_id", Number(company.id))
    .eq("participant_type", "EMPLOYEE")
    .eq("active", true)
    .eq("employee_key", employeeKey)
    .limit(2);
  if (existing.error) throw new Error(existing.error.message);
  if ((existing.data || []).length > 1) throw new Error("NIP / Employee ID mengarah ke lebih dari satu peserta.");

  const desired = {
    company_id: Number(company.id),
    participant_type: "EMPLOYEE",
    participant_name: name,
    name_key: historyNameKey(name),
    employee_id: employeeId,
    employee_key: employeeKey,
    nik,
    nik_key: historyIdentityKey(nik) || null,
    email,
    email_key: email || null,
    phone,
    birth_date: birthDate,
    gender,
    active: true,
    updated_at: new Date().toISOString(),
  };

  let person: any = existing.data?.[0] || null;
  if (person) {
    const conflicts = [
      [historyIdentityKey(person.nik_key || person.nik), historyIdentityKey(nik), "NIK KTP"],
      [historyEmailKey(person.email_key || person.email), email, "Email"],
    ];
    for (const [oldValue, newValue, label] of conflicts) {
      if (oldValue && newValue && oldValue !== newValue) throw new Error(`${label} berbeda dengan data peserta existing. Hubungi petugas registrasi.`);
    }
    const patch: Record<string, any> = {};
    for (const key of ["participant_name", "name_key", "nik", "nik_key", "email", "email_key", "phone", "birth_date", "gender"] as const) {
      if (!person[key] && (desired as any)[key]) patch[key] = (desired as any)[key];
    }
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      const updated = await supabase.from("vaccination_persons").update(patch).eq("id", person.id).select("*").single();
      if (updated.error) throw new Error(updated.error.message);
      person = updated.data;
    }
  } else {
    const inserted = await supabase.from("vaccination_persons").insert(desired).select("*").single();
    if (inserted.error) throw new Error(inserted.error.message);
    person = inserted.data;
  }

  return historyPerson(person, clean(session.company_name));
}

async function createSelfBooking(supabase: any, session: any, person: any, selectedItems: any[]) {
  const catalog = await loadBazarCatalog(supabase, Number(session.id));
  const catalogMap = new Map(catalog.map((item) => [`${item.vaccineId}:${item.lotId}`, item]));
  if (!selectedItems.length) throw new Error("Pilih minimal satu produk Bazar.");

  const snapshots: any[] = [];
  let estimatedTotal = 0;
  const seenProducts = new Set<string>();
  for (const input of selectedItems) {
    const vaccineId = Number(input.vaccineId || input.vaccine_id || 0);
    const lotId = Number(input.lotId || input.lot_id || 0);
    const key = `${vaccineId}:${lotId}`;
    if (seenProducts.has(key)) throw new Error("Produk sama dipilih lebih dari sekali. Gunakan Jumlah Dosis.");
    seenProducts.add(key);
    const option = catalogMap.get(key);
    if (!option) throw new Error("Produk yang dipilih sudah tidak tersedia pada Session Bazar ini. Muat ulang lalu pilih kembali.");
    const saleMode = normalizeSaleMode(input.saleMode || input.sale_mode);
    const quantity = safeQuantity(input.quantity);
    const startDose = safeStartDose(input.startDose || input.start_dose);
    if (saleMode === "PACKAGE" && quantity !== 1) throw new Error("Paket sudah mencakup beberapa dosis. Jumlah Paket hanya boleh satu.");
    if (option.stockRemaining != null && Number(option.stockRemaining) < quantity) {
      throw new Error("Stok Bazar produk terpilih tidak cukup untuk jumlah dosis yang dibayar.");
    }
    const offer = option.salesOptions.find((item) => item.saleMode === saleMode);
    if (!offer || offer.price <= 0) {
      throw new Error(saleMode === "PACKAGE" ? "Harga Paket belum tersedia." : "Harga Non Paket belum tersedia.");
    }
    estimatedTotal = money(estimatedTotal + money(offer.price) * quantity);
    snapshots.push({
      vaccineId: option.vaccineId,
      lotId: option.lotId,
      vaccineName: option.vaccineName,
      brand: option.brand,
      lotNumber: option.lotNumber,
      saleMode,
      salesOptionId: offer.id || null,
      packageDoseCount: Math.max(1, Number(offer.packageDoseCount || 1)),
      quantity,
      startDose,
      unitPrice: money(offer.price),
    });
  }

  const employeeId = clean(person.employeeId);
  if (!employeeId) throw new Error("NIP / Employee ID wajib diisi.");
  const now = new Date().toISOString();
  const payload = {
    session_id: Number(session.id),
    source_id: Number(session.source_id || 0) || null,
    participant_id: Number(person.participantId || 0) || null,
    history_person_id: Number(person.historyPersonId || 0) || null,
    participant_name: clean(person.name),
    employee_id: employeeId,
    nik: clean(person.nik) || null,
    email: clean(person.email) || null,
    phone: clean(person.phone) || null,
    company_name: clean(session.company_name) || clean(person.companyName) || null,
    department: clean(person.department) || null,
    gender: clean(person.gender) || null,
    birth_date: person.birthDate || null,
    selected_items: snapshots,
    estimated_total: estimatedTotal,
    payment_method: null,
    payment_status: "PENDING",
    booking_status: "PENDING",
    updated_at: now,
  };

  // V601: never overwrite a relative's pending order merely because Employee ID matches.
  const pending = await supabase
    .from("vaccination_bazar_self_bookings")
    .select("id,booking_status,participant_id,history_person_id,participant_name,employee_id,nik")
    .eq("session_id", Number(session.id))
    .eq("employee_id", employeeId)
    .eq("booking_status", "PENDING")
    .order("id", { ascending: false })
    .limit(100);
  if (pending.error) {
    if (String(pending.error.message || "").includes("vaccination_bazar_self_bookings")) {
      throw new Error("Pendaftaran mandiri belum siap digunakan. Hubungi tim registrasi.");
    }
    throw new Error(pending.error.message);
  }
  if ((pending.data || []).length === 100) {
    throw new Error("Terlalu banyak pesanan pending untuk Employee ID ini; hubungi tim registrasi agar tidak tertukar.");
  }
  const matching = (pending.data || []).filter((row: any) => sameBookingPerson(row, payload));
  if (matching.length > 1) throw new Error("Ditemukan beberapa pesanan pending milik peserta yang sama. Tim registrasi perlu memeriksa sebelum melanjutkan.");
  if (matching.length === 1) {
    const update = await supabase
      .from("vaccination_bazar_self_bookings")
      .update(payload)
      .eq("id", Number(matching[0].id))
      .eq("booking_status", "PENDING")
      .select("id,booking_status,estimated_total,submitted_at")
      .single();
    if (update.error) throw new Error(update.error.message);
    return { ...update.data, updatedExisting: true };
  }

  const insert = await supabase
    .from("vaccination_bazar_self_bookings")
    .insert({ ...payload, submitted_at: now, created_at: now })
    .select("id,booking_status,estimated_total,submitted_at")
    .single();
  if (insert.error) throw new Error(insert.error.message);
  return { ...insert.data, updatedExisting: false };
}

async function contextFromToken(token: any) {
  const verified = verifyVaccinationBazarPublicToken(token);
  if (!verified.valid || !verified.sessionId) throw new Error("Link Portal Bazar tidak valid.");
  const supabase = supabaseAdmin();
  const session = await getSession(supabase, verified.sessionId);
  const catalog = await loadBazarCatalog(supabase, verified.sessionId);
  if (!catalog.length) throw new Error("Belum ada produk Bazar aktif dan tersedia pada Session ini.");
  return { supabase, session, catalog };
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    const { session, catalog } = await contextFromToken(token);
    return json({
      ok: true,
      session: {
        id: Number(session.id),
        sessionName: clean(session.session_name),
        companyName: clean(session.company_name),
        location: clean(session.location),
        sessionDate: session.session_date || null,
        bazarQueueMode: bazarUsesInternalQueue(session) ? "INTERNAL" : "VENDOR",
      },
      products: catalog,
    });
  } catch (error: any) {
    return json({ ok: false, message: error?.message || "Portal Bazar tidak dapat dibuka." }, 400);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { supabase, session } = await contextFromToken(body.token);
    const action = clean(body.action).toLowerCase();

    if (action === "lookup") {
      const employeeId = clean(body.employeeId || body.employee_id);
      if (!employeeId) return json({ ok: false, message: "NIP / Employee ID wajib diisi." }, 400);
      const person = await lookupByEmployeeId(supabase, session, employeeId);
      const familyMembers = person ? await linkedBazarFamilyMembers(supabase, session, person) : [];
      // Never expose dependent NIK, phone, birth date or email on a public lookup.
      const safeFamilyChoices = familyMembers.map((member: any) => ({
        historyPersonId: Number(member.historyPersonId),
        name: clean(member.name), employeeId, companyName: clean(session.company_name),
      }));
      return json({ ok: true, found: Boolean(person), person: person || null, familyMembers: safeFamilyChoices, employeeId, companyName: clean(session.company_name) });
    }

    if (action === "save-participant") {
      const person = await saveStandardPerson(supabase, session, body);
      return json({ ok: true, person, message: "Data peserta berhasil disimpan." });
    }

    if (action === "register") {
      let person = body.person || null;
      const employeeId = clean(person?.employeeId || body.employeeId || body.employee_id);
      if (!employeeId) return json({ ok: false, message: "NIP / Employee ID wajib diisi." }, 400);
      const canonical = await lookupByEmployeeId(supabase, session, employeeId);
      if (!canonical) return json({ ok: false, message: "Identitas peserta tidak ditemukan di database perusahaan. Ulangi pencarian." }, 409);
      const requestedPersonId = Number(person?.historyPersonId || 0);
      if (requestedPersonId && requestedPersonId !== Number(canonical.historyPersonId || 0)) {
        const allowedChildren = await linkedBazarFamilyMembers(supabase, session, canonical);
        person = allowedChildren.find((candidate: any) =>
          Number(candidate.historyPersonId) === requestedPersonId) || null;
        if (!person) return json({ ok: false, message: "Anggota keluarga belum terhubung ke Parent ini. Hubungkan melalui Registrasi Vaksinasi terlebih dahulu." }, 409);
      } else {
        // Ignore browser-controlled name/NIK; only the canonical database person can be booked.
        person = canonical;
      }
      if (!person?.name) return json({ ok: false, message: "Data peserta belum lengkap. Lengkapi data terlebih dahulu." }, 400);
      const booking = await createSelfBooking(
        supabase,
        session,
        person,
        Array.isArray(body.items) ? body.items : [],
      );
      return json({
        ok: true,
        message: booking.updatedExisting
          ? "Pilihan Bazar Anda diperbarui dan tetap menunggu proses tim registrasi."
          : "Pendaftaran Bazar berhasil dikirim dan menunggu proses tim registrasi.",
        booking: {
          id: Number(booking.id || 0),
          status: clean(booking.booking_status) || "PENDING",
          estimatedTotal: money(booking.estimated_total),
          submittedAt: booking.submitted_at || null,
        },
      });
    }

    return json({ ok: false, message: "Aksi Portal Bazar tidak dikenali." }, 400);
  } catch (error: any) {
    return json({ ok: false, message: error?.message || "Gagal memproses Portal Bazar." }, 400);
  }
}

import { NextRequest } from "next/server";
import { clean, fail, formatQueueNumber, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { syncRegistrationTrackDone } from "@/lib/vaccination/queueDoneInventory";
import {
  historyCompanyKey,
  historyEmailKey,
  historyIdentityKey,
  historyNameKey,
  historyText,
} from "@/lib/vaccination/history";

// VACCINATION_ROLE_GUARD_V150
export const dynamic = "force-dynamic";

function userLabel(user: any) {
  return user?.email || user?.name || user?.id || "system";
}

const BAZAR_PAYMENT_METHODS = new Set(["QRIS", "DEBIT", "CREDIT_CARD", "TRANSFER"]);

function isHealthdayBazarSession(session: any) {
  return String(session?.existing_queue_profile || "LEGACY").trim().toUpperCase() === "HEALTHDAY_BAZAR";
}

function normalizeServiceMode(value: any, allowBazar: boolean) {
  return allowBazar && String(value || "").trim().toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
}

function normalizeBazarPaymentMethod(value: any) {
  const raw = String(value || "").trim().toUpperCase().replace(/[ -]+/g, "_");
  const alias = raw === "CC" || raw === "CREDITCARD" || raw === "KARTU_KREDIT" ? "CREDIT_CARD" : raw;
  return BAZAR_PAYMENT_METHODS.has(alias) ? alias : "";
}

function moneyNumber(value: any) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function normalizeSaleMode(value: any): "PACKAGE" | "NON_PACKAGE" {
  return String(value || "").trim().toUpperCase() === "PACKAGE" ? "PACKAGE" : "NON_PACKAGE";
}

function patientServiceStatus(items: any[]) {
  const modes = new Set((items || []).map((item: any) => String(item?.service_mode || "HEALTHDAY").toUpperCase()));
  if (modes.has("HEALTHDAY") && modes.has("BAZAR")) return "COMBINATION";
  if (modes.has("BAZAR")) return "BAZAR";
  return "HEALTHDAY";
}

function bazarBillingSummary(items: any[]) {
  const bazarItems = (items || []).filter((item: any) => String(item?.service_mode || "").toUpperCase() === "BAZAR");
  const total = moneyNumber(bazarItems.reduce((sum: number, item: any) => sum + Number(item?.payment_total ?? item?.price ?? 0), 0));
  return {
    hasBazar: bazarItems.length > 0,
    total,
    paymentMethod: bazarItems.find((item: any) => item?.payment_method)?.payment_method || null,
  };
}

async function validateBazarItems(supabase: any, items: any[], allowBazar: boolean) {
  if (!allowBazar) return "";
  const bazarItems = (items || []).filter((item: any) => normalizeServiceMode(item?.service_mode, true) === "BAZAR");
  if (!bazarItems.length) return "";

  for (const item of bazarItems) {
    if (!normalizeBazarPaymentMethod(item?.payment_method)) {
      return "Metode pembayaran Bazar wajib QRIS, Debit, Credit Card, atau Transfer.";
    }
  }

  const vaccineIds: number[] = Array.from(
    new Set<number>(bazarItems.map((item: any) => Number(item?.vaccine_id || 0)).filter((id: number) => id > 0)),
  );
  const [priceResult, offerResult] = await Promise.all([
    supabase.from("vaccination_vaccines").select("id,price").in("id", vaccineIds),
    supabase
      .from("vaccination_vaccine_sales_options")
      .select("id,vaccine_id,sale_mode,package_dose_count,price,active")
      .in("vaccine_id", vaccineIds)
      .eq("active", true),
  ]);
  if (priceResult.error) throw new Error(priceResult.error.message);
  if (offerResult.error) throw new Error(offerResult.error.message);

  const priceMap = new Map<number, any>((priceResult.data || []).map((row: any) => [Number(row.id), row.price]));
  const offerMap = new Map<string, any>();
  for (const offer of offerResult.data || []) {
    offerMap.set(`${Number(offer.vaccine_id)}:${normalizeSaleMode(offer.sale_mode)}`, offer);
  }

  for (const item of bazarItems) {
    const vaccineId = Number(item.vaccine_id || 0);
    const mode = normalizeSaleMode(item.sale_mode);
    const offer = offerMap.get(`${vaccineId}:${mode}`);
    const price = offer?.price ?? (mode === "NON_PACKAGE" ? priceMap.get(vaccineId) : null);
    if (price == null || !Number.isFinite(Number(price)) || Number(price) <= 0) {
      return mode === "PACKAGE"
        ? "Ada layanan Bazar Paket yang belum memiliki harga Paket aktif pada Master Produk."
        : "Ada layanan Bazar yang belum memiliki harga Non Paket > 0 pada Master Produk.";
    }
  }

  return "";
}


function normalizeFamilyRole(value: any) {
  return String(value || "").trim().toUpperCase() === "DEPENDENT"
    ? "DEPENDENT"
    : "PARENT";
}

function historyCompanyHintMatches(companyKey: string, hint: string) {
  if (!companyKey || companyKey === "unknown-company" || !hint) return false;
  const hintKey = historyCompanyKey(hint);
  if (!hintKey || hintKey === "unknown-company") return false;
  if (companyKey === hintKey) return true;
  return companyKey.includes(hintKey) || hintKey.includes(companyKey);
}

async function resolveRegistrationHistoryCompany(
  supabase: any,
  session: any,
  body: any,
) {
  const hints = [
    body?.companyName,
    body?.company_name,
    session?.company_name,
    session?.source_name,
    session?.session_name,
  ]
    .map(historyText)
    .filter(Boolean);

  const keys = Array.from(
    new Set(
      hints
        .map(historyCompanyKey)
        .filter((key) => key && key !== "unknown-company"),
    ),
  );

  for (const key of keys) {
    const exact = await supabase
      .from("vaccination_history_companies")
      .select("id,company_name,company_key,active")
      .eq("company_key", key)
      .eq("active", true)
      .maybeSingle();
    if (exact.error) throw new Error(exact.error.message);
    if (exact.data) return exact.data;
  }

  const all = await supabase
    .from("vaccination_history_companies")
    .select("id,company_name,company_key,active")
    .eq("active", true)
    .limit(500);
  if (all.error) throw new Error(all.error.message);

  const matches = (all.data || []).filter((company: any) =>
    hints.some((hint) =>
      historyCompanyHintMatches(
        historyText(company?.company_key),
        hint,
      ),
    ),
  );

  return matches.length === 1 ? matches[0] : null;
}

async function historyPersonById(
  supabase: any,
  companyId: number,
  personId: number,
) {
  if (!personId) return null;
  const result = await supabase
    .from("vaccination_persons")
    .select("*")
    .eq("id", personId)
    .eq("company_id", companyId)
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data || null;
}

async function findDependentForParent(
  supabase: any,
  companyId: number,
  parentId: number,
  body: any,
) {
  const childNikKey = historyIdentityKey(body?.nik);
  if (childNikKey) {
    const byNik = await supabase
      .from("vaccination_persons")
      .select("*")
      .eq("company_id", companyId)
      .eq("participant_type", "DEPENDENT")
      .eq("active", true)
      .eq("nik_key", childNikKey)
      .limit(3);
    if (byNik.error) throw new Error(byNik.error.message);
    if ((byNik.data || []).length > 1) {
      throw new Error("NIK Child / Family mengarah ke lebih dari satu data History.");
    }
    const found = byNik.data?.[0] || null;
    if (found) return found;
  }

  const nameKey = historyNameKey(body?.participantName || body?.participant_name);
  if (!nameKey) return null;

  const rels = await supabase
    .from("vaccination_person_relationships")
    .select(
      "dependent_person_id,dependent:vaccination_persons!vaccination_person_relationships_dependent_person_id_fkey(*)",
    )
    .eq("company_id", companyId)
    .eq("parent_person_id", parentId)
    .eq("active", true);
  if (rels.error) throw new Error(rels.error.message);

  const matches = (rels.data || [])
    .map((row: any) =>
      Array.isArray(row?.dependent) ? row.dependent[0] : row?.dependent,
    )
    .filter(
      (person: any) =>
        person?.id &&
        person?.active !== false &&
        String(person?.participant_type || "").toUpperCase() === "DEPENDENT" &&
        historyNameKey(person?.name_key || person?.participant_name) === nameKey,
    );

  if (matches.length > 1) {
    throw new Error(
      "Nama Child / Family yang sama tercatat lebih dari satu kali pada parent ini. Tambahkan NIK anak untuk memastikan identitas.",
    );
  }

  return matches[0] || null;
}

async function syncRegistrationFamily(
  supabase: any,
  registration: any,
  session: any,
  body: any,
) {
  const familyRole = normalizeFamilyRole(body?.familyRole || body?.family_role);
  const requestedHistoryPersonId = toInt(
    body?.historyPersonId || body?.history_person_id,
    0,
  );
  const requestedParentId = toInt(
    body?.parentHistoryPersonId || body?.parent_history_person_id,
    0,
  );

  if (familyRole === "PARENT") {
    let verifiedHistoryPersonId: number | null = null;

    if (requestedHistoryPersonId) {
      const company = await resolveRegistrationHistoryCompany(
        supabase,
        session,
        body,
      );
      if (!company) {
        throw new Error(
          "History Company untuk peserta Parent tidak ditemukan. Pilih perusahaan yang sesuai.",
        );
      }

      const person = await historyPersonById(
        supabase,
        Number(company.id),
        requestedHistoryPersonId,
      );
      if (!person) {
        throw new Error("Peserta Parent existing tidak ditemukan di History Company.");
      }
      if (String(person.participant_type || "").toUpperCase() !== "EMPLOYEE") {
        throw new Error(
          "Peserta yang dipilih tercatat sebagai Child / Family. Ubah tipe peserta menjadi Child / Family.",
        );
      }
      verifiedHistoryPersonId = Number(person.id);
    }

    const patch = {
      family_role: "PARENT",
      history_person_id: verifiedHistoryPersonId,
      parent_history_person_id: null,
      updated_at: new Date().toISOString(),
    };

    const updated = await supabase
      .from("vaccination_registrations")
      .update(patch)
      .eq("id", registration.id);
    if (updated.error) throw new Error(updated.error.message);

    return {
      familyRole,
      historyPersonId: verifiedHistoryPersonId,
      parentHistoryPersonId: null,
    };
  }

  if (!requestedParentId) {
    throw new Error(
      "Untuk Child / Family, parent existing wajib dipilih pada Step 1.",
    );
  }

  const company = await resolveRegistrationHistoryCompany(
    supabase,
    session,
    body,
  );
  if (!company) {
    throw new Error(
      "History Company untuk relasi keluarga tidak ditemukan. Pilih perusahaan yang sesuai.",
    );
  }
  const companyId = Number(company.id);

  const parent = await historyPersonById(
    supabase,
    companyId,
    requestedParentId,
  );
  if (!parent) {
    throw new Error("Parent existing tidak ditemukan di History Company.");
  }
  if (String(parent.participant_type || "").toUpperCase() !== "EMPLOYEE") {
    throw new Error("Parent terpilih bukan peserta Parent / Karyawan.");
  }

  let child = requestedHistoryPersonId
    ? await historyPersonById(
        supabase,
        companyId,
        requestedHistoryPersonId,
      )
    : null;

  if (child && String(child.participant_type || "").toUpperCase() !== "DEPENDENT") {
    throw new Error(
      "Peserta existing tercatat sebagai Parent / Karyawan. Jangan bind sebagai Child / Family.",
    );
  }

  if (!child) {
    child = await findDependentForParent(
      supabase,
      companyId,
      Number(parent.id),
      body,
    );
  }

  let createdChildId = 0;

  try {
    if (!child) {
      const childName = historyText(
        body?.participantName || body?.participant_name,
      );
      if (!childName) throw new Error("Nama Child / Family wajib diisi.");

      const childNik = historyText(body?.nik);
      const inserted = await supabase
        .from("vaccination_persons")
        .insert({
          company_id: companyId,
          participant_type: "DEPENDENT",
          participant_name: childName,
          name_key: historyNameKey(childName),
          employee_id: null,
          employee_key: null,
          nik: childNik || null,
          nik_key: historyIdentityKey(childNik) || null,
          email: null,
          email_key: null,
          phone: historyText(body?.phone) || null,
          active: true,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (inserted.error) throw new Error(inserted.error.message);
      child = inserted.data;
      createdChildId = Number(child?.id || 0);
    }

    const activeLinks = await supabase
      .from("vaccination_person_relationships")
      .select("id,parent_person_id")
      .eq("company_id", companyId)
      .eq("dependent_person_id", child.id)
      .eq("active", true);
    if (activeLinks.error) throw new Error(activeLinks.error.message);

    const conflictingParents = (activeLinks.data || []).filter(
      (row: any) => Number(row.parent_person_id) !== Number(parent.id),
    );
    if (conflictingParents.length) {
      if (body?.allowFamilyReassignment === true) {
        const conflictingIds = conflictingParents
          .map((row: any) => Number(row.id || 0))
          .filter(Boolean);

        if (conflictingIds.length) {
          const deactivate = await supabase
            .from("vaccination_person_relationships")
            .update({
              active: false,
              updated_at: new Date().toISOString(),
            })
            .in("id", conflictingIds);

          if (deactivate.error) throw new Error(deactivate.error.message);
        }
      } else {
        throw new Error(
          "Child / Family ini sudah terikat ke parent lain. Review relasi sebelum melanjutkan.",
        );
      }
    }

    const relation = await supabase
      .from("vaccination_person_relationships")
      .upsert(
        {
          company_id: companyId,
          parent_person_id: parent.id,
          dependent_person_id: child.id,
          relationship_type: "FAMILY",
          active: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "company_id,parent_person_id,dependent_person_id",
          ignoreDuplicates: false,
        },
      );
    if (relation.error) throw new Error(relation.error.message);

    const patch = {
      family_role: "DEPENDENT",
      history_person_id: Number(child.id),
      parent_history_person_id: Number(parent.id),
      updated_at: new Date().toISOString(),
    };
    const updated = await supabase
      .from("vaccination_registrations")
      .update(patch)
      .eq("id", registration.id);
    if (updated.error) throw new Error(updated.error.message);

    return {
      familyRole,
      historyPersonId: Number(child.id),
      parentHistoryPersonId: Number(parent.id),
    };
  } catch (error) {
    if (createdChildId) {
      await supabase
        .from("vaccination_person_relationships")
        .delete()
        .eq("dependent_person_id", createdChildId);
      await supabase
        .from("vaccination_persons")
        .delete()
        .eq("id", createdChildId);
    }
    throw error;
  }
}

async function getNextQueueNumber(supabase: any, sessionId: number) {
  const result = await supabase
    .from("vaccination_registrations")
    .select("queue_number")
    .eq("session_id", sessionId)
    .not("queue_number", "is", null);

  if (result.error) throw new Error(result.error.message);

  let maxNumber = 0;
  for (const row of result.data || []) {
    const text = String(row.queue_number || "");
    const match = text.match(/(\d+)$/);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > maxNumber) maxNumber = n;
  }

  return formatQueueNumber(maxNumber + 1);
}

function formatBazarQueueNumber(nextNumber: number) {
  return `B-${String(nextNumber).padStart(3, "0")}`;
}

function serviceHasTrack(status: any, track: "A" | "B") {
  const value = String(status || "HEALTHDAY").trim().toUpperCase();
  if (track === "A") return value === "HEALTHDAY" || value === "COMBINATION";
  return value === "BAZAR" || value === "COMBINATION";
}

function isDoneQueueStatus(value: any) {
  return ["ADMINISTERED", "DONE", "FINISHED"].includes(String(value || "").toUpperCase());
}

function sameIdentityValue(a: any, b: any) {
  const left = clean(a).toLowerCase();
  const right = clean(b).toLowerCase();
  return Boolean(left && right && left === right);
}

function sameMovePerson(oldRegistration: any, body: any) {
  const participantId = toInt(body.participantId || body.participant_id, 0);
  if (participantId && Number(oldRegistration?.participant_id || 0) === participantId) return true;

  const strongMatches = [
    sameIdentityValue(oldRegistration?.employee_id, body.employeeId || body.employee_id),
    sameIdentityValue(oldRegistration?.nik, body.nik),
    sameIdentityValue(oldRegistration?.email, body.email),
  ].filter(Boolean).length;
  if (strongMatches > 0) return true;

  return sameIdentityValue(oldRegistration?.participant_name, body.participantName || body.participant_name)
    && sameIdentityValue(oldRegistration?.company_name, body.companyName || body.company_name);
}

async function rollbackInsertedRegistration(supabase: any, registrationId: number) {
  await supabase
    .from("vaccination_registration_items")
    .delete()
    .eq("registration_id", registrationId);
  await supabase
    .from("vaccination_registrations")
    .delete()
    .eq("id", registrationId);
}

async function getNextBazarQueue(supabase: any, sessionId: number) {
  const result = await supabase
    .from("vaccination_registrations")
    .select("bazar_queue_sequence,bazar_queue_number")
    .eq("session_id", sessionId)
    .not("bazar_queue_number", "is", null);

  if (result.error) throw new Error(result.error.message);

  let maxNumber = 0;
  for (const row of result.data || []) {
    const seq = Number(row.bazar_queue_sequence || 0);
    if (Number.isFinite(seq) && seq > maxNumber) maxNumber = seq;
    const match = String(row.bazar_queue_number || "").match(/(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > maxNumber) maxNumber = n;
    }
  }

  const sequence = maxNumber + 1;
  return { sequence, number: formatBazarQueueNumber(sequence) };
}

async function buildServiceQueueUpdate(
  supabase: any,
  registration: any,
  serviceStatus: string,
  opts: { waitingWithNote?: boolean } = {},
) {
  const update: Record<string, any> = {};
  const sessionId = Number(registration.session_id);
  const hasA = serviceHasTrack(serviceStatus, "A");
  const hasB = serviceHasTrack(serviceStatus, "B");

  if (hasA) {
    let queueNumber = clean(registration.queue_number);
    if (!queueNumber) queueNumber = await getNextQueueNumber(supabase, sessionId);
    update.queue_number = queueNumber;
    const current = String(registration.queue_status || "").toUpperCase();
    if (!isDoneQueueStatus(current)) {
      update.queue_status = opts.waitingWithNote ? "WAITING_WITH_NOTE" : (["WAITING", "WAITING_WITH_NOTE", "CALLED", "IN_PROGRESS", "SKIPPED"].includes(current) ? current : "WAITING");
    }
  } else if (clean(registration.queue_number) && !isDoneQueueStatus(registration.queue_status)) {
    update.queue_status = "CANCELLED";
  }

  if (hasB) {
    let bazarNumber = clean(registration.bazar_queue_number);
    let bazarSequence = Number(registration.bazar_queue_sequence || 0) || null;
    if (!bazarNumber) {
      const next = await getNextBazarQueue(supabase, sessionId);
      bazarNumber = next.number;
      bazarSequence = next.sequence;
    }
    update.bazar_queue_number = bazarNumber;
    update.bazar_queue_sequence = bazarSequence;
    const current = String(registration.bazar_queue_status || "").toUpperCase();
    if (!isDoneQueueStatus(current)) {
      update.bazar_queue_status = opts.waitingWithNote ? "WAITING_WITH_NOTE" : (["WAITING", "WAITING_WITH_NOTE", "CALLED", "IN_PROGRESS", "SKIPPED"].includes(current) ? current : "WAITING");
    }
  } else if (clean(registration.bazar_queue_number) && !isDoneQueueStatus(registration.bazar_queue_status)) {
    update.bazar_queue_status = "CANCELLED";
  }

  return update;
}

function normalizeItems(rawItems: any[], fallback: Record<string, any> = {}, allowBazar = false) {
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((item: any) => ({
      id: toInt(item.id || item.itemId || item.item_id, 0) || null,
      vaccine_id: toInt(item.vaccineId || item.vaccine_id, 0),
      lot_id: toInt(item.lotId || item.lot_id, 0) || null,
      dose_number: Math.max(1, toInt(item.doseNumber || item.dose_number, 1)),
      price_category: clean(item.priceCategory || item.price_category) || clean(fallback.priceCategory) || null,
      price: item.price === "" || item.price == null ? (fallback.price ?? null) : Number(item.price),
      payment_method: clean(item.paymentMethod || item.payment_method) || clean(fallback.paymentMethod) || null,
      payment_note: clean(item.paymentNote || item.payment_note) || clean(fallback.paymentNote) || null,
      item_note: clean(item.itemNote || item.item_note) || null,
      service_mode: normalizeServiceMode(item.serviceMode || item.service_mode || fallback.serviceMode, allowBazar),
      sales_option_id: toInt(item.salesOptionId || item.sales_option_id, 0) || null,
      sale_mode: normalizeSaleMode(item.saleMode || item.sale_mode),
      package_dose_count: Math.max(1, toInt(item.packageDoseCount || item.package_dose_count, 1)),
      sales_price_snapshot:
        item.salesPriceSnapshot === "" || item.sales_price_snapshot === ""
          ? null
          : item.salesPriceSnapshot ?? item.sales_price_snapshot ?? null,
    }))
    .filter((item: any) => item.vaccine_id);
}

async function attachRegistrationItems(supabase: any, registrations: any[]) {
  const regIds = (registrations || []).map((row: any) => Number(row.id)).filter(Boolean);
  if (!regIds.length) return registrations || [];

  const itemsResult = await supabase
    .from("vaccination_registration_items")
    .select("*, vaccine:vaccination_vaccines(id,name,brand,price,price_category), lot:vaccination_vaccine_lots(id,lot_number,expiry_date,stock_initial,stock_added,stock_used)")
    .in("registration_id", regIds)
    .eq("active", true)
    .order("id", { ascending: true });

  if (itemsResult.error) throw new Error(itemsResult.error.message);

  const byReg = new Map<number, any[]>();
  for (const item of itemsResult.data || []) {
    const key = Number(item.registration_id);
    if (!byReg.has(key)) byReg.set(key, []);
    byReg.get(key)!.push(item);
  }

  return (registrations || []).map((registration: any) => ({
    ...registration,
    items: byReg.get(Number(registration.id)) || [],
  }));
}

async function createItemsForRegistration(supabase: any, registration: any, items: any[], user: any, source = "registration", allowBazar = false) {
  if (!items.length) return [];

  const vaccineIds: number[] = Array.from(
    new Set<number>(items.map((item: any) => Number(item.vaccine_id || 0)).filter((id: number) => id > 0)),
  );
  const [vaccinesResult, offersResult] = await Promise.all([
    supabase.from("vaccination_vaccines").select("id,price,price_category").in("id", vaccineIds),
    supabase
      .from("vaccination_vaccine_sales_options")
      .select("id,vaccine_id,sale_mode,package_dose_count,price,label,active")
      .in("vaccine_id", vaccineIds)
      .eq("active", true),
  ]);

  if (vaccinesResult.error) throw new Error(vaccinesResult.error.message);
  if (offersResult.error) throw new Error(offersResult.error.message);
  const vaccineMap = new Map<number, any>((vaccinesResult.data || []).map((v: any) => [Number(v.id), v]));
  const offerMap = new Map<string, any>();
  for (const offer of offersResult.data || []) {
    offerMap.set(`${Number(offer.vaccine_id)}:${normalizeSaleMode(offer.sale_mode)}`, offer);
  }

  const rows = items.map((item: any) => {
    const vaccine = vaccineMap.get(Number(item.vaccine_id)) || {};
    const serviceMode = normalizeServiceMode(item.service_mode, allowBazar);
    const isFreeHealthday = allowBazar && serviceMode === "HEALTHDAY";
    const saleMode = serviceMode === "BAZAR" ? normalizeSaleMode(item.sale_mode) : "NON_PACKAGE";
    const offer = serviceMode === "BAZAR"
      ? offerMap.get(`${Number(item.vaccine_id)}:${saleMode}`)
      : null;
    const fallbackMasterPrice = vaccine.price == null ? null : moneyNumber(vaccine.price);
    const selectedPrice = offer?.price == null
      ? (saleMode === "NON_PACKAGE" ? fallbackMasterPrice : null)
      : moneyNumber(offer.price);
    const basePrice = isFreeHealthday
      ? 0
      : serviceMode === "BAZAR"
        ? selectedPrice
        : (item.price == null ? fallbackMasterPrice : moneyNumber(item.price));
    const paymentMethod = isFreeHealthday
      ? null
      : serviceMode === "BAZAR"
        ? normalizeBazarPaymentMethod(item.payment_method)
        : (item.payment_method || null);

    if (serviceMode === "BAZAR" && (basePrice == null || Number(basePrice) <= 0)) {
      throw new Error(saleMode === "PACKAGE" ? "Harga Paket Bazar belum tersedia di master produk." : "Harga Non Paket Bazar belum tersedia di master produk.");
    }
    if (serviceMode === "BAZAR" && !paymentMethod) {
      throw new Error("Metode pembayaran Bazar wajib QRIS, Debit, Credit Card, atau Transfer.");
    }

    const surchargePercent = serviceMode === "BAZAR" && paymentMethod === "CREDIT_CARD" ? 3 : 0;
    const surchargeAmount = basePrice == null ? 0 : moneyNumber(basePrice * surchargePercent / 100);
    const paymentTotal = basePrice == null ? null : moneyNumber(basePrice + surchargeAmount);

    return {
      registration_id: registration.id,
      session_id: registration.session_id,
      vaccine_id: item.vaccine_id,
      lot_id: item.lot_id || null,
      dose_number: item.dose_number || 1,
      price_category: item.price_category || vaccine.price_category || null,
      price: basePrice,
      payment_method: paymentMethod || null,
      payment_note: isFreeHealthday ? null : (item.payment_note || null),
      item_note: item.item_note || null,
      service_mode: serviceMode,
      sales_option_id: serviceMode === "BAZAR" ? (Number(offer?.id || item.sales_option_id || 0) || null) : null,
      sale_mode: serviceMode === "BAZAR" ? saleMode : "NON_PACKAGE",
      package_dose_count: serviceMode === "BAZAR" ? Math.max(1, Number(offer?.package_dose_count || item.package_dose_count || 1)) : 1,
      sales_price_snapshot: serviceMode === "BAZAR" ? basePrice : null,
      payment_surcharge_percent: surchargePercent,
      payment_surcharge_amount: surchargeAmount,
      payment_total: paymentTotal,
      item_source: source,
      status: source === "registration_edit" ? "WAITING" : (String(registration.queue_status || "").toUpperCase() === "ADMINISTERED" ? "ADMINISTERED" : "WAITING"),
      active: true,
      created_by: userLabel(user),
    };
  });

  const result = await supabase
    .from("vaccination_registration_items")
    .insert(rows)
    .select("*, vaccine:vaccination_vaccines(id,name,brand,price,price_category), lot:vaccination_vaccine_lots(id,lot_number,expiry_date)");

  if (result.error) throw new Error(result.error.message);
  return result.data || [];
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "register")) return fail("Akses modul vaksinasi ditolak untuk role ini.", 403);

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  const sourceId = toInt(req.nextUrl.searchParams.get("source_id"), 0);
  const supabase = supabaseAdmin();

  let query = supabase
    .from("vaccination_registrations")
    .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date,public_queue_token,source_id,source_name,default_vaccine_id,default_lot_id), vaccine:vaccination_vaccines(id,name,brand,price,price_category)")
    .order("id", { ascending: false })
    .limit(1000);

  if (sessionId) query = query.eq("session_id", sessionId);
  if (sourceId) query = query.eq("source_id", sourceId);

  const result = await query;
  if (result.error) return fail(result.error.message, 500);

  try {
    const actor = (user as any)?.email || (user as any)?.name || (user as any)?.id || "register-sync";
    let registrations = await attachRegistrationItems(supabase, result.data || []);
    let syncedLegacyDone = false;
    const syncWarnings: string[] = [];

    for (const registration of registrations) {
      const queueStatus = String(registration?.queue_status || "").toUpperCase();
      const bazarStatus = String(registration?.bazar_queue_status || "").toUpperCase();
      const activeItems = Array.isArray(registration?.items) ? registration.items : [];
      const healthdayNeedsSync = activeItems.some((item: any) =>
        String(item?.service_mode || "HEALTHDAY").toUpperCase() !== "BAZAR" &&
        !["ADMINISTERED", "DONE", "FINISHED"].includes(String(item?.status || "").toUpperCase())
      );
      const bazarNeedsSync = activeItems.some((item: any) =>
        String(item?.service_mode || "").toUpperCase() === "BAZAR" &&
        !["ADMINISTERED", "DONE", "FINISHED"].includes(String(item?.status || "").toUpperCase())
      );

      try {
        if (healthdayNeedsSync && ["ADMINISTERED", "DONE", "FINISHED"].includes(queueStatus)) {
          await syncRegistrationTrackDone(supabase, Number(registration.id), "HEALTHDAY", actor);
          syncedLegacyDone = true;
        }
        if (bazarNeedsSync && ["ADMINISTERED", "DONE", "FINISHED"].includes(bazarStatus)) {
          await syncRegistrationTrackDone(supabase, Number(registration.id), "BAZAR", actor);
          syncedLegacyDone = true;
        }
      } catch (syncError: any) {
        syncWarnings.push(`Registrasi ${registration.id}: ${syncError?.message || "sinkronisasi Done gagal"}`);
      }
    }

    if (syncedLegacyDone) registrations = await attachRegistrationItems(supabase, result.data || []);
    return ok({ registrations, syncWarnings });
  } catch (error: any) {
    return fail(error?.message || "Gagal mengambil item vaksin registrasi.", 500);
  }
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "register")) return fail("Akses modul vaksinasi ditolak untuk role ini.", 403);

  const body = await req.json().catch(() => ({}));
  const action = clean(body.action);
  const supabase = supabaseAdmin();

  if (action === "release-queue") {
    const registrationId = toInt(body.registrationId || body.registration_id, 0);
    if (!registrationId) return fail("Peserta registrasi wajib dipilih.");

    const regResult = await supabase
      .from("vaccination_registrations")
      .select("*")
      .eq("id", registrationId)
      .single();

    if (regResult.error) return fail(regResult.error.message, 500);
    const reg = regResult.data;

    const sessionResult = await supabase
      .from("vaccination_sessions")
      .select("id,existing_queue_profile")
      .eq("id", reg.session_id)
      .single();
    if (sessionResult.error) return fail(sessionResult.error.message, 500);

    const allowBazar = isHealthdayBazarSession(sessionResult.data);
    if (!allowBazar) {
      if (clean(reg.queue_number)) {
        return ok({ message: `Nomor antrian sudah dirilis: ${reg.queue_number}`, registration: reg });
      }
      const queueNumber = await getNextQueueNumber(supabase, Number(reg.session_id));
      const updateResult = await supabase
        .from("vaccination_registrations")
        .update({ queue_number: queueNumber, queue_status: "WAITING", updated_at: new Date().toISOString() })
        .eq("id", registrationId)
        .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date,public_queue_token,source_id,source_name,default_vaccine_id,default_lot_id), vaccine:vaccination_vaccines(id,name,brand,price,price_category)")
        .single();
      if (updateResult.error) return fail(updateResult.error.message, 500);
      return ok({ message: `Nomor antrian berhasil dirilis: ${queueNumber}`, registration: updateResult.data });
    }

    const serviceStatus = String(reg.patient_service_status || "HEALTHDAY").toUpperCase();
    let queueUpdate: Record<string, any> = {};
    try {
      queueUpdate = await buildServiceQueueUpdate(supabase, reg, serviceStatus);
    } catch (error: any) {
      return fail(error?.message || "Gagal membuat nomor antrian A/B.", 500);
    }

    const updateResult = await supabase
      .from("vaccination_registrations")
      .update({ ...queueUpdate, updated_at: new Date().toISOString() })
      .eq("id", registrationId)
      .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date,public_queue_token,source_id,source_name,default_vaccine_id,default_lot_id), vaccine:vaccination_vaccines(id,name,brand,price,price_category)")
      .single();
    if (updateResult.error) return fail(updateResult.error.message, 500);

    const parts = [
      serviceHasTrack(serviceStatus, "A") ? updateResult.data.queue_number : null,
      serviceHasTrack(serviceStatus, "B") ? updateResult.data.bazar_queue_number : null,
    ].filter(Boolean);
    return ok({ message: `Nomor antrian berhasil dirilis: ${parts.join(" + ")}`, registration: updateResult.data });
  }

  if (action === "family-context") {
    const registrationId = toInt(
      body.registrationId || body.registration_id,
      0,
    );
    if (!registrationId) return fail("Peserta registrasi wajib dipilih.");

    const regResult = await supabase
      .from("vaccination_registrations")
      .select("*")
      .eq("id", registrationId)
      .single();
    if (regResult.error) return fail(regResult.error.message, 500);

    const registration = regResult.data;
    const company = await resolveRegistrationHistoryCompany(
      supabase,
      {
        company_name: registration.company_name,
        session_name: "",
        source_name: "",
      },
      registration,
    );

    let person: any = null;
    let parent: any = null;

    if (company && Number(registration.history_person_id || 0)) {
      person = await historyPersonById(
        supabase,
        Number(company.id),
        Number(registration.history_person_id),
      );
    }

    if (company && Number(registration.parent_history_person_id || 0)) {
      parent = await historyPersonById(
        supabase,
        Number(company.id),
        Number(registration.parent_history_person_id),
      );
    }

    return ok({
      familyRole:
        normalizeFamilyRole(registration.family_role || "") ||
        "",
      person: person
        ? {
            id: Number(person.id),
            name: person.participant_name || "",
            employeeId: person.employee_id || "",
            nik: person.nik || "",
            email: person.email || "",
          }
        : null,
      parent: parent
        ? {
            id: Number(parent.id),
            name: parent.participant_name || "",
            employeeId: parent.employee_id || "",
            nik: parent.nik || "",
            email: parent.email || "",
          }
        : null,
    });
  }

  if (action === "family-search") {
    const registrationId = toInt(
      body.registrationId || body.registration_id,
      0,
    );
    const q = clean(body.q || body.query);
    if (!registrationId) return fail("Peserta registrasi wajib dipilih.");
    if (q.length < 2) return ok({ results: [] });

    const regResult = await supabase
      .from("vaccination_registrations")
      .select("*")
      .eq("id", registrationId)
      .single();
    if (regResult.error) return fail(regResult.error.message, 500);

    const registration = regResult.data;

    const sessionResult = await supabase
      .from("vaccination_sessions")
      .select("*")
      .eq("id", registration.session_id)
      .single();
    if (sessionResult.error) return fail(sessionResult.error.message, 500);

    const company = await resolveRegistrationHistoryCompany(
      supabase,
      sessionResult.data || {},
      registration,
    );
    if (!company) {
      return fail(
        "History Company untuk peserta ini belum dapat ditentukan.",
        404,
      );
    }

    const like = `%${q.replace(/[(),]/g, " ").replace(/\s+/g, " ").slice(0, 100)}%`;
    const result = await supabase
      .from("vaccination_persons")
      .select("id,participant_name,employee_id,nik,email,phone,participant_type")
      .eq("company_id", Number(company.id))
      .eq("active", true)
      .eq("participant_type", "EMPLOYEE")
      .or(
        [
          `participant_name.ilike.${like}`,
          `employee_id.ilike.${like}`,
          `nik.ilike.${like}`,
          `email.ilike.${like}`,
        ].join(","),
      )
      .order("participant_name", { ascending: true })
      .limit(30);

    if (result.error) return fail(result.error.message, 500);

    return ok({
      company: {
        id: Number(company.id),
        name: company.company_name,
      },
      results: (result.data || []).map((row: any) => ({
        id: Number(row.id),
        name: row.participant_name || "",
        employeeId: row.employee_id || "",
        nik: row.nik || "",
        email: row.email || "",
        phone: row.phone || "",
      })),
    });
  }

  if (action === "update-family") {
    const registrationId = toInt(
      body.registrationId || body.registration_id,
      0,
    );
    if (!registrationId) return fail("Peserta registrasi wajib dipilih.");

    const regResult = await supabase
      .from("vaccination_registrations")
      .select("*")
      .eq("id", registrationId)
      .single();
    if (regResult.error) return fail(regResult.error.message, 500);

    const registration = regResult.data;

    const sessionResult = await supabase
      .from("vaccination_sessions")
      .select("*")
      .eq("id", registration.session_id)
      .single();
    if (sessionResult.error) return fail(sessionResult.error.message, 500);

    const familyRole = normalizeFamilyRole(
      body.familyRole || body.family_role,
    );

    if (familyRole === "DEPENDENT") {
      const parentId = toInt(
        body.parentHistoryPersonId ||
          body.parent_history_person_id,
        0,
      );
      if (!parentId) {
        return fail(
          "Untuk Child / Family, Parent existing wajib dipilih.",
        );
      }
    }

    try {
      const binding = await syncRegistrationFamily(
        supabase,
        registration,
        sessionResult.data || {},
        {
          ...registration,
          ...body,
          participantName: registration.participant_name,
          employeeId: registration.employee_id,
          nik: registration.nik,
          email: registration.email,
          phone: registration.phone,
          companyName: registration.company_name,
          allowFamilyReassignment: true,
        },
      );

      const updatedResult = await supabase
        .from("vaccination_registrations")
        .select("*")
        .eq("id", registrationId)
        .single();

      if (updatedResult.error) {
        return fail(updatedResult.error.message, 500);
      }

      let parent: any = null;
      if (binding.parentHistoryPersonId) {
        const company = await resolveRegistrationHistoryCompany(
          supabase,
          sessionResult.data || {},
          registration,
        );
        if (company) {
          const parentRow = await historyPersonById(
            supabase,
            Number(company.id),
            Number(binding.parentHistoryPersonId),
          );
          if (parentRow) {
            parent = {
              id: Number(parentRow.id),
              name: parentRow.participant_name || "",
              employeeId: parentRow.employee_id || "",
              nik: parentRow.nik || "",
              email: parentRow.email || "",
            };
          }
        }
      }

      return ok({
        message:
          familyRole === "DEPENDENT"
            ? "Relasi Child / Family berhasil disimpan."
            : "Relasi Parent berhasil disimpan.",
        registration: updatedResult.data,
        parent,
      });
    } catch (error: any) {
      return fail(
        error?.message ||
          "Gagal menyimpan relasi Parent / Child-Family.",
        400,
      );
    }
  }

  if (action === "update-products") {
    const registrationId = toInt(body.registrationId || body.registration_id, 0);
    if (!registrationId) return fail("Peserta registrasi wajib dipilih.");

    const regResult = await supabase
      .from("vaccination_registrations")
      .select("*")
      .eq("id", registrationId)
      .single();

    if (regResult.error) return fail(regResult.error.message, 500);
    const registration = regResult.data;

    const sessionResult = await supabase
      .from("vaccination_sessions")
      .select("id,existing_queue_profile")
      .eq("id", registration.session_id)
      .single();
    if (sessionResult.error) return fail(sessionResult.error.message, 500);
    const allowBazar = isHealthdayBazarSession(sessionResult.data);

    const items = normalizeItems(body.items || [], {
      paymentMethod: body.paymentMethod,
      paymentNote: body.paymentNote,
    }, allowBazar);

    const oldItems = await supabase
      .from("vaccination_registration_items")
      .select("*, vaccine:vaccination_vaccines(id,name,brand,price,price_category), lot:vaccination_vaccine_lots(id,lot_number,expiry_date)")
      .eq("registration_id", registrationId)
      .eq("active", true);

    if (oldItems.error) return fail(oldItems.error.message, 500);

    const oldRows = oldItems.data || [];
    const administeredRows = oldRows.filter((item: any) => ["ADMINISTERED", "DONE"].includes(String(item.status || "").toUpperCase()));
    const administeredIds = new Set(administeredRows.map((item: any) => Number(item.id)).filter(Boolean));

    // Produk yang sudah Done tidak boleh diubah/hapus. Produk tersebut dipertahankan.
    // Baris yang belum Done akan diganti sesuai input terbaru dari registrasi.
    const editableItems = items.filter((item: any) => !item.id || !administeredIds.has(Number(item.id)));
    const preservedAdministered = administeredRows;

    if (!editableItems.length && !preservedAdministered.length) return fail("Minimal satu produk/vaksin wajib dipilih.");

    try {
      const bazarValidation = await validateBazarItems(supabase, editableItems, allowBazar);
      if (bazarValidation) return fail(bazarValidation);
    } catch (error: any) {
      return fail(error?.message || "Gagal memvalidasi harga Bazar.", 500);
    }

    const deleteResult = await supabase
      .from("vaccination_registration_items")
      .delete()
      .eq("registration_id", registrationId)
      .eq("active", true)
      .not("status", "in", '("ADMINISTERED","DONE")');

    if (deleteResult.error) return fail(deleteResult.error.message, 500);

    let insertedItems: any[] = [];
    if (editableItems.length) {
      try {
        insertedItems = await createItemsForRegistration(supabase, registration, editableItems, user, "registration_edit", allowBazar);
      } catch (error: any) {
        return fail(error?.message || "Gagal menyimpan produk peserta.", 500);
      }
    }

    const currentStatus = String(registration.queue_status || "").toUpperCase();
    const hasQueue = Boolean(clean(registration.queue_number));
    const newStatus = editableItems.length && hasQueue ? "WAITING_WITH_NOTE" : (registration.queue_status || "REGISTERED");
    const note = clean(body.changeNote || body.statusNote || body.note) || (editableItems.length ? "Produk/tindakan diubah dari registrasi." : clean(registration.status_note));
    const firstEditable: any = editableItems[0] || {};
    const firstPreserved: any = preservedAdministered[0] || {};
    const firstItem: any = firstEditable.vaccine_id ? firstEditable : firstPreserved;

    const combinedItems = [...preservedAdministered, ...insertedItems];
    const serviceStatus = patientServiceStatus(combinedItems);
    const bazarBilling = bazarBillingSummary(combinedItems);
    let serviceQueueUpdate: Record<string, any> = { queue_status: newStatus };
    if (allowBazar) {
      try {
        serviceQueueUpdate = await buildServiceQueueUpdate(supabase, registration, serviceStatus, { waitingWithNote: editableItems.length > 0 });
      } catch (error: any) {
        return fail(error?.message || "Gagal menyesuaikan antrian A/B setelah edit produk.", 500);
      }
    }

    const updateResult = await supabase
      .from("vaccination_registrations")
      .update({
        vaccine_id: firstItem.vaccine_id || registration.vaccine_id || null,
        payment_price: allowBazar && bazarBilling.hasBazar ? bazarBilling.total : (firstEditable.price ?? registration.payment_price ?? null),
        payment_method: allowBazar && bazarBilling.hasBazar ? bazarBilling.paymentMethod : (firstEditable.payment_method || registration.payment_method || null),
        payment_note: firstEditable.payment_note || registration.payment_note || null,
        ...(allowBazar ? { patient_service_status: serviceStatus } : {}),
        ...serviceQueueUpdate,
        status_note: note || null,
        last_product_change_at: editableItems.length ? new Date().toISOString() : registration.last_product_change_at,
        last_product_change_by: editableItems.length ? userLabel(user) : registration.last_product_change_by,
        updated_at: new Date().toISOString(),
      })
      .eq("id", registrationId)
      .select("*, vaccine:vaccination_vaccines(id,name,brand,price,price_category)")
      .single();

    if (updateResult.error) return fail(updateResult.error.message, 500);

    return ok({
      message: newStatus === "WAITING_WITH_NOTE" ? "Produk berhasil diubah. Status kembali ke Waiting With Note untuk dipanggil ulang." : "Produk berhasil diubah.",
      registration: { ...updateResult.data, items: combinedItems },
      items: combinedItems,
    });
  }

  const sessionId = toInt(body.sessionId || body.session_id, 0);
  const participantName = clean(body.participantName || body.participant_name);

  if (!sessionId) return fail("Session wajib dipilih.");
  if (!participantName) return fail("Nama peserta wajib diisi.");

  const sessionResult = await supabase.from("vaccination_sessions").select("*").eq("id", sessionId).single();
  if (sessionResult.error) return fail(sessionResult.error.message, 500);
  const session = sessionResult.data || {};
  const allowBazar = isHealthdayBazarSession(session);
  const requestedServiceMode = normalizeServiceMode(body.serviceMode || body.service_mode, allowBazar);

  const moveFromRegistrationId = toInt(body.moveFromRegistrationId || body.move_from_registration_id, 0);
  let moveSourceRegistration: any = null;
  if (moveFromRegistrationId) {
    const moveResult = await supabase
      .from("vaccination_registrations")
      .select("*")
      .eq("id", moveFromRegistrationId)
      .single();
    if (moveResult.error) return fail(moveResult.error.message, 404);
    moveSourceRegistration = moveResult.data;

    if (Number(moveSourceRegistration.session_id) === sessionId) {
      return fail("Peserta sudah terdaftar di lokasi / session ini.");
    }
    if (!sameMovePerson(moveSourceRegistration, body)) {
      return fail("Identitas peserta tidak cocok dengan pendaftaran lokasi sebelumnya.");
    }

    const hasA = serviceHasTrack(moveSourceRegistration.patient_service_status, "A");
    const hasB = serviceHasTrack(moveSourceRegistration.patient_service_status, "B");
    const aFinal = !hasA || ["ADMINISTERED", "DONE", "FINISHED", "CANCELLED"].includes(String(moveSourceRegistration.queue_status || "").toUpperCase());
    const bFinal = !hasB || ["ADMINISTERED", "DONE", "FINISHED", "CANCELLED"].includes(String(moveSourceRegistration.bazar_queue_status || "").toUpperCase());
    if (aFinal && bFinal) {
      return fail("Pendaftaran lokasi sebelumnya sudah selesai / dibatalkan dan tidak dapat dipindahkan.");
    }

    const recordCheck = await supabase
      .from("vaccination_records")
      .select("id")
      .eq("registration_id", moveFromRegistrationId)
      .limit(1);
    if (recordCheck.error) return fail(recordCheck.error.message, 500);
    if ((recordCheck.data || []).length) {
      return fail("Peserta sudah memiliki record tindakan/vaksinasi di lokasi sebelumnya dan tidak dapat dipindahkan.");
    }
  }

  const vaccineIdInput = toInt(body.vaccineId, 0);
  const vaccineId = vaccineIdInput || toInt(session.default_vaccine_id, 0) || null;
  const lotId = toInt(body.lotId, 0) || toInt(session.default_lot_id, 0) || null;

  const items = normalizeItems(body.items || [], { paymentMethod: body.paymentMethod, paymentNote: body.paymentNote, serviceMode: requestedServiceMode }, allowBazar);
  if (!items.length && vaccineId) {
    items.push({
      id: null,
      vaccine_id: vaccineId,
      lot_id: lotId,
      dose_number: 1,
      price_category: clean(body.priceCategory) || null,
      price: body.paymentPrice === "" || body.paymentPrice == null ? null : Number(body.paymentPrice),
      payment_method: clean(body.paymentMethod) || null,
      payment_note: clean(body.paymentNote) || null,
      item_note: null,
      service_mode: requestedServiceMode,
      sales_option_id: null,
      sale_mode: "NON_PACKAGE",
      package_dose_count: 1,
      sales_price_snapshot: null,
    });
  }

  const initialServiceStatus = allowBazar ? patientServiceStatus(items.length ? items : [{ service_mode: requestedServiceMode }]) : "HEALTHDAY";
  let queueNumber: string | null = null;
  let bazarQueueNumber: string | null = null;
  let bazarQueueSequence: number | null = null;

  if (!allowBazar || serviceHasTrack(initialServiceStatus, "A")) {
    queueNumber = clean(body.queueNumber) || await getNextQueueNumber(supabase, sessionId);
  }
  if (allowBazar && serviceHasTrack(initialServiceStatus, "B")) {
    const nextBazar = await getNextBazarQueue(supabase, sessionId);
    bazarQueueNumber = nextBazar.number;
    bazarQueueSequence = nextBazar.sequence;
  }

  try {
    const bazarValidation = await validateBazarItems(supabase, items, allowBazar);
    if (bazarValidation) return fail(bazarValidation);
  } catch (error: any) {
    return fail(error?.message || "Gagal memvalidasi harga Bazar.", 500);
  }

  const familyRole = normalizeFamilyRole(body.familyRole || body.family_role);
  const requestedHistoryPersonId =
    toInt(body.historyPersonId || body.history_person_id, 0) || null;
  const requestedParentHistoryPersonId =
    toInt(body.parentHistoryPersonId || body.parent_history_person_id, 0) || null;

  if (familyRole === "DEPENDENT" && !requestedParentHistoryPersonId) {
    return fail("Untuk Child / Family, parent existing wajib dipilih pada Step 1.");
  }

  const payload: Record<string, any> = {
    session_id: sessionId,
    source_id: toInt(body.sourceId, 0) || toInt(session.source_id, 0) || null,
    participant_id: toInt(body.participantId, 0) || null,
    history_person_id: requestedHistoryPersonId,
    family_role: familyRole,
    parent_history_person_id:
      familyRole === "DEPENDENT" ? requestedParentHistoryPersonId : null,
    vaccine_id: vaccineId || null,
    participant_name: participantName,
    employee_id: clean(body.employeeId) || null,
    nik: clean(body.nik) || null,
    mcu_id: clean(body.mcuId) || null,
    email: clean(body.email) || null,
    phone: clean(body.phone) || null,
    company_name: clean(body.companyName) || clean(session.company_name) || null,
    department: clean(body.department) || null,
    payment_price: body.paymentPrice === "" || body.paymentPrice == null ? null : Number(body.paymentPrice),
    payment_method: clean(body.paymentMethod) || null,
    payment_note: clean(body.paymentNote) || null,
    queue_number: queueNumber,
    queue_status: queueNumber ? "WAITING" : "REGISTERED",
    ...(allowBazar ? {
      bazar_queue_number: bazarQueueNumber,
      bazar_queue_sequence: bazarQueueSequence,
      bazar_queue_status: bazarQueueNumber ? "WAITING" : null,
    } : {}),
    registered_by: userLabel(user),
    ...(allowBazar ? { patient_service_status: initialServiceStatus } : {}),
  };

  const result = await supabase
    .from("vaccination_registrations")
    .insert(payload)
    .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date,public_queue_token,source_id,source_name,default_vaccine_id,default_lot_id), vaccine:vaccination_vaccines(id,name,brand,price,price_category)")
    .single();

  if (result.error) return fail(result.error.message, 500);

  let insertedItems: any[] = [];

  if (items.length) {
    try {
      insertedItems = await createItemsForRegistration(supabase, result.data, items, user, "walk_in", allowBazar);
    } catch (error: any) {
      if (moveSourceRegistration) {
        await rollbackInsertedRegistration(supabase, Number(result.data.id));
        return fail(error?.message || "Pindah lokasi dibatalkan karena item vaksin gagal dibuat.", 500);
      }
      return fail(error?.message || "Registrasi berhasil, tapi gagal membuat item vaksin.", 500);
    }
  }

  if (allowBazar && insertedItems.length) {
    const serviceStatus = patientServiceStatus(insertedItems);
    const bazarBilling = bazarBillingSummary(insertedItems);
    const canonicalUpdate: Record<string, any> = {
      patient_service_status: serviceStatus,
      updated_at: new Date().toISOString(),
    };
    if (bazarBilling.hasBazar) {
      canonicalUpdate.payment_price = bazarBilling.total;
      canonicalUpdate.payment_method = bazarBilling.paymentMethod;
    }
    const serviceUpdate = await supabase
      .from("vaccination_registrations")
      .update(canonicalUpdate)
      .eq("id", result.data.id);
    if (serviceUpdate.error) {
      if (moveSourceRegistration) {
        await rollbackInsertedRegistration(supabase, Number(result.data.id));
        return fail(`Pindah lokasi dibatalkan: ${serviceUpdate.error.message}`, 500);
      }
      return fail(serviceUpdate.error.message, 500);
    }
    Object.assign(result.data, canonicalUpdate);
  }

  try {
    const familyBinding = await syncRegistrationFamily(
      supabase,
      result.data,
      session,
      body,
    );
    Object.assign(result.data, {
      family_role: familyBinding.familyRole,
      history_person_id: familyBinding.historyPersonId,
      parent_history_person_id: familyBinding.parentHistoryPersonId,
    });
  } catch (error: any) {
    await rollbackInsertedRegistration(supabase, Number(result.data.id));
    return fail(
      `Registrasi dibatalkan karena relasi Parent / Child-Family gagal: ${
        error?.message || error || "Unknown error"
      }`,
      400,
    );
  }

  let movedFrom: any = null;
  if (moveSourceRegistration) {
    const now = new Date().toISOString();
    const sourceHasB = serviceHasTrack(moveSourceRegistration.patient_service_status, "B");
    const sourceLocation = clean(moveSourceRegistration.company_name) || `registration #${moveSourceRegistration.id}`;
    const targetLabel = clean(session.location || session.session_name) || `session #${sessionId}`;
    const moveUpdate: Record<string, any> = {
      queue_status: "CANCELLED",
      status_note: `Pindah lokasi ke ${targetLabel} · registrasi baru #${result.data.id}`,
      updated_at: now,
    };
    if (sourceHasB || clean(moveSourceRegistration.bazar_queue_number)) {
      moveUpdate.bazar_queue_status = "CANCELLED";
      moveUpdate.bazar_cancelled_at = now;
    }

    const moveUpdateResult = await supabase
      .from("vaccination_registrations")
      .update(moveUpdate)
      .eq("id", moveSourceRegistration.id)
      .select("id,session_id,queue_number,bazar_queue_number")
      .single();

    if (moveUpdateResult.error) {
      await rollbackInsertedRegistration(supabase, Number(result.data.id));
      return fail(`Pindah lokasi dibatalkan karena pendaftaran lama gagal ditutup: ${moveUpdateResult.error.message}`, 500);
    }

    movedFrom = {
      registrationId: Number(moveSourceRegistration.id),
      sessionId: Number(moveSourceRegistration.session_id),
      label: sourceLocation,
    };
  }

  const queueLabels = [queueNumber, bazarQueueNumber].filter(Boolean);
  return ok({
    message: moveSourceRegistration
      ? `Pindah lokasi berhasil. Nomor antrian baru: ${queueLabels.join(" + ") || "belum dirilis"}`
      : `Registrasi ulang berhasil. Nomor antrian: ${queueLabels.join(" + ") || "belum dirilis"}`,
    registration: { ...result.data, items: insertedItems },
    movedFrom,
  });
}

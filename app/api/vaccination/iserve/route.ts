import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";

// V502_ISERVE_EXACT_COMBINATION_BATCH_EXPORT
export const dynamic = "force-dynamic";

const ISERVE_HEADERS = [
  "name",
  "street",
  "nik",
  "passport_number",
  "patient_mobile",
  "vaccination/product",
  "vaccination lot",
  "vaccination dose",
  "vaccination quantity",
];

function firstValue(...values: any[]) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return "";
}

function normalizeIservePhone(value: any) {
  let digits = clean(value).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0062")) digits = digits.slice(4);
  else if (digits.startsWith("62")) digits = digits.slice(2);
  digits = digits.replace(/^0+/, "");
  return digits;
}

function safeFilePart(value: any) {
  const text = clean(value)
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (text || "BATCH").slice(0, 90).replace(/\s+/g, "_");
}

function itemBenefit(item: any) {
  const vaccineId = Number(item?.vaccine_id || item?.vaccine?.id || 0);
  const name = firstValue(item?.vaccine?.name, item?.vaccine_name);
  if (!vaccineId && !name) return null;
  return {
    key: vaccineId ? `v:${vaccineId}` : `n:${name.toLowerCase().replace(/\s+/g, " ")}`,
    vaccine_id: vaccineId || null,
    label: name || `Vaksin ${vaccineId}`,
  };
}

function buildCombination(items: any[]) {
  const byKey = new Map<string, any>();
  for (const item of items) {
    if (item?.active === false) continue;
    if (["CANCELLED", "VOID"].includes(clean(item?.status).toUpperCase())) continue;
    const benefit = itemBenefit(item);
    if (!benefit) continue;
    if (!byKey.has(benefit.key)) byKey.set(benefit.key, benefit);
  }

  const benefits = Array.from(byKey.values()).sort((a: any, b: any) =>
    a.label.localeCompare(b.label, "id"),
  );
  const key = benefits.map((row: any) => row.key).sort().join("||");
  return {
    key,
    label: benefits.map((row: any) => row.label).join(" + "),
    benefits,
  };
}

async function loadSessionBatchData(supabase: any, sessionId: number) {
  const sessionResult = await supabase
    .from("vaccination_sessions")
    .select("id,session_name,company_name,location,session_date,status")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionResult.error) throw new Error(sessionResult.error.message);
  if (!sessionResult.data) throw new Error("Session / Lokasi tidak ditemukan.");

  const registrationsResult = await supabase
    .from("vaccination_registrations")
    .select("*")
    .eq("session_id", sessionId)
    .order("id", { ascending: true })
    .limit(20000);

  if (registrationsResult.error) throw new Error(registrationsResult.error.message);

  const registrations = (registrationsResult.data || []).filter(
    (row: any) =>
      !["CANCELLED", "VOID"].includes(clean(row?.status).toUpperCase()),
  );
  const registrationIds = registrations
    .map((row: any) => Number(row.id || 0))
    .filter(Boolean);

  let items: any[] = [];
  if (registrationIds.length) {
    const itemsResult = await supabase
      .from("vaccination_registration_items")
      .select(
        "id,registration_id,vaccine_id,lot_id,dose_number,service_mode,status,active,vaccine:vaccination_vaccines(id,name,brand)",
      )
      .in("registration_id", registrationIds)
      .eq("active", true)
      .order("id", { ascending: true })
      .limit(50000);

    if (itemsResult.error) throw new Error(itemsResult.error.message);
    items = itemsResult.data || [];
  }

  const itemsByRegistration = new Map<number, any[]>();
  for (const item of items) {
    const registrationId = Number(item.registration_id || 0);
    if (!registrationId) continue;
    if (!itemsByRegistration.has(registrationId)) {
      itemsByRegistration.set(registrationId, []);
    }
    itemsByRegistration.get(registrationId)!.push(item);
  }

  const groups = new Map<string, any>();
  const skipped: any[] = [];

  for (const registration of registrations) {
    const registrationId = Number(registration.id || 0);
    const combo = buildCombination(itemsByRegistration.get(registrationId) || []);
    if (!combo.key) {
      skipped.push({
        registration_id: registrationId,
        participant_name: clean(registration.participant_name),
      });
      continue;
    }

    if (!groups.has(combo.key)) {
      groups.set(combo.key, {
        key: combo.key,
        label: combo.label,
        benefits: combo.benefits,
        registrations: [],
      });
    }
    groups.get(combo.key)!.registrations.push(registration);
  }

  return {
    session: sessionResult.data,
    groups: Array.from(groups.values()).sort((a: any, b: any) => {
      if (b.registrations.length !== a.registrations.length) {
        return b.registrations.length - a.registrations.length;
      }
      return a.label.localeCompare(b.label, "id");
    }),
    skipped,
  };
}

async function participantMapForRegistrations(supabase: any, registrations: any[]) {
  const participantIds = Array.from(
    new Set(
      registrations
        .map((row: any) => Number(row.participant_id || 0))
        .filter(Boolean),
    ),
  );
  const map = new Map<number, any>();
  if (!participantIds.length) return map;

  const result = await supabase
    .from("participants")
    .select("*")
    .in("id", participantIds)
    .limit(20000);

  if (!result.error) {
    for (const row of result.data || []) {
      map.set(Number(row.id || 0), row);
    }
  }
  return map;
}

function buildWorkbook(rows: any[], batchLabel: string, session: any) {
  const appointmentRows = [
    ISERVE_HEADERS,
    ...rows.map((row: any) => [
      row.name || "",
      row.street || "",
      row.nik || "",
      row.passport_number || "",
      row.patient_mobile || "",
      "",
      "",
      "",
      "",
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const appointmentSheet = XLSX.utils.aoa_to_sheet(appointmentRows);
  appointmentSheet["!cols"] = [
    { wch: 28 },
    { wch: 44 },
    { wch: 22 },
    { wch: 22 },
    { wch: 20 },
    { wch: 30 },
    { wch: 22 },
    { wch: 18 },
    { wch: 22 },
  ];

  const notes = [
    ["Column", "Description"],
    ["name", "Nama pasien (WAJIB)"],
    ["street", "Alamat pasien"],
    ["nik", "NIK KTP pasien"],
    ["passport_number", "NIK Karyawan / BINUSIAN ID"],
    ["patient_mobile", "Nomor HP pasien"],
    ["vaccination/product", "DIKOSONGKAN pada export ini. Pilih product/vaccine langsung di wizard iServe untuk batch ini."],
    ["vaccination lot", "DIKOSONGKAN pada export ini. Pilih Lot/Serial Number langsung di wizard iServe."],
    ["vaccination dose", "DIKOSONGKAN pada export ini. Isi pada wizard iServe sesuai batch."],
    ["vaccination quantity", "DIKOSONGKAN pada export ini. Isi pada wizard iServe sesuai batch."],
    [],
    ["Batch Kombinasi", batchLabel],
    ["Session", firstValue(session?.session_name, session?.location)],
    ["Lokasi", clean(session?.location)],
    ["Tanggal", clean(session?.session_date)],
    ["Catatan", "1 exact kombinasi vaksin = 1 file batch. Jangan gabungkan kombinasi berbeda dalam satu import appointment."],
  ];
  const notesSheet = XLSX.utils.aoa_to_sheet(notes);
  notesSheet["!cols"] = [{ wch: 28 }, { wch: 88 }];

  XLSX.utils.book_append_sheet(workbook, appointmentSheet, "Import Appointment");
  XLSX.utils.book_append_sheet(workbook, notesSheet, "Notes");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (
    !canVaccinationAccess(user, "dashboard") &&
    !canVaccinationAccess(user, "master")
  ) {
    return fail("Akses export iServe ditolak untuk role ini.", 403);
  }

  const supabase = supabaseAdmin();
  const mode = clean(req.nextUrl.searchParams.get("mode")).toLowerCase() || "meta";

  if (mode === "sessions") {
    const result = await supabase
      .from("vaccination_sessions")
      .select("id,session_name,company_name,location,session_date,status")
      .order("session_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(5000);

    if (result.error) return fail(result.error.message, 500);

    return ok({
      sessions: (result.data || []).filter(
        (row: any) => clean(row.status).toUpperCase() !== "CANCELLED",
      ),
    });
  }

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  if (!sessionId) return fail("Session / Lokasi wajib dipilih.");

  let data: any;
  try {
    data = await loadSessionBatchData(supabase, sessionId);
  } catch (error: any) {
    return fail(error?.message || "Gagal membaca data batch iServe.", 500);
  }

  if (mode === "meta") {
    return ok({
      session: data.session,
      combinations: data.groups.map((group: any) => ({
        key: group.key,
        label: group.label,
        benefit_count: group.benefits.length,
        participant_count: group.registrations.length,
        participant_names: group.registrations
          .map((row: any) => clean(row.participant_name))
          .filter(Boolean)
          .slice(0, 12),
      })),
      skipped_count: data.skipped.length,
      skipped_names: data.skipped
        .map((row: any) => clean(row.participant_name))
        .filter(Boolean)
        .slice(0, 12),
      total_appointments: data.groups.reduce(
        (sum: number, group: any) => sum + group.registrations.length,
        0,
      ),
    });
  }

  if (mode !== "export" && mode !== "template") {
    return fail("Mode export iServe tidak dikenali.", 400);
  }

  const selectedKey = clean(req.nextUrl.searchParams.get("combination"));
  const selectedGroup =
    mode === "template"
      ? {
          key: "template",
          label: "TEMPLATE KOSONG",
          benefits: [],
          registrations: [],
        }
      : data.groups.find((group: any) => group.key === selectedKey);

  if (!selectedGroup) {
    return fail(
      "Kombinasi vaksin yang dipilih tidak ditemukan pada Session ini.",
      404,
    );
  }

  const participantById = await participantMapForRegistrations(
    supabase,
    selectedGroup.registrations,
  );

  const rows = selectedGroup.registrations.map((registration: any) => {
    const participant =
      participantById.get(Number(registration.participant_id || 0)) || {};

    return {
      name: firstValue(
        registration.participant_name,
        participant.name,
        participant.participant_name,
      ),
      street: firstValue(
        registration.street,
        registration.address,
        registration.alamat,
        participant.street,
        participant.address,
        participant.alamat,
      ),
      nik: firstValue(
        registration.nik,
        participant.nik,
        participant.ktp,
        participant.nik_ktp,
      ),
      passport_number: firstValue(
        registration.employee_id,
        registration.binusian_id,
        registration.nik_karyawan,
        participant.employee_id,
        participant.employee_nik,
        participant.external_id,
        participant.binusian_id,
        participant.nik_karyawan,
      ),
      patient_mobile: normalizeIservePhone(
        firstValue(
          registration.phone,
          registration.patient_mobile,
          registration.mobile,
          participant.phone,
          participant.no_hp,
          participant.mobile,
          participant.phone_number,
        ),
      ),
    };
  });

  const output = buildWorkbook(rows, selectedGroup.label, data.session);
  const filename =
    mode === "template"
      ? "ISERVE_TEMPLATE_APPOINTMENT_KOSONG.xlsx"
      : `ISERVE_${safeFilePart(
          firstValue(data.session?.location, data.session?.session_name),
        )}_${safeFilePart(selectedGroup.label)}_${rows.length}PAX.xlsx`;

  return new NextResponse(new Uint8Array(output), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

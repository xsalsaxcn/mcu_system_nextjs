import { NextRequest, NextResponse } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import * as XLSX from "xlsx";

// VACCINATION_ROLE_GUARD_V150
// V153_18_ISERVE_PHONE_AND_PRODUCT_MAPPING_SAFE
// V153_24_ISERVE_PHONE_8XXX_EMPLOYEE_ID_AS_PASSPORT_SAFE
// V153_25_ISERVE_BENEFIT_COMBINATION_EXPORT_SAFE
export const dynamic = "force-dynamic";

function csvEscape(value: any) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows: any[]) {
  const headers = [
    "ANTRIAN",
    "NAMA",
    "MCU_ID",
    "EMPLOYEE_ID",
    "PERUSAHAAN",
    "DEPARTEMEN",
    "NIK",
    "STATUS",
    "VAKSIN",
    "LOT_NUMBER",
    "TANGGAL_PEMBERIAN",
    "NEXT_DOSE",
    "DOKTER_PETUGAS",
    "PAYMENT_METHOD",
    "PAYMENT_NOTE",
    "STATUS_NOTE",
  ];

  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push([
      row.queue_number || "",
      row.participant_name || "",
      row.mcu_id || "",
      row.employee_id || "",
      row.company_name || "",
      row.department || "",
      row.nik || "",
      row.dashboard_status || row.queue_status || "",
      row.vaccine_names || "",
      row.lot_numbers || "",
      row.administered_at || "",
      row.next_due_date || "",
      row.administered_by || "",
      row.payment_method || "",
      row.payment_note || "",
      row.status_note || "",
    ].map(csvEscape).join(","));
  }

  return lines.join("\r\n");
}

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

const ISERVE_NOTES = [
  ["Column", "Description"],
  ["name", "Nama pasien (WAJIB)"],
  ["street", "Alamat pasien"],
  ["nik", "NIK pasien (wajib jika passport kosong)"],
  ["passport_number", "BINUSIAN ID / NIK Karyawan (dipakai sebagai passport_number untuk import iServe)"],
  ["patient_mobile", "Nomor HP pasien (WAJIB)"],
  ["vaccination/product", "HARUS sama dengan vaccination di wizard. Multi-benefit ditulis per baris dalam 1 cell."],
  ["vaccination lot", "Lot sejajar urutannya dengan vaccination/product."],
  ["vaccination dose", "Dose sejajar urutannya dengan vaccination/product."],
  ["vaccination quantity", "Quantity sejajar urutannya dengan vaccination/product."],
];

function firstValue(...values: any[]) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return "";
}

function benefitKey(record: any) {
  const vaccineId = Number(record?.vaccine_id || 0);
  if (vaccineId) return `v:${vaccineId}`;

  const name = clean(record?.vaccine_name).toLowerCase().replace(/\s+/g, " ");
  return name ? `n:${name}` : "";
}

function sameBenefitSet(left: string[], right: string[]) {
  const a = Array.from(new Set(left)).sort();
  const b = Array.from(new Set(right)).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function normalizeIservePhone(value: any) {
  let digits = clean(value).replace(/\D/g, "");
  if (!digits) return "";

  // iServe requires Indonesian mobile without +62 and without the leading 0.
  // Examples:
  // +62 (856) 7015757 -> 8567015757
  // 085137908391      -> 85137908391
  // 82213702347       -> 82213702347
  if (digits.startsWith("0062")) digits = digits.slice(4);
  else if (digits.startsWith("62")) digits = digits.slice(2);

  digits = digits.replace(/^0+/, "");
  return digits;
}

function jakartaDateKey(value: any) {
  const text = clean(value);
  if (!text) return "";

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    const match = text.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : "";
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function inDateRange(value: any, dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) return true;
  const key = jakartaDateKey(value);
  if (!key) return false;
  if (dateFrom && key < dateFrom) return false;
  if (dateTo && key > dateTo) return false;
  return true;
}

function filterRowsForExport(rows: any[], dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) return rows;
  return rows.filter((row) =>
    inDateRange(row.administered_at || row.registered_at, dateFrom, dateTo)
  );
}

function buildIserveWorkbook(rows: any[]) {
  const appointmentRows = [
    ISERVE_HEADERS,
    ...rows.map((row) => [
      row.name || "",
      row.street || "",
      row.nik || "",
      row.passport_number || "",
      row.patient_mobile || "",
      row["vaccination/product"] || "",
      row["vaccination lot"] || "",
      row["vaccination dose"] ?? 1,
      row["vaccination quantity"] ?? 1,
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const appointmentSheet = XLSX.utils.aoa_to_sheet(appointmentRows);
  appointmentSheet["!cols"] = [
    { wch: 26 },
    { wch: 44 },
    { wch: 22 },
    { wch: 22 },
    { wch: 20 },
    { wch: 34 },
    { wch: 22 },
    { wch: 18 },
    { wch: 22 },
  ];

  const notesSheet = XLSX.utils.aoa_to_sheet(ISERVE_NOTES);
  notesSheet["!cols"] = [{ wch: 24 }, { wch: 52 }];

  XLSX.utils.book_append_sheet(workbook, appointmentSheet, "Import Appointment");
  XLSX.utils.book_append_sheet(workbook, notesSheet, "Notes");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function applyStatus(rows: any[], status: string) {
  if (status === "done") return rows.filter((row) => row.is_done);
  if (status === "not_done") return rows.filter((row) => !row.is_done);
  if (status === "no_queue") return rows.filter((row) => !row.queue_number && !row.is_done);
  if (status === "waiting") return rows.filter((row) => row.queue_number && !row.is_done && ["WAITING", "WAITING_WITH_NOTE"].includes(String(row.queue_status || "").toUpperCase()));
  if (status === "doctor") return rows.filter((row) => ["CALLED", "IN_PROGRESS"].includes(String(row.queue_status || "").toUpperCase()));
  return rows;
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "dashboard")) return fail("Akses modul vaksinasi ditolak untuk role ini.", 403);

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  const sourceId = toInt(req.nextUrl.searchParams.get("source_id"), 0);
  const status = clean(req.nextUrl.searchParams.get("status")) || "all";
  const format = clean(req.nextUrl.searchParams.get("format")).toLowerCase();
  const dateFrom = clean(req.nextUrl.searchParams.get("date_from"));
  const dateTo = clean(req.nextUrl.searchParams.get("date_to"));
  const selectedBenefitKeys = req.nextUrl.searchParams
    .getAll("benefit")
    .map((value) => clean(value))
    .filter(Boolean);

  const validDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!validDate(dateFrom) || !validDate(dateTo)) return fail("Format rentang tanggal export tidak valid.", 400);
  if (dateFrom && dateTo && dateFrom > dateTo) return fail("Tanggal awal export tidak boleh lebih besar dari tanggal akhir.", 400);

  const supabase = supabaseAdmin();

  let regQuery = supabase
    .from("vaccination_registrations")
    .select("*, session:vaccination_sessions(id,session_name,company_name,source_id,source_name)")
    .order("id", { ascending: true })
    .limit(10000);

  if (sessionId) regQuery = regQuery.eq("session_id", sessionId);
  if (sourceId) regQuery = regQuery.eq("source_id", sourceId);

  const regsResult = await regQuery;
  if (regsResult.error) return fail(regsResult.error.message, 500);

  const registrations = regsResult.data || [];
  const regIds = registrations.map((row: any) => row.id);

  let records: any[] = [];
  if (regIds.length) {
    const recordsResult = await supabase
      .from("vaccination_records")
      .select("*")
      .in("registration_id", regIds)
      .order("administered_at", { ascending: false });

    if (recordsResult.error) return fail(recordsResult.error.message, 500);
    records = recordsResult.data || [];
  }

  const recordsByReg = new Map<number, any[]>();
  for (const record of records) {
    const key = Number(record.registration_id);
    if (!recordsByReg.has(key)) recordsByReg.set(key, []);
    recordsByReg.get(key)!.push(record);
  }

  const rows = registrations.map((registration: any) => {
    const recs = recordsByReg.get(Number(registration.id)) || [];
    // V148_6_DASHBOARD_WORKFLOW_STATUS_SYNC
    const legacyIsDone = recs.length > 0 || registration.queue_status === "ADMINISTERED";
    const workflowDone = ["ADMINISTERED", "PENDING_VALIDATION", "DONE"].includes(
      String(registration.queue_status || "").toUpperCase()
    ) || ["PENDING", "DONE"].includes(
      String(registration.validation_status || "").toUpperCase()
    );
    const isDone = workflowDone || legacyIsDone;

    const vaccineNames = Array.from(new Set(recs.map((record) => clean(record.vaccine_name)).filter(Boolean))).join(" | ");
    const lotNumbers = Array.from(new Set(recs.map((record) => clean(record.lot_number)).filter(Boolean))).join(" | ");
    const doctors = Array.from(new Set(recs.map((record) => clean(record.administered_by)).filter(Boolean))).join(" | ");

    const lastRecord = recs[0] || {};

    return {
      ...registration,
      is_done: isDone,
      dashboard_status: isDone ? "SUDAH" : registration.queue_number ? "BELUM - SUDAH ANTRIAN" : "BELUM - BELUM ANTRIAN",
      vaccine_names: vaccineNames || registration.vaccine?.name || "",
      lot_numbers: lotNumbers,
      administered_at: lastRecord.administered_at || "",
      next_due_date: lastRecord.next_due_date || "",
      administered_by: doctors,
    };
  });

  const filteredRows = applyStatus(rows, status);

  const summary = {
    total: rows.length,
    done: rows.filter((row) => row.is_done).length,
    not_done: rows.filter((row) => !row.is_done).length,
    no_queue: rows.filter((row) => !row.queue_number && !row.is_done).length,
    waiting: rows.filter((row) => row.queue_number && !row.is_done).length,
  };

  if (format === "csv") {
    const exportRows = filterRowsForExport(filteredRows, dateFrom, dateTo);
    const csv = toCsv(exportRows);
    const rangeLabel = dateFrom || dateTo
      ? `_${dateFrom || "awal"}_sd_${dateTo || "akhir"}`
      : "";
    const filename = `vaccination_${status}${rangeLabel}_${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  if (format === "iserve" || format === "iserve_meta") {
    const doneRows = applyStatus(rows, "done");
    const allowedRegistrationIds = new Set(
      doneRows.map((row: any) => Number(row.id)).filter(Boolean)
    );

    const eligibleRecords = records
      .filter((record: any) => allowedRegistrationIds.has(Number(record.registration_id)))
      .filter((record: any) => !["CANCELLED", "VOID"].includes(clean(record.status).toUpperCase()))
      .filter((record: any) => inDateRange(record.administered_at, dateFrom, dateTo));

    const registrationById = new Map<number, any>(
      registrations.map((registration: any) => [Number(registration.id), registration])
    );

    const participantIds = Array.from(
      new Set(
        registrations
          .map((row: any) => Number(row.participant_id || 0))
          .filter(Boolean)
      )
    );

    const participantById = new Map<number, any>();
    if (participantIds.length) {
      const participantResult = await supabase
        .from("participants")
        .select("*")
        .in("id", participantIds);

      if (!participantResult.error) {
        for (const participant of participantResult.data || []) {
          participantById.set(Number(participant.id), participant);
        }
      }
    }

    const mappedProductByVaccineId = new Map<number, string>();
    const recordVaccineIds = Array.from(
      new Set(
        eligibleRecords
          .map((record: any) => Number(record.vaccine_id || 0))
          .filter(Boolean)
      )
    );

    if (recordVaccineIds.length) {
      const productMappingResult = await supabase
        .from("vaccination_product_mappings")
        .select("vaccine_id,external_product_label,external_product_name,active,updated_at")
        .eq("source_system", "ODOO_STOCK_QUANT")
        .eq("active", true)
        .in("vaccine_id", recordVaccineIds)
        .order("updated_at", { ascending: false });

      if (!productMappingResult.error) {
        for (const mapping of productMappingResult.data || []) {
          const vaccineId = Number(mapping.vaccine_id || 0);
          if (!vaccineId || mappedProductByVaccineId.has(vaccineId)) continue;
          const label = firstValue(mapping.external_product_label, mapping.external_product_name);
          if (label) mappedProductByVaccineId.set(vaccineId, label);
        }
      }
    }

    const recordsByRegistration = new Map<number, any[]>();
    for (const record of eligibleRecords) {
      const registrationId = Number(record.registration_id || 0);
      if (!registrationId) continue;
      if (!recordsByRegistration.has(registrationId)) {
        recordsByRegistration.set(registrationId, []);
      }
      recordsByRegistration.get(registrationId)!.push(record);
    }

    const iserveGroups: any[] = [];

    for (const [registrationId, groupRecords] of recordsByRegistration.entries()) {
      const registration = registrationById.get(registrationId) || {};
      const participant = participantById.get(Number(registration.participant_id || 0)) || {};

      const serviceByBenefit = new Map<string, any>();
      for (const record of groupRecords) {
        const key = benefitKey(record);
        if (!key || serviceByBenefit.has(key)) continue;

        serviceByBenefit.set(key, {
          key,
          label: firstValue(
            mappedProductByVaccineId.get(Number(record.vaccine_id || 0)),
            record.vaccine_name
          ),
          lot: firstValue(record.lot_number),
          dose: Math.max(1, Number(record.dose_number || 1)),
          quantity: 1,
          administered_at: record.administered_at || "",
        });
      }

      const services = Array.from(serviceByBenefit.values()).sort((left: any, right: any) =>
        String(left.label || "").localeCompare(String(right.label || ""), "id")
      );

      if (!services.length) continue;

      const benefitKeys = services.map((service: any) => service.key).sort();
      const comboKey = benefitKeys.join("||");

      iserveGroups.push({
        registration_id: registrationId,
        registration,
        participant,
        services,
        benefit_keys: benefitKeys,
        combo_key: comboKey,
        participant_name: firstValue(
          registration.participant_name,
          participant.name,
          participant.participant_name
        ),
      });
    }

    const productStats = new Map<string, { key: string; label: string; participant_count: number }>();
    for (const group of iserveGroups) {
      const uniqueKeys = new Set<string>();
      for (const service of group.services) {
        if (uniqueKeys.has(service.key)) continue;
        uniqueKeys.add(service.key);

        const current = productStats.get(service.key);
        if (current) {
          current.participant_count += 1;
        } else {
          productStats.set(service.key, {
            key: service.key,
            label: service.label,
            participant_count: 1,
          });
        }
      }
    }

    const comboStats = new Map<string, any>();
    for (const group of iserveGroups) {
      const current = comboStats.get(group.combo_key);
      if (current) {
        current.participant_count += 1;
        if (
          group.participant_name &&
          current.participant_names.length < 12 &&
          !current.participant_names.includes(group.participant_name)
        ) {
          current.participant_names.push(group.participant_name);
        }
      } else {
        comboStats.set(group.combo_key, {
          key: group.combo_key,
          benefit_keys: group.benefit_keys,
          benefit_count: group.benefit_keys.length,
          label: group.services.map((service: any) => service.label).join(" + "),
          participant_count: 1,
          participant_names: group.participant_name ? [group.participant_name] : [],
        });
      }
    }

    const products = Array.from(productStats.values()).sort((left, right) =>
      left.label.localeCompare(right.label, "id")
    );

    const combinations = Array.from(comboStats.values()).sort((left: any, right: any) => {
      if (right.benefit_count !== left.benefit_count) {
        return right.benefit_count - left.benefit_count;
      }
      if (right.participant_count !== left.participant_count) {
        return right.participant_count - left.participant_count;
      }
      return left.label.localeCompare(right.label, "id");
    });

    if (format === "iserve_meta") {
      return ok({
        products,
        combinations,
        totalAppointments: iserveGroups.length,
      });
    }

    const selectedKeys: string[] = Array.from(new Set<string>(selectedBenefitKeys)).sort();

    const exportGroups = selectedKeys.length
      ? iserveGroups.filter((group: any) =>
          sameBenefitSet(group.benefit_keys, selectedKeys)
        )
      : iserveGroups;

    if (selectedKeys.length && !exportGroups.length) {
      return fail(
        "Kombinasi benefit yang dipilih tidak ditemukan pada filter/session/rentang tanggal ini.",
        400
      );
    }

    const iserveRows = exportGroups.map((group: any) => {
      const registration = group.registration || {};
      const participant = group.participant || {};
      const services = group.services || [];

      return {
        name: firstValue(registration.participant_name, participant.name, participant.participant_name),
        street: firstValue(
          registration.street,
          registration.address,
          registration.alamat,
          participant.street,
          participant.address,
          participant.alamat
        ),
        nik: firstValue(
          registration.nik,
          participant.nik,
          participant.ktp,
          participant.nik_ktp
        ),
        passport_number: firstValue(
          registration.employee_id,
          registration.binusian_id,
          registration.nik_karyawan,
          participant.employee_id,
          participant.binusian_id,
          participant.nik_karyawan
        ),
        patient_mobile: normalizeIservePhone(firstValue(
          registration.phone,
          registration.patient_mobile,
          registration.mobile,
          participant.phone,
          participant.no_hp,
          participant.mobile,
          participant.phone_number
        )),
        "vaccination/product": services.map((service: any) => service.label || "").join("\n"),
        "vaccination lot": services.map((service: any) => service.lot || "").join("\n"),
        "vaccination dose": services.map((service: any) => String(service.dose || 1)).join("\n"),
        "vaccination quantity": services.map((service: any) => String(service.quantity || 1)).join("\n"),
      };
    });

    const output = buildIserveWorkbook(iserveRows);
    const rangeLabel = dateFrom || dateTo
      ? `_${dateFrom || "awal"}_sd_${dateTo || "akhir"}`
      : "";
    const comboLabel = selectedKeys.length ? `_${selectedKeys.length}benefit` : "_all";
    const filename = `iserve_vaccination${comboLabel}${rangeLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return ok({ summary, rows: filteredRows, allRows: rows });
}

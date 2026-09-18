import { NextRequest, NextResponse } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import * as XLSX from "xlsx";

// VACCINATION_ROLE_GUARD_V150
// V153_18_ISERVE_PHONE_AND_PRODUCT_MAPPING_SAFE
// V153_24_ISERVE_PHONE_8XXX_EMPLOYEE_ID_AS_PASSPORT_SAFE
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
  ["vaccination/product", "HARUS sama dengan vaccination di wizard"],
  ["vaccination lot", "HARUS salah satu lot yang dipilih di wizard"],
  ["vaccination dose", "Dose vaksin (WAJIB, angka)"],
  ["vaccination quantity", "Quantity vaksin (WAJIB, angka)"],
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
      Number(row["vaccination dose"] || 1),
      Number(row["vaccination quantity"] || 1),
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

  if (format === "iserve") {
    const allowedRegistrationIds = new Set(
      filteredRows.map((row: any) => Number(row.id)).filter(Boolean)
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

    const registrationById = new Map<number, any>(
      registrations.map((registration: any) => [Number(registration.id), registration])
    );

    const mappedProductByVaccineId = new Map<number, string>();
    const recordVaccineIds = Array.from(
      new Set(records.map((record: any) => Number(record.vaccine_id || 0)).filter(Boolean))
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

    const iserveRows = records
      .filter((record: any) => allowedRegistrationIds.has(Number(record.registration_id)))
      .filter((record: any) => !["CANCELLED", "VOID"].includes(clean(record.status).toUpperCase()))
      .filter((record: any) => inDateRange(record.administered_at, dateFrom, dateTo))
      .map((record: any) => {
        const registration = registrationById.get(Number(record.registration_id)) || {};
        const participant = participantById.get(Number(registration.participant_id || 0)) || {};

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
          // iServe import: use BINUSIAN ID / NIK Karyawan as passport_number.
          // Do not use patient passport and do not fall back to KTP NIK here.
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
          "vaccination/product": firstValue(
            mappedProductByVaccineId.get(Number(record.vaccine_id || 0)),
            record.vaccine_name
          ),
          "vaccination lot": firstValue(record.lot_number),
          "vaccination dose": Math.max(1, Number(record.dose_number || 1)),
          "vaccination quantity": 1,
        };
      });

    const output = buildIserveWorkbook(iserveRows);
    const rangeLabel = dateFrom || dateTo
      ? `_${dateFrom || "awal"}_sd_${dateTo || "akhir"}`
      : "";
    const filename = `iserve_vaccination${rangeLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;

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

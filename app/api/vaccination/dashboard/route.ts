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
    "TRACK",
    "JENIS_LAYANAN",
    "JENIS_PENDAFTARAN",
    "NAMA",
    "FAMILY_ROLE",
    "MCU_ID",
    "EMPLOYEE_ID",
    "NIK",
    "PERUSAHAAN",
    "DEPARTEMEN",
    "SESSION",
    "LOKASI",
    "TANGGAL_SESSION",
    "SOURCE_DATABASE",
    "STATUS",
    "ITEM_STATUS",
    "VAKSIN",
    "BRAND",
    "LOT_NUMBER",
    "EXP_LOT",
    "DOSIS",
    "TANGGAL_PEMBERIAN",
    "TANGGAL_SELESAI_FLOW",
    "NEXT_DOSE",
    "DOKTER_PETUGAS",
    "SUMBER_SELESAI",
    "PRICE_CATEGORY",
    "HARGA",
    "PAYMENT_METHOD",
    "SURCHARGE_PERCENT",
    "SURCHARGE_AMOUNT",
    "TOTAL_PAYMENT",
    "PAYMENT_NOTE",
    "ITEM_NOTE",
    "STATUS_NOTE",
  ];

  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push([
      row.queue_number || "",
      row.track || "",
      row.service_mode || "",
      row.registration_type || "ADMIN BOOKING",
      row.participant_name || "",
      row.family_role || "",
      row.mcu_id || "",
      row.employee_id || "",
      row.nik || "",
      row.company_name || "",
      row.department || "",
      row.session_name || "",
      row.location || "",
      row.session_date || "",
      row.source_name || "",
      row.track_status || row.dashboard_status || row.queue_status || "",
      row.item_status || "",
      row.vaccine_name || "",
      row.vaccine_brand || "",
      row.lot_number || "",
      row.lot_expiry || "",
      row.dose_number ?? "",
      row.administered_at || "",
      row.flow_completed_at || "",
      row.next_due_date || "",
      row.administered_by || "",
      row.completion_source || "",
      row.price_category || "",
      row.price ?? "",
      row.payment_method || "",
      row.payment_surcharge_percent ?? "",
      row.payment_surcharge_amount ?? "",
      row.payment_total ?? "",
      row.payment_note || "",
      row.item_note || "",
      row.status_note || "",
    ].map(csvEscape).join(","));
  }

  return lines.join("\r\n");
}

function doneStatus(value: any) {
  return ["ADMINISTERED", "DONE", "FINISHED"].includes(
    clean(value).toUpperCase()
  );
}

function normalizeServiceMode(value: any) {
  return clean(value).toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
}

function registrationType(registration: any) {
  return clean(registration?.registered_by).toUpperCase().startsWith("SELF_BOOKING")
    ? "SELF BOOKING"
    : "ADMIN BOOKING";
}

function registrationTrackStatus(registration: any, track: "A" | "B") {
  return clean(
    track === "B"
      ? registration?.bazar_queue_status
      : registration?.queue_status
  ).toUpperCase();
}

function registrationTrackNumber(registration: any, track: "A" | "B") {
  return clean(
    track === "B"
      ? registration?.bazar_queue_number
      : registration?.queue_number
  );
}

function serviceMatchesStage(
  status: string,
  done: boolean,
  trackStatus: string,
  queueNumber: string
) {
  if (status === "done") return done;
  if (status === "not_done") return !done;
  if (status === "no_queue") return !done && !queueNumber;
  if (status === "waiting") {
    return (
      !done &&
      Boolean(queueNumber) &&
      ["WAITING", "WAITING_WITH_NOTE", "REGISTERED"].includes(trackStatus)
    );
  }
  if (status === "doctor") {
    return !done && ["CALLED", "IN_PROGRESS"].includes(trackStatus);
  }
  return true;
}

function sameRecordAsItem(record: any, item: any) {
  const linkedRecordId = Number(item?.administered_record_id || 0);
  if (linkedRecordId && Number(record?.id || 0) === linkedRecordId) return true;

  if (
    Number(record?.vaccine_id || 0) &&
    Number(item?.vaccine_id || 0) &&
    Number(record.vaccine_id) !== Number(item.vaccine_id)
  ) {
    return false;
  }

  const recordLotId = Number(record?.lot_id || 0);
  const itemLotId = Number(item?.lot_id || 0);
  if (recordLotId && itemLotId && recordLotId !== itemLotId) return false;

  const recordDose = Number(record?.dose_number || 0);
  const itemDose = Number(item?.dose_number || 0);
  if (recordDose && itemDose && recordDose !== itemDose) return false;

  return Boolean(
    Number(record?.vaccine_id || 0) &&
    Number(item?.vaccine_id || 0)
  );
}

function buildCompleteExportRows(
  registrations: any[],
  itemsByReg: Map<number, any[]>,
  recordsByReg: Map<number, any[]>,
  status: string
) {
  const output: any[] = [];

  for (const registration of registrations) {
    const registrationId = Number(registration?.id || 0);
    const items = itemsByReg.get(registrationId) || [];
    const records = recordsByReg.get(registrationId) || [];
    const usedRecordIds = new Set<number>();

    const session = registration?.session || {};
    const base = {
      registration_id: registrationId,
      participant_name: clean(registration?.participant_name),
      family_role: clean(registration?.family_role),
      mcu_id: clean(registration?.mcu_id),
      employee_id: clean(registration?.employee_id),
      nik: clean(registration?.nik),
      company_name: firstValue(
        registration?.company_name,
        session?.company_name
      ),
      department: clean(registration?.department),
      session_name: clean(session?.session_name),
      location: clean(session?.location),
      session_date: clean(session?.session_date),
      source_name: firstValue(
        registration?.source_name,
        session?.source_name
      ),
      registered_at: firstValue(
        registration?.registered_at,
        registration?.created_at
      ),
      status_note: clean(registration?.status_note),
      registration_type: registrationType(registration),
    };

    for (const item of items) {
      const serviceMode = normalizeServiceMode(item?.service_mode);
      const track: "A" | "B" = serviceMode === "BAZAR" ? "B" : "A";
      const trackStatus = registrationTrackStatus(registration, track);
      const queueNumber = registrationTrackNumber(registration, track);

      const record = records.find((candidate: any) => {
        const recordId = Number(candidate?.id || 0);
        if (recordId && usedRecordIds.has(recordId)) return false;
        return sameRecordAsItem(candidate, item);
      }) || null;

      if (record?.id) usedRecordIds.add(Number(record.id));

      const itemStatus = clean(item?.status).toUpperCase();
      const itemDone = doneStatus(itemStatus);
      const trackDone = doneStatus(trackStatus);
      const recordDone = Boolean(record);
      const done = recordDone || itemDone || trackDone;

      if (!serviceMatchesStage(status, done, trackStatus, queueNumber)) {
        continue;
      }

      const flowCompletedAt = firstValue(
        record?.administered_at,
        item?.administered_at,
        track === "B" && trackDone
          ? registration?.bazar_finished_at
          : "",
        track === "A" && trackDone
          ? registration?.updated_at
          : ""
      );

      const completionSource = recordDone
        ? "DOKTER_ADMINISTERED"
        : itemDone && clean(item?.administered_at)
          ? "ITEM_ADMINISTERED"
          : trackDone
            ? "QUEUE_DONE"
            : "";

      output.push({
        ...base,
        queue_number: queueNumber,
        track,
        service_mode: serviceMode,
        track_status: trackStatus,
        item_status: itemStatus,
        vaccine_name: firstValue(
          record?.vaccine_name,
          item?.vaccine?.name,
          registration?.vaccine?.name
        ),
        vaccine_brand: clean(item?.vaccine?.brand),
        lot_number: firstValue(
          record?.lot_number,
          item?.lot?.lot_number
        ),
        lot_expiry: clean(item?.lot?.expiry_date),
        dose_number:
          Number(record?.dose_number || item?.dose_number || 1) || 1,

        // Medical administration timestamp remains medical-only.
        // Queue-only completion is kept separately in TANGGAL_SELESAI_FLOW.
        administered_at: firstValue(
          record?.administered_at,
          itemDone ? item?.administered_at : ""
        ),
        flow_completed_at: flowCompletedAt,
        next_due_date: clean(record?.next_due_date),
        administered_by: clean(record?.administered_by),
        completion_source: completionSource,

        price_category: firstValue(
          item?.price_category,
          item?.vaccine?.price_category
        ),
        price:
          item?.price == null
            ? ""
            : item.price,
        payment_method: firstValue(
          item?.payment_method,
          registration?.payment_method
        ),
        payment_surcharge_percent:
          item?.payment_surcharge_percent == null
            ? ""
            : item.payment_surcharge_percent,
        payment_surcharge_amount:
          item?.payment_surcharge_amount == null
            ? ""
            : item.payment_surcharge_amount,
        payment_total:
          item?.payment_total == null
            ? (item?.price == null ? "" : item.price)
            : item.payment_total,
        payment_note: firstValue(
          item?.payment_note,
          registration?.payment_note
        ),
        item_note: clean(item?.item_note),
      });
    }

    // Legacy/administered records that do not have a matching active registration item.
    for (const record of records) {
      const recordId = Number(record?.id || 0);
      if (recordId && usedRecordIds.has(recordId)) continue;

      let track: "A" | "B" = "A";
      const serviceStatus = clean(
        registration?.patient_service_status
      ).toUpperCase();

      if (
        serviceStatus === "BAZAR" &&
        clean(registration?.bazar_queue_number)
      ) {
        track = "B";
      }

      const trackStatus = registrationTrackStatus(registration, track);
      const queueNumber = registrationTrackNumber(registration, track);
      const done = true;

      if (!serviceMatchesStage(status, done, trackStatus, queueNumber)) {
        continue;
      }

      output.push({
        ...base,
        queue_number: queueNumber,
        track,
        service_mode: track === "B" ? "BAZAR" : "HEALTHDAY",
        track_status: trackStatus || "ADMINISTERED",
        item_status: "ADMINISTERED",
        vaccine_name: clean(record?.vaccine_name),
        vaccine_brand: "",
        lot_number: clean(record?.lot_number),
        lot_expiry: "",
        dose_number: Number(record?.dose_number || 1) || 1,
        administered_at: clean(record?.administered_at),
        flow_completed_at: clean(record?.administered_at),
        next_due_date: clean(record?.next_due_date),
        administered_by: clean(record?.administered_by),
        completion_source: "DOKTER_ADMINISTERED",
        price_category: "",
        price: "",
        payment_method: clean(registration?.payment_method),
        payment_surcharge_percent: "",
        payment_surcharge_amount: "",
        payment_total: "",
        payment_note: clean(registration?.payment_note),
        item_note: "",
      });
    }

    // Very old registration: no item and no vaccination_record.
    // Keep it exportable so participant/session/location data never disappear.
    if (!items.length && !records.length) {
      const aStatus = registrationTrackStatus(registration, "A");
      const bStatus = registrationTrackStatus(registration, "B");

      const fallbackTrack: "A" | "B" =
        clean(registration?.patient_service_status).toUpperCase() === "BAZAR"
          ? "B"
          : "A";

      const fallbackStatus =
        fallbackTrack === "B" ? bStatus : aStatus;
      const fallbackQueue =
        registrationTrackNumber(registration, fallbackTrack);
      const fallbackDone = doneStatus(fallbackStatus);

      if (
        serviceMatchesStage(
          status,
          fallbackDone,
          fallbackStatus,
          fallbackQueue
        )
      ) {
        output.push({
          ...base,
          queue_number: fallbackQueue,
          track: fallbackTrack,
          service_mode:
            fallbackTrack === "B" ? "BAZAR" : "HEALTHDAY",
          track_status: fallbackStatus,
          item_status: "",
          vaccine_name: clean(registration?.vaccine?.name),
          vaccine_brand: clean(registration?.vaccine?.brand),
          lot_number: "",
          lot_expiry: "",
          dose_number: "",
          administered_at: "",
          flow_completed_at:
            fallbackDone
              ? firstValue(
                  fallbackTrack === "B"
                    ? registration?.bazar_finished_at
                    : "",
                  registration?.updated_at
                )
              : "",
          next_due_date: "",
          administered_by: "",
          completion_source:
            fallbackDone ? "QUEUE_DONE_LEGACY" : "",
          price_category: "",
          price:
            registration?.payment_price == null
              ? ""
              : registration.payment_price,
          payment_method: clean(registration?.payment_method),
          payment_surcharge_percent: "",
          payment_surcharge_amount: "",
          payment_total:
            registration?.payment_price == null
              ? ""
              : registration.payment_price,
          payment_note: clean(registration?.payment_note),
          item_note: "",
        });
      }
    }
  }

  return output;
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
    inDateRange(
      row.administered_at ||
        row.flow_completed_at ||
        row.registered_at,
      dateFrom,
      dateTo
    )
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
  const requestedServiceMode = clean(req.nextUrl.searchParams.get("service_mode")).toUpperCase();
  const serviceModeFilter = ["HEALTHDAY", "BAZAR"].includes(requestedServiceMode) ? requestedServiceMode : "";
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
    .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date,source_id,source_name), vaccine:vaccination_vaccines(id,name,brand,price,price_category)")
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

  let registrationItems: any[] = [];
  if (regIds.length) {
    const itemsResult = await supabase
      .from("vaccination_registration_items")
      .select("*, vaccine:vaccination_vaccines(id,name,brand,price,price_category), lot:vaccination_vaccine_lots(id,lot_number,expiry_date)")
      .in("registration_id", regIds)
      .eq("active", true)
      .order("id", { ascending: true });

    if (itemsResult.error) return fail(itemsResult.error.message, 500);
    registrationItems = itemsResult.data || [];
  }

  const itemsByReg = new Map<number, any[]>();
  for (const item of registrationItems) {
    const key = Number(item.registration_id);
    if (!itemsByReg.has(key)) itemsByReg.set(key, []);
    itemsByReg.get(key)!.push(item);
  }

  const rows = registrations.map((registration: any) => {
    const recs = recordsByReg.get(Number(registration.id)) || [];
    const regItems = itemsByReg.get(Number(registration.id)) || [];

    // Complete workflow status:
    // doctor-administered record OR item administered OR either queue track done.
    const recordDone = recs.length > 0;
    const itemDone = regItems.some((item: any) =>
      doneStatus(item?.status)
    );
    const queueADone = doneStatus(registration?.queue_status);
    const queueBDone = doneStatus(registration?.bazar_queue_status);
    const validationDone = ["PENDING", "DONE"].includes(
      clean(registration?.validation_status).toUpperCase()
    );
    const isDone =
      recordDone ||
      itemDone ||
      queueADone ||
      queueBDone ||
      validationDone;

    // Dashboard display is also enriched from registration items,
    // so vaccine/lot does not disappear when doctor-administered flow was skipped.
    const vaccineNames = Array.from(
      new Set(
        [
          ...recs.map((record: any) => clean(record?.vaccine_name)),
          ...regItems.map((item: any) => clean(item?.vaccine?.name)),
          clean(registration?.vaccine?.name),
        ].filter(Boolean)
      )
    ).join(" | ");

    const lotNumbers = Array.from(
      new Set(
        [
          ...recs.map((record: any) => clean(record?.lot_number)),
          ...regItems.map((item: any) => clean(item?.lot?.lot_number)),
        ].filter(Boolean)
      )
    ).join(" | ");

    const doctors = Array.from(
      new Set(
        recs
          .map((record: any) => clean(record?.administered_by))
          .filter(Boolean)
      )
    ).join(" | ");

    const lastRecord = recs[0] || {};

    return {
      ...registration,
      is_done: isDone,
      dashboard_status: isDone
        ? "SUDAH"
        : registration.queue_number || registration.bazar_queue_number
          ? "BELUM - SUDAH ANTRIAN"
          : "BELUM - BELUM ANTRIAN",
      vaccine_names: vaccineNames,
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
    const completeRows = buildCompleteExportRows(
      registrations,
      itemsByReg,
      recordsByReg,
      status
    );
    const serviceRows = serviceModeFilter
      ? completeRows.filter((row: any) => clean(row?.service_mode).toUpperCase() === serviceModeFilter)
      : completeRows;
    const exportRows = filterRowsForExport(
      serviceRows,
      dateFrom,
      dateTo
    );
    const csv = toCsv(exportRows);
    const rangeLabel = dateFrom || dateTo
      ? `_${dateFrom || "awal"}_sd_${dateTo || "akhir"}`
      : "";
    const filename = `vaccination_${status}_complete${rangeLabel}_${new Date().toISOString().slice(0, 10)}.csv`;

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

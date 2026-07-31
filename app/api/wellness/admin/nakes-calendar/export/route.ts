// WELLNESS_NAKES_FULL_CLINICAL_EXPORT_V126M25_2
// Read-only Excel export for Admin Monitoring NAKES.
// Exports participant examination status and complete clinical results.

import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail } from "@/lib/server/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "supervisor",
  "doctor",
  "wellness_admin",
]);

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: any): number | "" {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : "";
}

function active(value: any) {
  return ![false, 0, "0", "false", "inactive", "nonaktif"].includes(
    typeof value === "string" ? value.toLowerCase() : value,
  );
}

function validHistory(row: any) {
  const status = clean(row?.status).toLowerCase();
  return (
    numberValue(row?.participant_id) > 0 &&
    Boolean(clean(row?.checkup_date || row?.created_at).slice(0, 10)) &&
    active(row?.is_active) &&
    !["cancelled", "canceled", "deleted", "void", "batal"].includes(status)
  );
}

function safeText(value: any) {
  const text = clean(value);
  if (!text) return "";
  if (/^[=+@\t\r]/.test(text) || (text.startsWith("-") && text !== "-")) {
    return `'${text}`;
  }
  return text;
}

function safeCell(value: any): string | number {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  return safeText(value);
}

function dateOnly(value: any) {
  return clean(value).slice(0, 10);
}

function formatDate(value: any) {
  const text = dateOnly(value);
  if (!text) return "";
  const [year, month, day] = text.split("-");
  return year && month && day ? `${day}/${month}/${year}` : text;
}

function monthLabel(value: string) {
  const parsed = new Date(`${value}-01T12:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(parsed);
}

function currentJakartaMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  return year && month ? `${year}-${month}` : "2026-07";
}

async function safeRows(query: any) {
  try {
    const result = await query;
    if (result?.error) return [];
    return result?.data || [];
  } catch {
    return [];
  }
}

function worksheetFromRows(rows: Record<string, any>[], headers: string[]) {
  const values = [
    headers,
    ...rows.map((row) => headers.map((header) => safeCell(row[header]))),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(values);
  worksheet["!cols"] = headers.map((header) => ({
    wch: Math.min(
      45,
      Math.max(
        12,
        header.length + 2,
        ...rows.slice(0, 500).map((row) => clean(row[header]).length + 2),
      ),
    ),
  }));
  worksheet["!autofilter"] = {
    ref: `A1:${XLSX.utils.encode_col(Math.max(0, headers.length - 1))}${Math.max(
      1,
      rows.length + 1,
    )}`,
  };
  return worksheet;
}

function addSheet(
  workbook: XLSX.WorkBook,
  name: string,
  rows: Record<string, any>[],
  headers: string[],
) {
  XLSX.utils.book_append_sheet(
    workbook,
    worksheetFromRows(rows, headers),
    name,
  );
}

function clinicalRow(participant: any, history: any) {
  const raw =
    history?.raw_payload && typeof history.raw_payload === "object"
      ? history.raw_payload
      : {};
  const systolic = nullableNumber(history?.systolic);
  const diastolic = nullableNumber(history?.diastolic);
  const bp =
    systolic !== "" || diastolic !== ""
      ? `${systolic === "" ? "" : systolic}/${diastolic === "" ? "" : diastolic}`
      : clean(history?.bp_raw);

  return {
    "Kode Peserta": participant.code,
    "Nama Peserta": participant.name,
    Perusahaan: participant.company_name,
    Kelompok: participant.group_name,
    "Tanggal Pemeriksaan": formatDate(history?.checkup_date || history?.created_at),
    "Jenis Pemeriksaan": clean(history?.history_type),
    "Label Pemeriksaan": clean(history?.visit_label),
    "Urutan Pemeriksaan": clean(
      history?.visit_sequence || raw?.visit_sequence || raw?.examination_sequence,
    ),
    "Nomor Laboratorium": clean(history?.lab_no),
    "Tinggi Badan (cm)": nullableNumber(history?.height_cm),
    "Berat Badan (kg)": nullableNumber(history?.weight_kg),
    "BMI / IMT": nullableNumber(history?.bmi),
    "Lingkar Perut (cm)": nullableNumber(history?.waist_cm),
    Sistolik: systolic,
    Diastolik: diastolic,
    "Tekanan Darah": bp,
    Nadi: nullableNumber(history?.pulse),
    "HbA1c (%)": nullableNumber(history?.hba1c_percent),
    "Gula Darah": nullableNumber(history?.glucose_value),
    "Kolesterol Total": nullableNumber(history?.cholesterol_total),
    LDL: nullableNumber(history?.ldl),
    HDL: nullableNumber(history?.hdl),
    Trigliserida: nullableNumber(history?.triglyceride),
    "Asam Urat": nullableNumber(history?.uric_acid),
    SGOT: nullableNumber(history?.sgot),
    SGPT: nullableNumber(history?.sgpt),
    "Risk Cluster": clean(history?.risk_cluster),
    "Risk Level": clean(history?.risk_level),
    "Status Program": clean(history?.program_status),
    "Fokus Intervensi": clean(history?.intervention_focus),
    "Rencana Monitoring": clean(history?.monitoring_plan),
    "Catatan Validasi Medis": clean(history?.medical_validation_notes),
    "Tanggal Follow-up": formatDate(history?.next_followup_date),
  };
}

const STATUS_HEADERS = [
  "Kode Peserta",
  "Nama Peserta",
  "Perusahaan",
  "Kelompok",
  "Status Pemeriksaan",
  "Pemeriksaan Terakhir",
  "Jumlah Pemeriksaan",
];

const CLINICAL_HEADERS = [
  "Kode Peserta",
  "Nama Peserta",
  "Perusahaan",
  "Kelompok",
  "Tanggal Pemeriksaan",
  "Jenis Pemeriksaan",
  "Label Pemeriksaan",
  "Urutan Pemeriksaan",
  "Nomor Laboratorium",
  "Tinggi Badan (cm)",
  "Berat Badan (kg)",
  "BMI / IMT",
  "Lingkar Perut (cm)",
  "Sistolik",
  "Diastolik",
  "Tekanan Darah",
  "Nadi",
  "HbA1c (%)",
  "Gula Darah",
  "Kolesterol Total",
  "LDL",
  "HDL",
  "Trigliserida",
  "Asam Urat",
  "SGOT",
  "SGPT",
  "Risk Cluster",
  "Risk Level",
  "Status Program",
  "Fokus Intervensi",
  "Rencana Monitoring",
  "Catatan Validasi Medis",
  "Tanggal Follow-up",
];

export async function GET(request: NextRequest) {
  try {
    const user: any = getSessionUser(request);
    if (!user) return fail("Session Admin belum aktif.", 401);

    const role = clean(user.role).toLowerCase();
    if (!ADMIN_ROLES.has(role)) {
      return fail("Akun ini tidak memiliki akses export Monitoring NAKES.", 403);
    }

    const url = new URL(request.url);
    const month = /^\d{4}-\d{2}$/.test(clean(url.searchParams.get("month")))
      ? clean(url.searchParams.get("month"))
      : currentJakartaMonth();
    const companyFilter = clean(url.searchParams.get("company")) || "all";
    const groupFilter = clean(url.searchParams.get("group")) || "all";
    const statusFilter = clean(url.searchParams.get("status")) || "all";
    const keyword = clean(url.searchParams.get("q")).toLowerCase();

    const supabase = getSupabaseAdmin();
    const [participantRows, companyRows, groupRows, historyRows] =
      await Promise.all([
        safeRows(
          supabase.from("wellness_participants").select("*").limit(10000),
        ),
        safeRows(
          supabase
            .from("wellness_companies")
            .select("id,name,code,is_active")
            .limit(2000),
        ),
        safeRows(
          supabase
            .from("wellness_group_units")
            .select("id,name,parent_id,company_id,unit_type,is_active")
            .limit(5000),
        ),
        safeRows(
          supabase
            .from("wellness_checkup_history")
            .select("*")
            .order("checkup_date", { ascending: true })
            .limit(50000),
        ),
      ]);

    const participants = participantRows.filter((item: any) => active(item?.is_active));
    const companies = companyRows.filter((item: any) => active(item?.is_active));
    const groups = groupRows.filter((item: any) => active(item?.is_active));
    const validHistories = historyRows.filter(validHistory);

    const companyById = new Map<number, any>(
      companies.map((item: any) => [numberValue(item.id), item]),
    );
    const groupById = new Map<number, any>(
      groups.map((item: any) => [numberValue(item.id), item]),
    );
    const historyByParticipant = new Map<number, any[]>();

    for (const history of validHistories) {
      const participantId = numberValue(history.participant_id);
      if (!historyByParticipant.has(participantId)) {
        historyByParticipant.set(participantId, []);
      }
      historyByParticipant.get(participantId)!.push(history);
    }

    const baseRows = participants
      .map((participant: any) => {
        const participantId = numberValue(participant.id);
        const directGroup =
          groupById.get(numberValue(participant.wellness_group_unit_id)) || null;
        const kelompok =
          groupById.get(numberValue(participant.wellness_kelompok_id)) ||
          (directGroup?.parent_id
            ? groupById.get(numberValue(directGroup.parent_id))
            : null) ||
          (clean(directGroup?.unit_type).toLowerCase() === "kelompok"
            ? directGroup
            : null);
        const companyId = numberValue(
          participant.wellness_company_id || directGroup?.company_id,
        );
        const allHistory = historyByParticipant.get(participantId) || [];
        const periodHistory = allHistory
          .filter((history: any) =>
            dateOnly(history?.checkup_date || history?.created_at).startsWith(
              `${month}-`,
            ),
          )
          .sort((left: any, right: any) =>
            dateOnly(left?.checkup_date || left?.created_at).localeCompare(
              dateOnly(right?.checkup_date || right?.created_at),
            ),
          );
        const row = {
          participant_id: participantId,
          code: clean(
            participant.code || participant.employee_code || participant.no_karyawan,
          ),
          name:
            clean(
              participant.name ||
                participant.full_name ||
                participant.employee_name,
            ) || `Peserta ${participantId}`,
          company_name:
            clean(companyById.get(companyId)?.name) ||
            clean(participant.company_name) ||
            "-",
          group_name:
            clean(directGroup?.name) ||
            clean(kelompok?.name) ||
            clean(participant.group_name) ||
            "-",
          period_history: periodHistory,
          examined: periodHistory.length > 0,
          latest_history: periodHistory.at(-1) || null,
        };

        return row;
      })
      .filter((row: any) => {
        const matchesKeyword =
          !keyword ||
          [row.name, row.code, row.company_name, row.group_name]
            .map((value) => clean(value).toLowerCase())
            .join(" ")
            .includes(keyword);
        const matchesCompany =
          companyFilter === "all" || row.company_name === companyFilter;
        const matchesGroup =
          groupFilter === "all" || row.group_name === groupFilter;
        return matchesKeyword && matchesCompany && matchesGroup;
      });

    const selectedRows = baseRows.filter((row: any) => {
      return (
        statusFilter === "all" ||
        (statusFilter === "examined" && row.examined) ||
        (statusFilter === "not_examined" && !row.examined)
      );
    });

    const statusRows = selectedRows.map((row: any) => ({
      "Kode Peserta": row.code,
      "Nama Peserta": row.name,
      Perusahaan: row.company_name,
      Kelompok: row.group_name,
      "Status Pemeriksaan": row.examined
        ? "Sudah Pemeriksaan"
        : "Belum Pemeriksaan",
      "Pemeriksaan Terakhir": formatDate(
        row.latest_history?.checkup_date || row.latest_history?.created_at,
      ),
      "Jumlah Pemeriksaan": row.period_history.length,
    }));

    const latestRows = selectedRows
      .filter((row: any) => row.latest_history)
      .map((row: any) => clinicalRow(row, row.latest_history));

    const historyExportRows = selectedRows.flatMap((row: any) =>
      row.period_history.map((history: any) => clinicalRow(row, history)),
    );

    const examinedStatusRows = statusRows.filter(
      (row: any) => row["Status Pemeriksaan"] === "Sudah Pemeriksaan",
    );
    const notExaminedStatusRows = statusRows.filter(
      (row: any) => row["Status Pemeriksaan"] === "Belum Pemeriksaan",
    );

    const calendarMap = new Map<
      string,
      { codes: Set<string>; names: Set<string> }
    >();
    for (const row of selectedRows) {
      for (const history of row.period_history) {
        const date = dateOnly(history?.checkup_date || history?.created_at);
        if (!date) continue;
        if (!calendarMap.has(date)) {
          calendarMap.set(date, { codes: new Set(), names: new Set() });
        }
        if (row.code) calendarMap.get(date)!.codes.add(row.code);
        calendarMap.get(date)!.names.add(row.name);
      }
    }
    const calendarRows = [...calendarMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, data]) => ({
        Tanggal: formatDate(date),
        "Jumlah Peserta": data.names.size,
        "Kode Peserta": [...data.codes].sort().join(", "),
        "Nama Peserta": [...data.names].sort((a, b) => a.localeCompare(b, "id")).join(", "),
      }));

    const examinedCount = baseRows.filter((row: any) => row.examined).length;
    const completion = baseRows.length
      ? Math.round((examinedCount / baseRows.length) * 100)
      : 0;
    const summaryRows = [
      { Keterangan: "Periode", Nilai: monthLabel(month) },
      { Keterangan: "Perusahaan", Nilai: companyFilter === "all" ? "Semua Perusahaan" : companyFilter },
      { Keterangan: "Kelompok", Nilai: groupFilter === "all" ? "Semua Kelompok" : groupFilter },
      { Keterangan: "Status", Nilai: statusFilter === "all" ? "Semua Status" : statusFilter === "examined" ? "Sudah Pemeriksaan" : "Belum Pemeriksaan" },
      { Keterangan: "Pencarian", Nilai: keyword || "-" },
      { Keterangan: "Total peserta sesuai filter dasar", Nilai: baseRows.length },
      { Keterangan: "Sudah pemeriksaan", Nilai: examinedCount },
      { Keterangan: "Belum pemeriksaan", Nilai: Math.max(0, baseRows.length - examinedCount) },
      { Keterangan: "Penyelesaian (%)", Nilai: completion },
      { Keterangan: "Peserta pada export", Nilai: selectedRows.length },
      { Keterangan: "Jumlah baris riwayat", Nilai: historyExportRows.length },
      { Keterangan: "Dibuat pada", Nilai: new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date()) },
    ];

    const workbook = XLSX.utils.book_new();
    workbook.Props = {
      Title: `Monitoring NAKES ${monthLabel(month)}`,
      Subject: "Status dan hasil pemeriksaan NAKES",
      Author: "inHARMONY Wellness",
      Company: "inHARMONY",
      CreatedDate: new Date(),
    };

    addSheet(workbook, "Ringkasan", summaryRows, ["Keterangan", "Nilai"]);
    addSheet(workbook, "Status Peserta", statusRows, STATUS_HEADERS);
    addSheet(workbook, "Hasil Terbaru", latestRows, CLINICAL_HEADERS);
    addSheet(workbook, "Riwayat Pemeriksaan", historyExportRows, CLINICAL_HEADERS);
    addSheet(workbook, "Sudah Periksa", examinedStatusRows, STATUS_HEADERS);
    addSheet(workbook, "Belum Periksa", notExaminedStatusRows, STATUS_HEADERS);
    addSheet(workbook, "Kalender Harian", calendarRows, [
      "Tanggal",
      "Jumlah Peserta",
      "Kode Peserta",
      "Nama Peserta",
    ]);

    const output: any = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
      compression: true,
    });
    const filename = `monitoring_nakes_${month.replace("-", "_")}.xlsx`;

    return new Response(new Uint8Array(output), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    return fail(
      error?.message || "Export hasil pemeriksaan NAKES gagal dibuat.",
      500,
    );
  }
}

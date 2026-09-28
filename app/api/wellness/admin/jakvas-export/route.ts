// WELLNESS_ADMIN_JAKVAS_SCORE_EXPORT_V1_EXCEL
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail } from "@/lib/server/response";
import { loadParticipantJakvasReport } from "@/lib/wellness/jakvasServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

function safeText(value: any) {
  const text = clean(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function nullableNumber(value: any) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}

function yesNo(value: any) {
  if (value === true) return "Ya";
  if (value === false) return "Tidak";
  return "";
}

function jakartaDateStamp(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(value)
    .replace(/-/g, "");
}

function jakartaDateTime(value = new Date()) {
  return value.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function componentByKey(report: any, key: string) {
  return (report?.components || []).find(
    (item: any) => clean(item?.key) === key,
  );
}

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

function appendSheet(
  workbook: XLSX.WorkBook,
  name: string,
  headers: string[],
  rows: Array<Array<string | number>>,
  widths: number[],
) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map((_, index) => ({
    wch: widths[index] || 16,
  }));

  if (headers.length && rows.length) {
    const lastColumn = XLSX.utils.encode_col(headers.length - 1);
    sheet["!autofilter"] = {
      ref: `A1:${lastColumn}${rows.length + 1}`,
    };
  }

  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

export async function GET(request: NextRequest) {
  try {
    const user: any = getSessionUser(request);
    if (!user) return fail("Session Admin belum aktif.", 401);
    if (!ADMIN_ROLES.has(clean(user.role).toLowerCase())) {
      return fail("Akun ini tidak memiliki akses Portal Admin.", 403);
    }

    const supabase = getSupabaseAdmin();

    const [participantResult, companyResult] = await Promise.all([
      supabase
        .from("wellness_participants")
        .select("*")
        .order("id", { ascending: true }),
      supabase
        .from("wellness_companies")
        .select("id,name,code")
        .order("id", { ascending: true }),
    ]);

    if (participantResult.error) {
      return fail(
        participantResult.error.message ||
          "Data peserta untuk Export JAKVAS gagal dimuat.",
        500,
      );
    }

    const participants = participantResult.data || [];
    const companyById = new Map<number, any>(
      (companyResult.data || []).map((company: any) => [
        Number(company?.id || 0),
        company,
      ]),
    );

    const results = await mapConcurrent(
      participants,
      6,
      async (participant: any) => {
        try {
          const report = await loadParticipantJakvasReport({
            supabase,
            participant,
          });
          return { participant, report, error: "" };
        } catch (error: any) {
          return {
            participant,
            report: null,
            error:
              error?.message || "Laporan JAKVAS peserta gagal dimuat.",
          };
        }
      },
    );

    const detailRows = results.map((item: any) => {
      const participant = item.participant || {};
      const report = item.report;
      const company =
        companyById.get(Number(participant?.company_id || 0)) || {};

      const gender = componentByKey(report, "gender");
      const age = componentByKey(report, "age");
      const bloodPressure = componentByKey(report, "blood_pressure");
      const bmi = componentByKey(report, "bmi");
      const smoking = componentByKey(report, "smoking");
      const diabetes = componentByKey(report, "diabetes");
      const activity = componentByKey(report, "physical_activity");

      return [
        Number(participant?.id || participant?.participant_id || 0),
        safeText(
          participant?.name ||
            participant?.employee_name ||
            participant?.full_name,
        ),
        safeText(
          participant?.code ||
            participant?.participant_code ||
            participant?.employee_code,
        ),
        safeText(
          company?.name ||
            participant?.company_name ||
            participant?.perusahaan_name,
        ),
        safeText(company?.code || participant?.company_code),
        safeText(
          participant?.group_name ||
            participant?.kelompok_name ||
            participant?.group ||
            participant?.kelompok,
        ),
        report ? yesNo(report?.eligible) : "",
        report ? yesNo(report?.complete) : "",
        report ? nullableNumber(report?.total_score) : "",
        safeText(report?.risk_category),
        safeText(report?.risk_label),
        safeText(report?.risk_10y_label),
        safeText(report?.recommendation),
        safeText((report?.missing_fields || []).join(", ")),
        safeText(gender?.value),
        nullableNumber(gender?.points),
        safeText(age?.value),
        nullableNumber(age?.points),
        safeText(bloodPressure?.value),
        nullableNumber(bloodPressure?.points),
        safeText(bmi?.value),
        nullableNumber(bmi?.points),
        safeText(smoking?.value),
        nullableNumber(smoking?.points),
        safeText(diabetes?.value),
        nullableNumber(diabetes?.points),
        yesNo(report?.profile?.prior_cvd),
        safeText(activity?.value),
        nullableNumber(activity?.points),
        safeText(report?.sources?.blood_pressure_date),
        safeText(report?.sources?.bmi_date),
        safeText(report?.sources?.self_report_updated_at),
        safeText(report?.sources?.latest_clinical_date),
        safeText(report?.engine_key),
        safeText(item.error),
      ];
    });

    const completeReports = results.filter(
      (item: any) => item.report?.complete === true,
    );
    const summaryRows: Array<Array<string | number>> = [
      ["Tanggal Export", jakartaDateTime()],
      [
        "Admin",
        safeText(user?.name || user?.username || user?.email || user?.id),
      ],
      ["Total Peserta", participants.length],
      ["JAKVAS Lengkap", completeReports.length],
      [
        "Risiko Rendah",
        results.filter(
          (item: any) => item.report?.risk_category === "low",
        ).length,
      ],
      [
        "Risiko Sedang",
        results.filter(
          (item: any) => item.report?.risk_category === "moderate",
        ).length,
      ],
      [
        "Risiko Tinggi",
        results.filter(
          (item: any) => item.report?.risk_category === "high",
        ).length,
      ],
      [
        "Belum Lengkap / Tidak Eligible",
        results.filter(
          (item: any) =>
            item.report && item.report?.complete !== true,
        ).length,
      ],
      [
        "Gagal Dimuat",
        results.filter((item: any) => Boolean(item.error)).length,
      ],
      [
        "Engine",
        "Canonical lib/wellness/jakvasServer.ts + lib/wellness/jakvas.ts",
      ],
    ];

    const workbook = XLSX.utils.book_new();
    workbook.Props = {
      Title: "Harmony Health - Export JAKVAS Seluruh Peserta",
      Subject: "Jakarta Cardiovascular Score",
      Author:
        clean(user?.name || user?.username) || "Harmony Health Admin",
      Company: "inHARMONY",
      CreatedDate: new Date(),
    };

    appendSheet(
      workbook,
      "Ringkasan",
      ["Indikator", "Nilai"],
      summaryRows,
      [34, 68],
    );

    appendSheet(
      workbook,
      "JAKVAS Peserta",
      [
        "Participant ID",
        "Nama",
        "Kode Peserta",
        "Perusahaan",
        "Kode Perusahaan",
        "Kelompok",
        "Eligible JAKVAS",
        "Data Lengkap",
        "Total Skor",
        "Kategori Risiko",
        "Label Risiko",
        "Risiko 10 Tahun",
        "Interpretasi / Rekomendasi",
        "Data Belum Lengkap",
        "Jenis Kelamin",
        "Poin Jenis Kelamin",
        "Umur",
        "Poin Umur",
        "Tekanan Darah",
        "Poin Tekanan Darah",
        "BMI / IMT",
        "Poin BMI",
        "Status Merokok",
        "Poin Merokok",
        "Diabetes",
        "Poin Diabetes",
        "Riwayat Kardiovaskular",
        "Aktivitas Fisik Mingguan",
        "Poin Aktivitas Fisik",
        "Tanggal TD Terakhir",
        "Tanggal BMI Terakhir",
        "Tanggal Self-report",
        "Tanggal Klinis Terakhir",
        "Engine JAKVAS",
        "Error",
      ],
      detailRows,
      [
        14, 28, 18, 30, 16, 24, 16, 14, 12, 16, 24, 18, 48, 32, 18, 18,
        16, 14, 20, 20, 14, 12, 24, 16, 16, 14, 24, 34, 20, 20, 20, 24,
        22, 28, 36,
      ],
    );

    const buffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
      compression: true,
    });

    const filename = `HarmonyHealth_JAKVAS_Seluruh_Peserta_${jakartaDateStamp()}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error: any) {
    return fail(
      error?.message || "Export JAKVAS Admin gagal dibuat.",
      500,
    );
  }
}

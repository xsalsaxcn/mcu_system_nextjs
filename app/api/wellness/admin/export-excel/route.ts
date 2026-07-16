import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

// WELLNESS_ADMIN_EXCEL_EXPORT_API_V79D
// Export uses the same Company Portal dashboard endpoint as the Admin UI,
// so points and rankings remain aligned with the backend source of truth.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeText(value: any) {
  const text = clean(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function isoDateTime(value = new Date()) {
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

function dateStamp(value = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(value).replace(/-/g, "");
}

function columnName(index: number) {
  let result = "";
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function makeSheet(
  headers: string[],
  rows: Array<Array<string | number | boolean | null>>,
  widths: number[],
) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map((_, index) => ({
    wch: widths[index] || 16,
  }));

  if (headers.length > 0) {
    const lastColumn = columnName(headers.length - 1);
    sheet["!autofilter"] = {
      ref: `A1:${lastColumn}${Math.max(rows.length + 1, 1)}`,
    };
  }

  return sheet;
}

async function getJson(url: string, cookie: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return {
    ...payload,
    http_status: response.status,
  };
}

export async function GET(request: NextRequest) {
  try {
    const daysParam = Number(request.nextUrl.searchParams.get("days") || 30);
    const days = Math.max(7, Math.min(365, Math.round(daysParam || 30)));
    const cookie = request.headers.get("cookie") || "";
    const origin = request.nextUrl.origin;

    const adminResult: any = await getJson(
      `${origin}/api/wellness/admin/dashboard`,
      cookie,
    );

    if (!adminResult?.ok) {
      return NextResponse.json(
        {
          ok: false,
          message:
            adminResult?.message || "Portal Admin belum dapat mengekspor Excel.",
        },
        { status: Number(adminResult?.http_status || 401) },
      );
    }

    const companies = adminResult.companies || [];
    const dashboardResults = await Promise.all(
      companies.map(async (company: any) => {
        const companyId = numberValue(company.id);
        if (!companyId) {
          return {
            ok: false,
            company,
            message: "Company ID tidak valid.",
          };
        }

        const result: any = await getJson(
          `${origin}/api/wellness/company/dashboard?company_id=${encodeURIComponent(
            String(companyId),
          )}&days=${days}`,
          cookie,
        );

        return {
          ...result,
          requested_company: company,
        };
      }),
    );

    const successful = dashboardResults.filter(
      (item: any) => item?.ok && item?.company?.id,
    );
    const failed = dashboardResults.filter((item: any) => !item?.ok);

    const workbook = XLSX.utils.book_new();
    workbook.Props = {
      Title: "Harmony Health Wellness Admin Report",
      Subject: `Wellness Admin Report ${days} Hari`,
      Author: clean(adminResult.admin?.name) || "Harmony Health Admin",
      Company: "inHARMONY",
      CreatedDate: new Date(),
    };

    const summaryRows: Array<Array<string | number>> = [
      ["Tanggal Export", isoDateTime()],
      ["Periode Ranking", `${days} hari`],
      ["Sumber Data", "Backend Portal Perusahaan · Supabase + Google Sheet"],
      ["Admin", safeText(adminResult.admin?.name || adminResult.admin?.username)],
      ["Role", safeText(adminResult.admin?.role)],
      ["Total Perusahaan", numberValue(adminResult.summary?.total_companies)],
      ["Total Peserta", numberValue(adminResult.summary?.total_participants)],
      ["Total Coach", numberValue(adminResult.summary?.total_coaches)],
      ["Total Kelompok", numberValue(adminResult.summary?.total_kelompok)],
      ["Perusahaan Berhasil Dimuat", successful.length],
      ["Perusahaan Gagal Dimuat", failed.length],
      [
        "Total Poin",
        successful.reduce(
          (sum: number, item: any) =>
            sum + numberValue(item.summary?.total_points),
          0,
        ),
      ],
      [
        "Green Flag",
        successful.reduce(
          (sum: number, item: any) =>
            sum + numberValue(item.summary?.flags?.green),
          0,
        ),
      ],
      [
        "Yellow Flag",
        successful.reduce(
          (sum: number, item: any) =>
            sum + numberValue(item.summary?.flags?.yellow),
          0,
        ),
      ],
      [
        "Red Flag",
        successful.reduce(
          (sum: number, item: any) =>
            sum + numberValue(item.summary?.flags?.red),
          0,
        ),
      ],
    ];

    XLSX.utils.book_append_sheet(
      workbook,
      makeSheet(["Indikator", "Nilai"], summaryRows, [34, 46]),
      "Ringkasan",
    );

    const companyRows = successful
      .map((item: any) => ({
        company: item.company,
        summary: item.summary || {},
      }))
      .sort((left: any, right: any) => {
        const scoreDifference =
          numberValue(right.summary?.average_group_score) -
          numberValue(left.summary?.average_group_score);
        if (scoreDifference !== 0) return scoreDifference;
        return (
          numberValue(right.summary?.total_points) -
          numberValue(left.summary?.total_points)
        );
      })
      .map((item: any, index: number) => [
        index + 1,
        safeText(item.company?.name),
        safeText(item.company?.code),
        numberValue(item.summary?.total_participants),
        numberValue(item.summary?.active_participants),
        numberValue(item.summary?.group_count),
        numberValue(item.summary?.coach_count),
        numberValue(item.summary?.average_group_score),
        numberValue(item.summary?.compliance_rate),
        numberValue(item.summary?.total_points),
        numberValue(item.summary?.flags?.green),
        numberValue(item.summary?.flags?.yellow),
        numberValue(item.summary?.flags?.red),
      ]);

    XLSX.utils.book_append_sheet(
      workbook,
      makeSheet(
        [
          "Peringkat",
          "Perusahaan",
          "Kode",
          "Peserta",
          "Peserta Aktif",
          "Kelompok",
          "Coach",
          "Capaian Kelompok (%)",
          "Kepatuhan (%)",
          "Total Poin",
          "Green",
          "Yellow",
          "Red",
        ],
        companyRows,
        [10, 30, 14, 12, 14, 12, 10, 20, 16, 14, 10, 10, 10],
      ),
      "Ranking Perusahaan",
    );

    const groupRows = successful
      .flatMap((item: any) =>
        (item.group_ranking || []).map((group: any) => ({
          company_name: item.company?.name,
          ...group,
        })),
      )
      .sort((left: any, right: any) => {
        const scoreDifference =
          numberValue(right.overall_score) - numberValue(left.overall_score);
        if (scoreDifference !== 0) return scoreDifference;
        return numberValue(right.total_points) - numberValue(left.total_points);
      })
      .map((group: any, index: number) => [
        index + 1,
        safeText(group.company_name),
        numberValue(group.rank),
        safeText(group.name),
        safeText(
          (group.coaches || []).map((coach: any) => coach.name).join(", "),
        ),
        numberValue(group.member_count),
        numberValue(group.overall_score),
        numberValue(group.diligence_percent),
        numberValue(group.nutrition_achievement_percent),
        numberValue(group.workout_achievement_percent),
        numberValue(group.health_improvement_percent),
        numberValue(group.healthtalk_points),
        numberValue(group.total_points),
        numberValue(group.flags?.green),
        numberValue(group.flags?.yellow),
        numberValue(group.flags?.red),
      ]);

    XLSX.utils.book_append_sheet(
      workbook,
      makeSheet(
        [
          "Peringkat Global",
          "Perusahaan",
          "Peringkat di Perusahaan",
          "Kelompok",
          "Coach",
          "Anggota",
          "Overall Score (%)",
          "Kerajinan (%)",
          "Nutrisi (%)",
          "Workout (%)",
          "Improvement (%)",
          "Health Talk Point",
          "Total Poin",
          "Green",
          "Yellow",
          "Red",
        ],
        groupRows,
        [14, 28, 20, 26, 26, 10, 18, 15, 14, 14, 17, 18, 14, 10, 10, 10],
      ),
      "Ranking Kelompok",
    );

    const participantCards = successful.flatMap((item: any) =>
      (item.participants || []).map((participant: any) => ({
        ...participant,
        company_name: item.company?.name,
        company_code: item.company?.code,
      })),
    );

    const participantRows = [...participantCards]
      .sort((left: any, right: any) => {
        const pointDifference =
          numberValue(right.total_points) - numberValue(left.total_points);
        if (pointDifference !== 0) return pointDifference;
        return numberValue(right.overall_score) - numberValue(left.overall_score);
      })
      .map((participant: any, index: number) => [
        index + 1,
        safeText(participant.name),
        safeText(participant.code),
        safeText(participant.company_name),
        safeText(participant.kelompok_name),
        safeText(participant.group_name),
        numberValue(participant.total_points),
        numberValue(participant.nutrition_points),
        numberValue(participant.workout_points),
        numberValue(participant.healthtalk_points),
        numberValue(participant.other_points),
        numberValue(participant.overall_score),
        numberValue(participant.diligence_percent),
        numberValue(participant.nutrition_achievement_percent),
        numberValue(participant.workout_achievement_percent),
        numberValue(participant.health_improvement_percent),
        numberValue(participant.current_streak),
        numberValue(participant.active_days),
        numberValue(participant.healthtalk_count),
        safeText(participant.flag_label || participant.flag),
        numberValue(participant.baseline?.weight),
        numberValue(participant.current?.weight),
        numberValue(participant.baseline?.bmi),
        numberValue(participant.current?.bmi),
        numberValue(participant.baseline?.waist),
        numberValue(participant.current?.waist),
        numberValue(participant.baseline?.hba1c),
        numberValue(participant.current?.hba1c),
        numberValue(participant.baseline?.sbp),
        numberValue(participant.current?.sbp),
      ]);

    XLSX.utils.book_append_sheet(
      workbook,
      makeSheet(
        [
          "Peringkat",
          "Nama",
          "Kode Peserta",
          "Perusahaan",
          "Kelompok",
          "Group",
          "Total Poin",
          "Poin Nutrisi",
          "Poin Workout",
          "Poin Health Talk",
          "Poin Lainnya",
          "Overall Score (%)",
          "Kerajinan (%)",
          "Capaian Nutrisi (%)",
          "Capaian Workout (%)",
          "Health Improvement (%)",
          "Streak (hari)",
          "Hari Aktif",
          "Health Talk",
          "Status Flag",
          "BB Baseline",
          "BB Current",
          "BMI Baseline",
          "BMI Current",
          "LP Baseline",
          "LP Current",
          "HbA1c Baseline",
          "HbA1c Current",
          "SBP Baseline",
          "SBP Current",
        ],
        participantRows,
        [
          10, 28, 18, 28, 24, 20, 13, 13, 14, 17, 14, 18, 15, 19, 19,
          21, 14, 12, 12, 16, 14, 14, 14, 14, 14, 14, 16, 16, 14, 14,
        ],
      ),
      "Ranking Peserta",
    );

    const flagRows = participantCards
      .filter((participant: any) => participant.flag !== "green")
      .sort((left: any, right: any) => {
        const priority = (flag: string) => (flag === "red" ? 2 : 1);
        const priorityDifference = priority(right.flag) - priority(left.flag);
        if (priorityDifference !== 0) return priorityDifference;
        return numberValue(left.diligence_percent) - numberValue(right.diligence_percent);
      })
      .map((participant: any, index: number) => [
        index + 1,
        safeText(participant.name),
        safeText(participant.code),
        safeText(participant.company_name),
        safeText(participant.kelompok_name),
        safeText(participant.group_name),
        safeText(participant.flag_label || participant.flag),
        numberValue(participant.diligence_percent),
        numberValue(participant.nutrition_achievement_percent),
        numberValue(participant.workout_achievement_percent),
        numberValue(participant.current_streak),
        numberValue(participant.active_days),
        numberValue(participant.total_points),
      ]);

    XLSX.utils.book_append_sheet(
      workbook,
      makeSheet(
        [
          "No",
          "Nama",
          "Kode Peserta",
          "Perusahaan",
          "Kelompok",
          "Group",
          "Status",
          "Kerajinan (%)",
          "Nutrisi (%)",
          "Workout (%)",
          "Streak",
          "Hari Aktif",
          "Total Poin",
        ],
        flagRows,
        [10, 28, 18, 28, 24, 20, 18, 15, 14, 14, 12, 12, 14],
      ),
      "Monitoring Flag",
    );

    const coachRows = successful
      .flatMap((item: any) =>
        (item.coaches || []).map((coach: any) => ({
          company_name: item.company?.name,
          ...coach,
        })),
      )
      .map((coach: any, index: number) => [
        index + 1,
        safeText(coach.name),
        safeText(coach.email),
        safeText(coach.company_name),
        safeText((coach.kelompok_names || []).join(", ")),
      ]);

    XLSX.utils.book_append_sheet(
      workbook,
      makeSheet(
        ["No", "Coach", "Email", "Perusahaan", "Kelompok"],
        coachRows,
        [10, 28, 30, 28, 38],
      ),
      "Coach",
    );

    const beforeAfterRows = successful.flatMap((item: any) =>
      (item.before_after || []).map((metric: any) => [
        safeText(item.company?.name),
        safeText(metric.label),
        safeText(metric.unit),
        numberValue(metric.baseline),
        numberValue(metric.current),
        numberValue(metric.delta),
        numberValue(metric.participant_count),
        numberValue(metric.improved_count),
      ]),
    );

    XLSX.utils.book_append_sheet(
      workbook,
      makeSheet(
        [
          "Perusahaan",
          "Parameter",
          "Satuan",
          "Baseline",
          "Current",
          "Delta",
          "Jumlah Peserta",
          "Membaik",
        ],
        beforeAfterRows,
        [28, 28, 12, 14, 14, 14, 16, 12],
      ),
      "Before After",
    );

    if (failed.length > 0) {
      const errorRows = failed.map((item: any, index: number) => [
        index + 1,
        safeText(item.requested_company?.name || item.company?.name),
        numberValue(item.http_status),
        safeText(item.message || "Data gagal dimuat."),
      ]);

      XLSX.utils.book_append_sheet(
        workbook,
        makeSheet(
          ["No", "Perusahaan", "HTTP Status", "Keterangan"],
          errorRows,
          [10, 30, 14, 56],
        ),
        "Data Gagal",
      );
    }

    const output = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
      compression: true,
    });
    const fileName = `Wellness_Admin_Report_${dateStamp()}_${days}hari.xlsx`;

    return new NextResponse(output, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || "Export Excel Portal Admin gagal.",
      },
      { status: 500 },
    );
  }
}

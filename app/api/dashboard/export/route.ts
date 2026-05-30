import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { computeStagesForParticipant } from "@/lib/server/progress";
import { computeMcuParticipantScoring2026, evaluateMcuGraduation2026 } from "@/lib/shared/capaskaScoring2026";

function isActive(value: any) {
  return value === 1 || value === true || value === "1" || value === null || value === undefined;
}

function getRuleForPackage(packageId: number, program: string, rules: any[]) {
  const specific = rules.find((rule) => Number(rule.package_id) === Number(packageId) && isActive(rule.is_active));
  if (specific) return specific;

  const programDefault = rules.find((rule) => !rule.package_id && String(rule.program_type || "") === program && isActive(rule.is_active));
  if (programDefault) return programDefault;

  return {
    pass_min_score: 0,
    pass_max_score: 999999,
    description: "Default"
  };
}


function isRegistrasiUlangDone(participant: any) {
  return participant?.registrasi_ulang_done === 1 ||
    participant?.registrasi_ulang_done === true ||
    participant?.registrasi_ulang_done === "1";
}

function normalizeDashboardStages(stages: any[], participant: any) {
  return (stages || [])
    .filter((stage) => {
      const name = String(stage.post_name || "").toLowerCase().trim();
      return !(name === "registrasi capaska" || name.startsWith("registrasi capaska"));
    })
    .map((stage) => {
      const name = String(stage.post_name || "").toLowerCase().trim();

      if (name === "registrasi ulang" && isRegistrasiUlangDone(participant)) {
        return {
          ...stage,
          filled_parameters: stage.total_parameters || 1,
          is_done: true,
          status_text: "Done",
          progress_text: "Done"
        };
      }

      return stage;
    });
}


function safeSheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const program = req.nextUrl.searchParams.get("program") || user.program_type || "capaska";
  const sourceId = req.nextUrl.searchParams.get("source_id") || "all";
  const status = req.nextUrl.searchParams.get("status") || "Semua";
  const type = req.nextUrl.searchParams.get("type") || "progress";

  let query = supabase
    .from("participants")
    .select("*")
    .order("id", { ascending: false })
    .limit(2000);

  if (program !== "all") query = query.eq("program_type", program);
  if (sourceId && sourceId !== "all") query = query.eq("source_id", Number(sourceId));

  const { data: participants, error } = await query;
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

  const participantRows = participants || [];
  const participantIds = participantRows.map((p: any) => Number(p.id));
  const packageIds = [...new Set(participantRows.map((p: any) => Number(p.package_id)).filter(Boolean))];

  const [
    packageParameters,
    parameters,
    posts,
    results,
    packages,
    sources,
    graduationRules
  ] = await Promise.all([
    packageIds.length ? supabase.from("package_parameters").select("*").in("package_id", packageIds) : Promise.resolve({ data: [] }),
    supabase.from("parameters").select("*").eq("is_active", 1),
    supabase.from("posts").select("*"),
    participantIds.length ? supabase.from("examination_results").select("*").in("participant_id", participantIds) : Promise.resolve({ data: [] }),
    supabase.from("packages").select("id,name,program_type"),
    supabase.from("participant_sources").select("id,name,institution_name"),
    supabase.from("graduation_rules").select("*")
  ]);

  const packageName = new Map((packages.data || []).map((p: any) => [Number(p.id), p.name]));
  const sourceMap = new Map((sources.data || []).map((s: any) => [Number(s.id), s]));
  const postName = new Map((posts.data || []).map((p: any) => [Number(p.id), p.name]));
  const paramById = new Map((parameters.data || []).map((p: any) => [Number(p.id), p]));

  const progressRows = participantRows.map((p: any) => {
    const stages = normalizeDashboardStages(
      computeStagesForParticipant(
        Number(p.id),
        Number(p.package_id),
        packageParameters.data || [],
        parameters.data || [],
        posts.data || [],
        results.data || []
      ),
      p
    );

    const done = stages.filter((s) => s.is_done).length;
    const total = stages.length;
    const complete = total > 0 && done >= total;
    const scoreResult = computeMcuParticipantScoring2026({
      participantId: Number(p.id),
      packageId: Number(p.package_id),
      packageParameters: packageParameters.data || [],
      parameters: parameters.data || [],
      results: results.data || [],
      program,
    });
    const totalScore = scoreResult.totalScore;
    const rule = getRuleForPackage(Number(p.package_id), program, graduationRules.data || []);
    const kelulusan = evaluateMcuGraduation2026(totalScore, complete, rule, scoreResult);
    const source = sourceMap.get(Number(p.source_id));

    return {
      "Nama": p.name,
      "No MCU": p.mcu_id || p.external_id || "-",
      "NIK": p.nik || "-",
      "NIK Karyawan": p.employee_nik || "-",
      "Jenis Kelamin": p.gender || "-",
      "Tanggal Lahir": p.birth_date || p.date_of_birth || "-",
      "Tanggal MCU": p.mcu_date || p.service_date || p.examination_date || p.exam_date || "-",
      "Database": source?.name || "-",
      "Instansi": source?.institution_name || "-",
      "Paket": packageName.get(Number(p.package_id)) || "-",
      "Status Progress": complete ? "Selesai" : "Belum Selesai",
      "Kelulusan": kelulusan,
      "Total Score": totalScore ?? "",
      "Score Sebelum Penalti": scoreResult.totalBeforePenalty ?? "",
      "Penalti Red Flag": scoreResult.penalty || 0,
      "Mata": scoreResult.domainScores.mata ?? "",
      "Gigi Mulut": scoreResult.domainScores.gigi_mulut ?? "",
      "THT": scoreResult.domainScores.tht ?? "",
      "Penyakit Dalam": scoreResult.domainScores.penyakit_dalam ?? "",
      "Jantung Pembuluh Darah": scoreResult.domainScores.jantung_pembuluh_darah ?? "",
      "Ortopedi": scoreResult.domainScores.ortopedi ?? "",
      "Radiologi": scoreResult.domainScores.radiologi ?? "",
      "Red Flag": scoreResult.redFlags.join(" | "),
      "Scoring Version": scoreResult.version,
      "Range Lulus Min": Number(rule?.pass_min_score ?? 0),
      "Range Lulus Max": Number(rule?.pass_max_score ?? 999999),
      "Stage Selesai": done,
      "Total Stage": total,
      "Progress %": total ? Math.round((done / total) * 1000) / 10 : 0
    };
  }).filter((r: any) => {
    if (status === "Selesai") return r["Status Progress"] === "Selesai";
    if (status === "Belum Selesai") return r["Status Progress"] !== "Selesai";
    if (status === "Lulus") return r["Kelulusan"] === "Lulus";
    if (status === "Tidak Lulus") return r["Kelulusan"] === "Tidak Lulus" || r["Kelulusan"] === "Tidak Direkomendasikan";
    if (status === "Belum Dinilai") return r["Kelulusan"] === "Belum Dinilai";
    return true;
  });

  const workbook = XLSX.utils.book_new();

  const summaryRows = [
    { Metric: "Total Peserta", Value: progressRows.length },
    { Metric: "Selesai", Value: progressRows.filter((r: any) => r["Status Progress"] === "Selesai").length },
    { Metric: "Belum Selesai", Value: progressRows.filter((r: any) => r["Status Progress"] !== "Selesai").length },
    { Metric: "Lulus", Value: progressRows.filter((r: any) => r["Kelulusan"] === "Lulus").length },
    { Metric: "Tidak Lulus", Value: progressRows.filter((r: any) => r["Kelulusan"] === "Tidak Lulus" || r["Kelulusan"] === "Tidak Direkomendasikan").length },
    { Metric: "Tidak Direkomendasikan", Value: progressRows.filter((r: any) => r["Kelulusan"] === "Tidak Direkomendasikan").length },
    { Metric: "Belum Dinilai", Value: progressRows.filter((r: any) => r["Kelulusan"] === "Belum Dinilai").length }
  ];

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "Ringkasan");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(progressRows), "Progress Peserta");

  if (type === "full") {
    const resultRows = (results.data || []).map((r: any) => {
      const parameter = paramById.get(Number(r.parameter_id));
      const participant = participantRows.find((p: any) => Number(p.id) === Number(r.participant_id));
      const source = sourceMap.get(Number(participant?.source_id));
      const post = parameter ? postName.get(Number(parameter.post_id)) : "-";

      return {
        "Nama": participant?.name || "-",
        "No MCU": participant?.mcu_id || participant?.external_id || "-",
        "Database": source?.name || "-",
        "Paket": packageName.get(Number(participant?.package_id)) || "-",
        "Post/Station": post || "-",
        "Parameter": parameter?.name || "-",
        "Value": r.value ?? "",
        "Updated At": r.updated_at || r.created_at || ""
      };
    });

    const completedParticipantCodes = new Set(
      progressRows
        .filter((row: any) => row["Status Progress"] === "Selesai")
        .map((row: any) => String(row["No MCU"]))
    );

    const wideRows = participantRows
      .filter((participant: any) => {
        const participantCode = String(participant.mcu_id || participant.external_id || "-");
        return completedParticipantCodes.has(participantCode);
      })
      .map((participant: any) => {
        const participantCode = participant.mcu_id || participant.external_id || "-";
        const progressInfo = progressRows.find((row: any) => String(row["No MCU"]) === String(participantCode));

        const row: any = {
          "Nama": participant.name,
          "No MCU": participantCode,
          "Database": sourceMap.get(Number(participant.source_id))?.name || "-",
          "Paket": packageName.get(Number(participant.package_id)) || "-",
          "Status Progress": progressInfo?.["Status Progress"] || "Selesai",
          "Kelulusan": progressInfo?.["Kelulusan"] || "",
          "Total Score": progressInfo?.["Total Score"] ?? "",
          "Score Sebelum Penalti": progressInfo?.["Score Sebelum Penalti"] ?? "",
          "Penalti Red Flag": progressInfo?.["Penalti Red Flag"] ?? "",
          "Mata": progressInfo?.["Mata"] ?? "",
          "Gigi Mulut": progressInfo?.["Gigi Mulut"] ?? "",
          "THT": progressInfo?.["THT"] ?? "",
          "Penyakit Dalam": progressInfo?.["Penyakit Dalam"] ?? "",
          "Jantung Pembuluh Darah": progressInfo?.["Jantung Pembuluh Darah"] ?? "",
          "Ortopedi": progressInfo?.["Ortopedi"] ?? "",
          "Radiologi": progressInfo?.["Radiologi"] ?? "",
          "Red Flag": progressInfo?.["Red Flag"] ?? "",
          "Scoring Version": progressInfo?.["Scoring Version"] ?? "",
          "Progress %": progressInfo?.["Progress %"] ?? 100
        };

        (results.data || [])
          .filter((r: any) => Number(r.participant_id) === Number(participant.id))
          .forEach((r: any) => {
            const parameter = paramById.get(Number(r.parameter_id));
            const post = parameter ? postName.get(Number(parameter.post_id)) : "-";
            const key = `${post || "-"} - ${parameter?.name || r.parameter_id}`;
            row[key] = r.value ?? "";
          });

        return row;
      });

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(resultRows), "Hasil Pemeriksaan");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(wideRows), safeSheetName("Hasil Wide Selesai"));
  }

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const filename = type === "full" ? "hasil-pemeriksaan-lengkap.xlsx" : "dashboard-progress-kelulusan.xlsx";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}

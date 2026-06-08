import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { computeStagesForParticipant } from "@/lib/server/progress";
import {
  CAPASKA_DOMAIN_RULES,
  computeMcuParticipantScoring2026,
  evaluateMcuGraduation2026,
  isCapaskaValueOrScoreParameter,
  scoreCapaskaDirectChoice,
} from "@/lib/shared/capaskaDirectScoring2026";

function isActive(value: any) {
  return value === 1 || value === true || value === "1" || value === null || value === undefined;
}

function normalizeProgram(value: any) {
  return String(value || "").trim().toLowerCase();
}

function getRuleForPackage(packageId: number, program: string, rules: any[]) {
  const specific = rules.find((rule) => Number(rule.package_id) === Number(packageId) && isActive(rule.is_active));
  if (specific) return specific;

  const programDefault = rules.find((rule) => !rule.package_id && normalizeProgram(rule.program_type) === normalizeProgram(program) && isActive(rule.is_active));
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


function capaskaDashboardProgressNormV153(value: any) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaDashboardParamTextV153(param: any) {
  return capaskaDashboardProgressNormV153([
    param?.name,
    param?.label,
    param?.title,
    param?.parameter,
    param?.param_name,
    param?.question,
    param?.id,
  ].filter(Boolean).join(" "));
}

function canonicalCapaskaDashboardStageParamsV153(params: any[]) {
  const list = Array.isArray(params) ? params : [];
  const cleaned: any[] = [];
  let seenRhinitisLividae = false;
  let seenHipospadiaHidrokel = false;

  for (const param of list) {
    const text = capaskaDashboardParamTextV153(param);

    if ((/rhinitis|rinitis/.test(text)) && (/lividae|divide|dividae/.test(text))) {
      if (seenRhinitisLividae) continue;
      seenRhinitisLividae = true;
      cleaned.push(param);
      continue;
    }

    if (/hipospadia/.test(text)) {
      if (seenHipospadiaHidrokel) continue;
      seenHipospadiaHidrokel = true;
      cleaned.push(param);
      continue;
    }

    if (/hidrokel/.test(text) && !/hipospadia/.test(text)) {
      continue;
    }

    cleaned.push(param);
  }

  return cleaned;
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

function formatTimestamp(value: any) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("day")}/${pick("month")}/${pick("year")} ${pick("hour")}:${pick("minute")}:${pick("second")} WIB`;
}

function makeKey(...parts: any[]) {
  return parts.map((part) => String(part || "").trim()).join("::");
}

function numericSort(value: any, fallback = 999999) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function setWorksheetLayout(ws: XLSX.WorkSheet, headerCount: number, rowCount: number) {
  ws["!cols"] = Array.from({ length: headerCount }).map((_, index) => ({
    wch: index < 2 ? 22 : 18,
  }));

  if (headerCount > 0 && rowCount >= 0) {
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rowCount, 1), c: headerCount - 1 } })
    };
  }
}

function appendJsonSheet(workbook: XLSX.WorkBook, rows: any[], sheetName: string, headers?: string[]) {
  const headerList = headers || Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headerList });
  setWorksheetLayout(worksheet, headerList.length, rows.length);
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(sheetName));
}

function makeGroupedWideSheet(args: {
  rows: any[];
  identityHeaders: string[];
  resultHeaders: string[];
  scoreHeaders: string[];
  domainHeaders: string[];
  infoHeaders: string[];
  finalHeaders: string[];
}) {
  const { rows, identityHeaders, resultHeaders, scoreHeaders, domainHeaders, infoHeaders, finalHeaders } = args;
  const headers = [...identityHeaders, ...resultHeaders, ...scoreHeaders, ...domainHeaders, ...infoHeaders, ...finalHeaders];

  const groupRow: string[] = [];
  const addGroup = (label: string, count: number) => {
    for (let i = 0; i < count; i += 1) groupRow.push(i === 0 ? label : "");
  };

  addGroup("Data Peserta", identityHeaders.length);
  addGroup("Hasil Pertanyaan", resultHeaders.length);
  addGroup("Skor Per Pertanyaan", scoreHeaders.length);
  addGroup("Skor Pemeriksaan", domainHeaders.length);
  addGroup("Info", infoHeaders.length);
  addGroup("Final", finalHeaders.length);

  const dataRows = rows.map((row) => headers.map((header) => row[header] ?? ""));
  const worksheet = XLSX.utils.aoa_to_sheet([groupRow, headers, ...dataRows]);

  const merges: XLSX.Range[] = [];
  let cursor = 0;
  for (const count of [identityHeaders.length, resultHeaders.length, scoreHeaders.length, domainHeaders.length, infoHeaders.length, finalHeaders.length]) {
    if (count > 1) merges.push({ s: { r: 0, c: cursor }, e: { r: 0, c: cursor + count - 1 } });
    cursor += count;
  }
  worksheet["!merges"] = merges;
  worksheet["!cols"] = headers.map((header) => {
    if (header === "Red Flag") return { wch: 42 };
    if (header.startsWith("Hasil - ")) return { wch: 28 };
    if (header.startsWith("Skor - ")) return { wch: 22 };
    if (header === "Total Skor Akhir") return { wch: 18 };
    return { wch: 18 };
  });
  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: Math.max(rows.length + 1, 1), c: Math.max(headers.length - 1, 0) } })
  };

  return worksheet;
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const program = req.nextUrl.searchParams.get("program") || user.program_type || "capaska";
  const isCapaskaProgram = normalizeProgram(program) === "capaska";
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
  const postById = new Map((posts.data || []).map((p: any) => [Number(p.id), p]));
  const paramById = new Map((parameters.data || []).map((p: any) => [Number(p.id), p]));
  const participantById = new Map(participantRows.map((p: any) => [Number(p.id), p]));

  const resultByParticipantParam = new Map<string, any>();
  (results.data || []).forEach((result: any) => {
    resultByParticipantParam.set(makeKey(Number(result.participant_id), Number(result.parameter_id)), result);
  });

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
      program: String(p.program_type || program || ""),
    });
    const totalScore = scoreResult.totalScore;
    const rule = getRuleForPackage(Number(p.package_id), program, graduationRules.data || []);
    const kelulusan = evaluateMcuGraduation2026(totalScore, complete, rule, scoreResult);
    const source = sourceMap.get(Number(p.source_id));

    return {
      "Participant ID": Number(p.id),
      "Package ID": Number(p.package_id),
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

  appendJsonSheet(workbook, summaryRows, "Ringkasan", ["Metric", "Value"]);

  // Sheet Progress Peserta sengaja tidak dibuat untuk export CAPASKA supaya file lebih ringkas.
  // Corporate MCU / Vaksinasi tetap memakai sheet progress lama agar flow lain tidak berubah.
  if (!isCapaskaProgram) {
    const progressHeaders = Object.keys(progressRows[0] || {}).filter((header) => header !== "Participant ID" && header !== "Package ID");
    appendJsonSheet(workbook, progressRows.map(({ "Participant ID": _pid, "Package ID": _pkg, ...row }: any) => row), "Progress Peserta", progressHeaders);
  }

  if (type === "full") {
    const resultRows = (results.data || [])
      .map((r: any) => {
        const parameter = paramById.get(Number(r.parameter_id));
        const participant = participantById.get(Number(r.participant_id));
        if (!participant || !parameter) return null;
        if (isCapaskaProgram && isCapaskaValueOrScoreParameter(parameter)) return null;

        const source = sourceMap.get(Number(participant?.source_id));
        const post = parameter ? postName.get(Number(parameter.post_id)) : "-";
        const value = r.value ?? "";

        return {
          "Nama": participant?.name || "-",
          "No MCU": participant?.mcu_id || participant?.external_id || "-",
          "Database": source?.name || "-",
          "Paket": packageName.get(Number(participant?.package_id)) || "-",
          "Post/Station": post || "-",
          "Kategori": parameter?.category || "-",
          "Parameter": parameter?.name || "-",
          "Hasil": value,
          ...(isCapaskaProgram ? { "Skor": value ? scoreCapaskaDirectChoice(parameter, String(value)) : "" } : {}),
          "Updated At": formatTimestamp(r.updated_at || r.created_at || "")
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const nameCompare = String(a["Nama"]).localeCompare(String(b["Nama"]));
        if (nameCompare) return nameCompare;
        const postA = String(a["Post/Station"] || "");
        const postB = String(b["Post/Station"] || "");
        const postCompare = postA.localeCompare(postB);
        if (postCompare) return postCompare;
        return String(a["Parameter"] || "").localeCompare(String(b["Parameter"] || ""));
      });

    const resultHeaders = isCapaskaProgram
      ? ["Nama", "No MCU", "Database", "Paket", "Post/Station", "Kategori", "Parameter", "Hasil", "Skor", "Updated At"]
      : ["Nama", "No MCU", "Database", "Paket", "Post/Station", "Kategori", "Parameter", "Hasil", "Updated At"];

    appendJsonSheet(workbook, resultRows as any[], "Hasil Pemeriksaan", resultHeaders);

    const completedProgressRows = progressRows.filter((row: any) =>
      row["Status Progress"] === "Selesai" && Number(row["Progress %"] || 0) >= 100
    );

    const completedParticipantIds = new Set(completedProgressRows.map((row: any) => Number(row["Participant ID"])));

    const exportParameters = Array.from(new Map(
      (packageParameters.data || [])
        .filter((pp: any) => packageIds.includes(Number(pp.package_id)))
        .map((pp: any) => paramById.get(Number(pp.parameter_id)))
        .filter((param: any) => param && (!isCapaskaProgram || !isCapaskaValueOrScoreParameter(param)))
        .sort((a: any, b: any) => {
          const postA = postById.get(Number(a.post_id));
          const postB = postById.get(Number(b.post_id));
          const postOrderCompare = numericSort(postA?.sort_order) - numericSort(postB?.sort_order);
          if (postOrderCompare) return postOrderCompare;
          const postNameCompare = String(postA?.name || "").localeCompare(String(postB?.name || ""));
          if (postNameCompare) return postNameCompare;
          const paramOrderCompare = numericSort(a.sort_order) - numericSort(b.sort_order);
          if (paramOrderCompare) return paramOrderCompare;
          return String(a.name || "").localeCompare(String(b.name || ""));
        })
        .map((param: any) => [Number(param.id), param])
    ).values());

    if (isCapaskaProgram) {
      const identityHeaders = ["Nama", "No MCU", "NIK", "Jenis Kelamin", "Database", "Instansi", "Paket", "Status Progress", "Kelulusan"];
      const resultWideHeaders = exportParameters.map((param: any) => `Hasil - ${postName.get(Number(param.post_id)) || "Post"} - ${param.name}`);
      const scoreWideHeaders = exportParameters.map((param: any) => `Skor - ${postName.get(Number(param.post_id)) || "Post"} - ${param.name}`);
      const domainHeaders = [
        "Skor Mata",
        "Skor Gigi Mulut",
        "Skor THT",
        "Skor Penyakit Dalam",
        "Skor Jantung Pembuluh Darah",
        "Skor Ortopedi",
        "Skor Radiologi",
      ];
      const infoHeaders = ["Red Flag", "Scoring Version", "Progress %"];
      const finalHeaders = ["Total Skor Akhir"];

      const wideRows = participantRows
        .filter((participant: any) => completedParticipantIds.has(Number(participant.id)))
        .map((participant: any) => {
          const progressInfo = completedProgressRows.find((row: any) => Number(row["Participant ID"]) === Number(participant.id));
          const row: any = {
            "Nama": participant.name,
            "No MCU": participant.mcu_id || participant.external_id || "-",
            "NIK": participant.nik || "-",
            "Jenis Kelamin": participant.gender || "-",
            "Database": sourceMap.get(Number(participant.source_id))?.name || "-",
            "Instansi": sourceMap.get(Number(participant.source_id))?.institution_name || "-",
            "Paket": packageName.get(Number(participant.package_id)) || "-",
            "Status Progress": progressInfo?.["Status Progress"] || "Selesai",
            "Kelulusan": progressInfo?.["Kelulusan"] || "",
          };

          exportParameters.forEach((param: any) => {
            const postLabel = postName.get(Number(param.post_id)) || "Post";
            const valueHeader = `Hasil - ${postLabel} - ${param.name}`;
            const scoreHeader = `Skor - ${postLabel} - ${param.name}`;
            const result = resultByParticipantParam.get(makeKey(Number(participant.id), Number(param.id)));
            const value = String(result?.value ?? "").trim();
            row[valueHeader] = value;
            row[scoreHeader] = value ? scoreCapaskaDirectChoice(param, value) : "";
          });

          row["Skor Mata"] = progressInfo?.["Mata"] ?? "";
          row["Skor Gigi Mulut"] = progressInfo?.["Gigi Mulut"] ?? "";
          row["Skor THT"] = progressInfo?.["THT"] ?? "";
          row["Skor Penyakit Dalam"] = progressInfo?.["Penyakit Dalam"] ?? "";
          row["Skor Jantung Pembuluh Darah"] = progressInfo?.["Jantung Pembuluh Darah"] ?? "";
          row["Skor Ortopedi"] = progressInfo?.["Ortopedi"] ?? "";
          row["Skor Radiologi"] = progressInfo?.["Radiologi"] ?? "";
          row["Red Flag"] = progressInfo?.["Red Flag"] || "";
          row["Scoring Version"] = progressInfo?.["Scoring Version"] || "";
          row["Progress %"] = progressInfo?.["Progress %"] ?? 100;
          // Sengaja diletakkan paling akhir sesuai request.
          row["Total Skor Akhir"] = progressInfo?.["Total Score"] ?? "";

          return row;
        });

      const wideWorksheet = makeGroupedWideSheet({
        rows: wideRows,
        identityHeaders,
        resultHeaders: resultWideHeaders,
        scoreHeaders: scoreWideHeaders,
        domainHeaders,
        infoHeaders,
        finalHeaders,
      });
      XLSX.utils.book_append_sheet(workbook, wideWorksheet, safeSheetName("Hasil Wide Selesai"));
    } else {
      const completedParticipantCodes = new Set(
        completedProgressRows.map((row: any) => String(row["No MCU"]))
      );

      const wideRows = participantRows
        .filter((participant: any) => {
          const participantCode = String(participant.mcu_id || participant.external_id || "-");
          return completedParticipantCodes.has(participantCode);
        })
        .map((participant: any) => {
          const participantCode = participant.mcu_id || participant.external_id || "-";
          const progressInfo = completedProgressRows.find((row: any) => String(row["No MCU"]) === String(participantCode));

          const row: any = {
            "Nama": participant.name,
            "No MCU": participantCode,
            "Database": sourceMap.get(Number(participant.source_id))?.name || "-",
            "Paket": packageName.get(Number(participant.package_id)) || "-",
            "Status Progress": progressInfo?.["Status Progress"] || "Selesai",
            "Kelulusan": progressInfo?.["Kelulusan"] || "",
            "Total Score": progressInfo?.["Total Score"] ?? "",
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

      appendJsonSheet(workbook, wideRows, "Hasil Wide Selesai");
    }
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


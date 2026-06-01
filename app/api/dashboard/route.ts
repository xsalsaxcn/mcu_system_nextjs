import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { computeStagesForParticipant } from "@/lib/server/progress";
import { fail, ok } from "@/lib/server/response";
import { computeMcuParticipantScoring2026, evaluateMcuGraduation2026 } from "@/lib/shared/capaskaDirectScoring2026";

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
    description: "Default: lulus jika score berada dalam range 0 - 999999"
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


export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const supabase = getSupabaseAdmin();
  const program = req.nextUrl.searchParams.get("program") || user.program_type || "capaska";
  const sourceId = req.nextUrl.searchParams.get("source_id");
  const status = req.nextUrl.searchParams.get("status") || "Semua";
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") || 300), 1), 1000);

  let query = supabase
    .from("participants")
    .select("*")
    .order("id", { ascending: false })
    .limit(limit);

  if (program !== "all") query = query.eq("program_type", program);
  if (sourceId && sourceId !== "all") query = query.eq("source_id", Number(sourceId));

  const { data: participants, error } = await query;
  if (error) return fail(error.message, 500);

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

  const rows = participantRows.map((p: any) => {
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
      participant_id: p.id,
      name: p.name,
      mcu_id: p.mcu_id,
      external_id: p.external_id,
      nik: p.nik,
      employee_nik: p.employee_nik,
      gender: p.gender,
      birth_date: p.birth_date || p.date_of_birth,
      province: p.province,
      source_id: p.source_id,
      source_name: source?.name || "-",
      institution_name: source?.institution_name || "-",
      package_name: packageName.get(Number(p.package_id)) || "-",
      package_id: p.package_id,
      mcu_date: p.mcu_date || p.service_date || p.examination_date || p.exam_date || "-",
      status_pemeriksaan: complete ? "Selesai" : "Belum Selesai",
      done_stage: done,
      total_stage: total,
      progress_percent: total ? Math.round((done / total) * 1000) / 10 : 0,
      total_score: totalScore,
      kelulusan_status: kelulusan,
      pass_min_score: Number(rule?.pass_min_score ?? 0),
      pass_max_score: Number(rule?.pass_max_score ?? 999999),
      scoring_version: scoreResult.version,
      score_before_penalty: scoreResult.totalBeforePenalty,
      score_penalty: scoreResult.penalty,
      capaska_domain_scores: scoreResult.domainScores,
      capaska_domain_max_scores: scoreResult.domainMaxScores,
      capaska_red_flags: scoreResult.redFlags,
      capaska_not_recommended: scoreResult.notRecommended,
      stages
    };
  });

  const filtered = rows.filter((r) => {
    if (status === "Selesai") return r.status_pemeriksaan === "Selesai";
    if (status === "Belum Selesai") return r.status_pemeriksaan !== "Selesai";
    if (status === "Lulus") return r.kelulusan_status === "Lulus";
    if (status === "Tidak Lulus") return r.kelulusan_status === "Tidak Lulus" || r.kelulusan_status === "Tidak Direkomendasikan";
    if (status === "Belum Dinilai") return r.kelulusan_status === "Belum Dinilai";
    return true;
  });

  const completedRows = rows.filter((r) => r.status_pemeriksaan === "Selesai");
  const lulusRows = rows.filter((r) => r.kelulusan_status === "Lulus");
  const tidakLulusRows = rows.filter((r) => r.kelulusan_status === "Tidak Lulus" || r.kelulusan_status === "Tidak Direkomendasikan");
  const tidakDirekomendasikanRows = rows.filter((r) => r.kelulusan_status === "Tidak Direkomendasikan");
  const belumDinilaiRows = rows.filter((r) => r.kelulusan_status === "Belum Dinilai");

  return ok({
    summary: {
      total: rows.length,
      selesai: completedRows.length,
      belum_selesai: rows.filter((r) => r.status_pemeriksaan !== "Selesai").length,
      lulus: lulusRows.length,
      tidak_lulus: tidakLulusRows.length,
      tidak_direkomendasikan: tidakDirekomendasikanRows.length,
      belum_dinilai: belumDinilaiRows.length,
      rata_rata: rows.length ? Math.round((rows.reduce((a, b) => a + b.progress_percent, 0) / rows.length) * 10) / 10 : 0
    },
    rows: filtered,
    lulus_rows: lulusRows.slice(0, 200),
    tidak_lulus_rows: tidakLulusRows.slice(0, 200),
    completed_rows: completedRows.slice(0, 200),
    rule_count: graduationRules.data?.length || 0
  });
}

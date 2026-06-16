import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import { computeCapaskaDerivedValues, computeMcuParticipantScoring2026 } from "@/lib/shared/capaskaDirectScoring2026";

function normalizeProgram(value: any) {
  return String(value || "").trim().toLowerCase();
}


function includeInProgress(parameter: any) {
  try {
    const raw = parameter?.config_json;
    const config = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
    if (config && typeof config === "object" && config.include_in_progress === false) return false;
  } catch {}
  return true;
}

function isScoreHelperParameter(parameterName: any) {
  const name = String(parameterName || "").toLowerCase().trim();
  return (
    name.startsWith("value ") ||
    name.startsWith("nilai ") ||
    name.startsWith("score ") ||
    name.startsWith("total score") ||
    name.includes("score total") ||
    name.includes("total skor") ||
    name.includes("skor total")
  );
}

function isFinalScoreParameter(parameterName: any) {
  const name = String(parameterName || "").toLowerCase().trim();
  return (
    name.startsWith("total score") ||
    name.startsWith("score total") ||
    name.includes("score total") ||
    name.includes("total skor") ||
    name.includes("skor total")
  );
}

function toNumberOrNull(value: any) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(",", ".").replace(/[^0-9.\-]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function nonEmptyValue(value: any) {
  return String(value ?? "").trim() !== "";
}

async function enrichParticipants(args: {
  supabase: any;
  participants: any[];
}) {
  const { supabase, participants } = args;
  if (!participants.length) return participants;

  const packageIds = Array.from(new Set(participants.map((p) => Number(p.package_id)).filter(Boolean)));
  const sourceIds = Array.from(new Set(participants.map((p) => Number(p.source_id)).filter(Boolean)));
  const companyIds = Array.from(new Set(participants.map((p) => Number(p.company_id)).filter(Boolean)));

  const [packages, sources, companies] = await Promise.all([
    packageIds.length
      ? supabase.from("packages").select("id,name").in("id", packageIds)
      : Promise.resolve({ data: [] }),
    sourceIds.length
      ? supabase.from("participant_sources").select("id,name,institution_name").in("id", sourceIds)
      : Promise.resolve({ data: [] }),
    companyIds.length
      ? supabase.from("companies").select("id,name").in("id", companyIds)
      : Promise.resolve({ data: [] }),
  ]);

  const packageMap = new Map<number, string>((packages.data || []).map((x: any) => [Number(x.id), String(x.name || "-")]));
  const sourceMap = new Map<number, { name?: string; institution_name?: string }>((sources.data || []).map((x: any) => [Number(x.id), { name: x.name, institution_name: x.institution_name }]));
  const companyMap = new Map<number, string>((companies.data || []).map((x: any) => [Number(x.id), String(x.name || "-")]));

  return participants.map((p: any) => ({
    ...p,
    package_name: packageMap.get(Number(p.package_id)) || "-",
    source_name: sourceMap.get(Number(p.source_id))?.name || "-",
    institution_name: sourceMap.get(Number(p.source_id))?.institution_name || "-",
    company_name: companyMap.get(Number(p.company_id)) || "-",
  }));
}

async function attachCapaskaOperatorScores(args: {
  supabase: any;
  participants: any[];
  program: string;
  user: any;
  listMode: boolean;
}) {
  const { supabase, participants, program, user, listMode } = args;

  /* OPERATOR_DONE_EDIT_LOADER_V255
     Read-only score display fix.
     - Does not change save/scoring/database.
     - Prefer saved final score row for the operator post.
     - Fallback to derived score from current post parameters.
     - Read rows by input_post_id OR parameter_id to tolerate old/new saved data. */
  if (!listMode || program !== "capaska" || !participants.length || !user?.post_id) return participants;

  const postId = Number(user.post_id);
  const participantIds = participants.map((p) => Number(p.id)).filter(Boolean);
  const packageIds = Array.from(new Set(participants.map((p) => Number(p.package_id)).filter(Boolean)));
  if (!postId || !participantIds.length || !packageIds.length) return participants;

  const { data: postParams, error: paramError } = await supabase
    .from("parameters")
    .select("*")
    .eq("post_id", postId)
    .eq("is_active", 1)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (paramError || !postParams?.length) return participants;

  const postParamIds = (postParams || []).map((p: any) => Number(p.id)).filter(Boolean);
  const finalScoreParamIds = new Set(
    (postParams || [])
      .filter((p: any) => isFinalScoreParameter(p.name))
      .map((p: any) => Number(p.id))
      .filter(Boolean)
  );

  const queryByInputPost = supabase
    .from("examination_results")
    .select("participant_id,parameter_id,value,input_post_id,updated_at,created_at")
    .in("participant_id", participantIds)
    .eq("input_post_id", postId);

  const queryByParameter = postParamIds.length
    ? supabase
        .from("examination_results")
        .select("participant_id,parameter_id,value,input_post_id,updated_at,created_at")
        .in("participant_id", participantIds)
        .in("parameter_id", postParamIds)
    : Promise.resolve({ data: [] });

  const [byInputPost, byParameter] = await Promise.all([queryByInputPost, queryByParameter]);
  if ((byInputPost as any)?.error || (byParameter as any)?.error) return participants;

  const merged = new Map<string, any>();
  for (const row of [...((byInputPost as any).data || []), ...((byParameter as any).data || [])]) {
    const key = String(row?.id ?? `${row?.participant_id}-${row?.parameter_id}-${row?.input_post_id ?? ""}`);
    if (!merged.has(key)) merged.set(key, row);
  }

  const rowsByParticipant = new Map<number, any[]>();
  for (const row of merged.values()) {
    const participantId = Number(row?.participant_id);
    if (!participantId) continue;
    if (!rowsByParticipant.has(participantId)) rowsByParticipant.set(participantId, []);
    rowsByParticipant.get(participantId)!.push(row);
  }

  return participants.map((participant: any) => {
    const rows = rowsByParticipant.get(Number(participant.id)) || [];
    const rawValues: Record<string, string> = {};
    let savedFinalScore: number | null = null;
    let latestAt = "";

    for (const row of rows) {
      const parameterId = Number(row?.parameter_id);
      const value = String(row?.value ?? "").trim();
      if (!parameterId || !value) continue;

      if (postParamIds.includes(parameterId)) rawValues[String(parameterId)] = value;

      if (finalScoreParamIds.has(parameterId)) {
        const parsed = toNumberOrNull(value);
        if (parsed !== null) savedFinalScore = parsed;
      }

      const rowLatest = String(row?.updated_at || row?.created_at || "");
      if (rowLatest > latestAt) latestAt = rowLatest;
    }

    const derivedValues = computeCapaskaDerivedValues(postParams || [], rawValues);
    const finalScoreParam = (postParams || []).find((param: any) => isFinalScoreParameter(param.name));
    const derivedFinalScore = finalScoreParam ? toNumberOrNull(derivedValues[String(finalScoreParam.id)]) : null;
    /* OPERATOR_DONE_SCORE_ZERO_FALLBACK_V260
       Read-only display fix: if an old hidden Score Total row is saved as 0
       but current answers derive a non-zero score, show the derived score instead.
    */
    const finalScore =
      savedFinalScore !== null && !(savedFinalScore === 0 && derivedFinalScore !== null && derivedFinalScore !== 0)
        ? savedFinalScore
        : derivedFinalScore;

    return {
      ...participant,
      operator_final_score: finalScore,
      operator_final_score_label: finalScore === null ? "-" : String(finalScore),
      operator_latest_updated_at: participant.operator_latest_updated_at || latestAt || null,
    };
  });
}

async function getCapaskaDoneParticipants(args: {
  supabase: any;
  user: any;
  program: string;
  sourceId: string | null;
  limit: number;
}) {
  const { supabase, user, program, sourceId, limit } = args;

  /* OPERATOR_DONE_LIST_DASHBOARD_STYLE_V259
     Read-only done-list loader.
     Prinsipnya mengikuti dashboard: daftar selesai operator diambil dari semua
     examination_results untuk input_post_id post operator, dengan paging range 1000 row.
     Ini memperbaiki kasus Supabase/PostgREST hanya mengembalikan batch pertama
     sehingga Ortopedi tampil 53 padahal database punya 128 peserta tersimpan.
     Tidak menulis database, tidak mengubah save, scoring, setup parameter, mapping, atau UI. */
  if (program !== "capaska" || !user?.post_id) {
    return { participants: [], has_more: false };
  }

  const postId = Number(user.post_id);

  const { data: postParams, error: paramError } = await supabase
    .from("parameters")
    .select("id,name,post_id,sort_order,config_json,input_type,is_active")
    .eq("post_id", postId)
    .eq("is_active", 1)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (paramError) throw new Error(paramError.message);

  const inputParams = (postParams || []).filter((p: any) => includeInProgress(p) && !isScoreHelperParameter(p.name));
  const inputParamIds = inputParams.map((p: any) => Number(p.id)).filter(Boolean);
  const postParamIds = (postParams || []).map((p: any) => Number(p.id)).filter(Boolean);
  if (!postParamIds.length) return { participants: [], has_more: false };

  const selectCols = "id,participant_id,parameter_id,value,updated_at,created_at,input_post_id";
  const pageSize = 1000;
  const maxPages = 80;

  async function fetchPagedRowsV259(makeQuery: () => any) {
    const allRows: any[] = [];
    for (let page = 0; page < maxPages; page++) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const res = await makeQuery().range(from, to);
      if (res?.error) throw new Error(res.error.message);
      const rows = Array.isArray(res?.data) ? res.data : [];
      allRows.push(...rows);
      if (rows.length < pageSize) break;
    }
    return allRows;
  }

  const rowsByInputPost = await fetchPagedRowsV259(() =>
    supabase
      .from("examination_results")
      .select(selectCols)
      .eq("input_post_id", postId)
      .order("id", { ascending: true })
  );

  const rowsByParameter = await fetchPagedRowsV259(() =>
    supabase
      .from("examination_results")
      .select(selectCols)
      .in("parameter_id", postParamIds)
      .order("id", { ascending: true })
  );

  const merged = new Map<string, any>();
  for (const row of [...rowsByInputPost, ...rowsByParameter]) {
    if (!nonEmptyValue(row?.value)) continue;
    const key = String(row?.id ?? `${row?.participant_id}-${row?.parameter_id}-${row?.input_post_id ?? ""}`);
    if (!merged.has(key)) merged.set(key, row);
  }

  const resultByParticipant = new Map<number, Map<number, string>>();
  const totalRowsByParticipant = new Map<number, number>();
  const latestByParticipant = new Map<number, string>();

  for (const row of merged.values()) {
    const participantId = Number(row.participant_id);
    const parameterId = Number(row.parameter_id);
    if (!participantId || !parameterId) continue;

    totalRowsByParticipant.set(participantId, (totalRowsByParticipant.get(participantId) || 0) + 1);

    if (inputParamIds.includes(parameterId)) {
      if (!resultByParticipant.has(participantId)) resultByParticipant.set(participantId, new Map());
      resultByParticipant.get(participantId)!.set(parameterId, String(row.value ?? "").trim());
    }

    const updatedAt = String(row.updated_at || row.created_at || "");
    const currentLatest = latestByParticipant.get(participantId) || "";
    if (updatedAt > currentLatest) latestByParticipant.set(participantId, updatedAt);
  }

  const candidateParticipantIds = Array.from(totalRowsByParticipant.keys());
  if (!candidateParticipantIds.length) return { participants: [], has_more: false };

  async function fetchParticipantsByIdsV259(ids: number[]) {
    const out: any[] = [];
    const chunkSize = 500;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from("participants")
        .select("id,name,mcu_id,external_id,nik,barcode_value,province,package_id,source_id,company_id,program_type")
        .in("id", chunk)
        .eq("program_type", "capaska");
      if (error) throw new Error(error.message);
      out.push(...(data || []));
    }
    return out;
  }

  let filteredCandidates = await fetchParticipantsByIdsV259(candidateParticipantIds);
  if (sourceId && sourceId !== "all") {
    filteredCandidates = filteredCandidates.filter((p: any) => Number(p.source_id) === Number(sourceId));
  }

  const doneParticipants = filteredCandidates
    .filter((participant: any) => {
      const rowsCount = totalRowsByParticipant.get(Number(participant.id)) || 0;
      return rowsCount > 0;
    })
    .map((participant: any) => ({
      ...participant,
      is_done_for_operator: true,
      operator_latest_updated_at: latestByParticipant.get(Number(participant.id)) || null,
      operator_saved_result_count: totalRowsByParticipant.get(Number(participant.id)) || 0,
      operator_main_answer_count: resultByParticipant.get(Number(participant.id))?.size || 0,
    }))
    .sort((a: any, b: any) => {
      const latestA = String(a.operator_latest_updated_at || "");
      const latestB = String(b.operator_latest_updated_at || "");
      if (latestA !== latestB) return latestA < latestB ? 1 : -1;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });

  // Keep UI unchanged but return the full operator done set for current event scale.
  // If a future event exceeds 1000 done participants, the API reports has_more.
  const responseLimit = Math.max(1000, Number(limit) || 0);
  const limited = doneParticipants.slice(0, responseLimit);

  const enriched = await enrichParticipants({ supabase, participants: limited });
  const participantsWithScores = await attachCapaskaOperatorScores({
    supabase,
    participants: enriched,
    program,
    user,
    listMode: true,
  });

  const scoredWithSavedTotalsV259 = await attachSavedOperatorScoreTotalV253({
    supabase,
    participants: participantsWithScores,
    program,
    user,
    postId,
    listMode: true,
  });

  return {
    participants: scoredWithSavedTotalsV259,
    has_more: doneParticipants.length > limited.length,
  };
}

/* OPERATOR_DONE_SCORE_DASHBOARD_RECOMPUTE_V263
   Read-only score preview fix for operator done-list.
   The operator list keeps the exact same UI and edit flow, but the displayed score
   is recalculated with the same CAPASKA scoring engine used by the admin dashboard.
   This prevents legacy hidden rows such as "Score total ... = 0" from hiding the
   real stage score. No database writes, no save changes, no setup/mapping changes.
*/
function normalizePostNameForScoreV263(value: any) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaDomainKeyFromPostNameV263(value: any): string | null {
  const text = normalizePostNameForScoreV263(value);
  if (!text) return null;
  if (text.includes("mata")) return "mata";
  if (text.includes("gigi") || text.includes("dental")) return "gigi_mulut";
  if (text.includes("tht")) return "tht";
  if (text.includes("penyakit") || text.includes("dalam")) return "penyakit_dalam";
  if (text.includes("jantung") || text.includes("pembuluh")) return "jantung_pembuluh_darah";
  if (text.includes("ortopedi") || text.includes("orthopedi")) return "ortopedi";
  if (text.includes("radiologi") || text.includes("rontgen")) return "radiologi";
  return null;
}

function toNumberV263(value: any): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().replace(",", ".").replace(/[^0-9.\-]/g, "");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function isTotalScoreNameV263(value: any) {
  const name = normalizePostNameForScoreV263(value);
  return name.startsWith("score total") ||
    name.startsWith("total score") ||
    name.includes("score total") ||
    name.includes("total score") ||
    name.includes("skor total");
}

function isComponentScoreNameV263(value: any) {
  const name = normalizePostNameForScoreV263(value);
  if (!name || isTotalScoreNameV263(name)) return false;
  return name.startsWith("score ") || name.startsWith("skor ");
}

async function fetchPagedResultsForParticipantIdsV263(supabase: any, participantIds: number[]) {
  const allRows: any[] = [];
  const chunkSize = 250;
  const pageSize = 1000;
  const maxPages = 100;

  for (let i = 0; i < participantIds.length; i += chunkSize) {
    const chunk = participantIds.slice(i, i + chunkSize);
    for (let page = 0; page < maxPages; page++) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from("examination_results")
        .select("participant_id,parameter_id,value,input_post_id,updated_at,created_at")
        .in("participant_id", chunk)
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw new Error(error.message);
      const rows = Array.isArray(data) ? data : [];
      allRows.push(...rows);
      if (rows.length < pageSize) break;
    }
  }

  return allRows;
}

async function attachSavedOperatorScoreTotalV253(args: any) {
  const supabase = args?.supabase;
  const participants = Array.isArray(args?.participants) ? args.participants : [];
  const postId = Number(args?.postId ?? args?.post_id ?? args?.user?.post_id ?? args?.effectivePostId ?? 0);

  if (!supabase || !participants.length || !postId) return participants;

  const participantIds = participants
    .map((p: any) => Number(p?.id))
    .filter((id: number) => Number.isFinite(id) && id > 0);
  if (!participantIds.length) return participants;

  const { data: postRow } = await supabase
    .from("posts")
    .select("id,name")
    .eq("id", postId)
    .maybeSingle();
  const domainKey = capaskaDomainKeyFromPostNameV263(postRow?.name || postId);

  const packageIds = Array.from(
    new Set(participants.map((p: any) => Number(p?.package_id)).filter((id: number) => Number.isFinite(id) && id > 0))
  );

  let packageParameters: any[] = [];
  let parameters: any[] = [];

  if (packageIds.length) {
    const { data: ppRows, error: ppError } = await supabase
      .from("package_parameters")
      .select("package_id,parameter_id")
      .in("package_id", packageIds);
    if (!ppError && Array.isArray(ppRows)) packageParameters = ppRows;

    const parameterIds = Array.from(
      new Set(packageParameters.map((pp: any) => Number(pp?.parameter_id)).filter((id: number) => Number.isFinite(id) && id > 0))
    );

    if (parameterIds.length) {
      const paramChunks: any[] = [];
      const chunkSize = 800;
      for (let i = 0; i < parameterIds.length; i += chunkSize) {
        const chunk = parameterIds.slice(i, i + chunkSize);
        const { data: paramRows, error: paramError } = await supabase
          .from("parameters")
          .select("*")
          .in("id", chunk);
        if (!paramError && Array.isArray(paramRows)) paramChunks.push(...paramRows);
      }
      parameters = paramChunks;
    }
  }

  const allResults = await fetchPagedResultsForParticipantIdsV263(supabase, participantIds);

  const paramById = new Map<number, any>();
  for (const param of parameters || []) paramById.set(Number(param?.id), param);

  const rowsByParticipant = new Map<number, any[]>();
  const postRowsByParticipant = new Map<number, any[]>();

  for (const row of allResults) {
    const participantId = Number(row?.participant_id);
    if (!participantId) continue;

    if (!rowsByParticipant.has(participantId)) rowsByParticipant.set(participantId, []);
    rowsByParticipant.get(participantId)!.push(row);

    const param = paramById.get(Number(row?.parameter_id));
    const belongsToPost = Number(row?.input_post_id) === postId || Number(param?.post_id) === postId;
    if (belongsToPost) {
      if (!postRowsByParticipant.has(participantId)) postRowsByParticipant.set(participantId, []);
      postRowsByParticipant.get(participantId)!.push(row);
    }
  }

  const packageParamsByPackage = new Map<number, any[]>();
  for (const pp of packageParameters || []) {
    const packageId = Number(pp?.package_id);
    if (!packageParamsByPackage.has(packageId)) packageParamsByPackage.set(packageId, []);
    packageParamsByPackage.get(packageId)!.push(pp);
  }

  return participants.map((participant: any) => {
    const participantId = Number(participant?.id);
    const packageId = Number(participant?.package_id);
    const stageRows = postRowsByParticipant.get(participantId) || [];
    const participantResults = rowsByParticipant.get(participantId) || [];

    let dashboardStageScore: number | null = null;
    if (domainKey && stageRows.length && packageId && parameters.length && packageParameters.length) {
      try {
        const scoring = computeMcuParticipantScoring2026({
          participantId,
          packageId,
          packageParameters,
          parameters,
          results: participantResults,
          program: "capaska",
        } as any);
        const rawScore = toNumberV263((scoring as any)?.domainScores?.[domainKey]);
        if (rawScore !== null) dashboardStageScore = rawScore;
      } catch {
        dashboardStageScore = null;
      }
    }

    let savedTotal: number | null = null;
    let savedNonZeroTotal: number | null = null;
    let componentSum: number | null = null;

    for (const row of stageRows) {
      const param = paramById.get(Number(row?.parameter_id));
      const name = String(param?.name || "");
      const numeric = toNumberV263(row?.value);
      if (numeric === null) continue;

      if (isTotalScoreNameV263(name)) {
        savedTotal = numeric;
        if (numeric !== 0) savedNonZeroTotal = numeric;
      } else if (isComponentScoreNameV263(name)) {
        componentSum = (componentSum || 0) + numeric;
      }
    }

    let effectiveScore: number | null = null;

    // Prefer the dashboard scoring engine. If legacy names prevent dashboard scoring
    // from finding the domain, fall back to saved non-zero total / component score.
    if (dashboardStageScore !== null && dashboardStageScore !== 0) effectiveScore = dashboardStageScore;
    else if (savedNonZeroTotal !== null) effectiveScore = savedNonZeroTotal;
    else if (componentSum !== null && componentSum !== 0) effectiveScore = componentSum;
    else if (dashboardStageScore !== null) effectiveScore = dashboardStageScore;
    else if (savedTotal !== null) effectiveScore = savedTotal;

    if (effectiveScore === null) return participant;

    const label = String(effectiveScore);
    return {
      ...participant,
      score: effectiveScore,
      total_score: effectiveScore,
      final_score: effectiveScore,
      stage_score: effectiveScore,
      operator_score: effectiveScore,
      score_akhir: effectiveScore,
      operator_final_score: effectiveScore,
      operator_final_score_label: label,
      score_label: label,
      final_score_label: label,
      saved_total_score_v253: savedTotal,
      score_component_sum_v261: componentSum,
      dashboard_stage_score_v263: dashboardStageScore,
      operator_done_score_source_v263: dashboardStageScore !== null ? "dashboard_recompute" : (savedNonZeroTotal !== null ? "saved_total" : (componentSum !== null ? "component_sum" : "saved_total_zero")),
    };
  });
}
export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const supabase = getSupabaseAdmin();
  const keyword = String(req.nextUrl.searchParams.get("keyword") || "").trim();
  const program = normalizeProgram(req.nextUrl.searchParams.get("program") || user.program_type || "capaska") || "capaska";
  const sourceId = req.nextUrl.searchParams.get("source_id");
  const listMode = req.nextUrl.searchParams.get("list") === "1" || req.nextUrl.searchParams.get("mode") === "list";
  const doneOnly = req.nextUrl.searchParams.get("done") === "1" || String(req.nextUrl.searchParams.get("status") || "").toLowerCase() === "done";
  const requestedLimit = Number(req.nextUrl.searchParams.get("limit") || (listMode ? 80 : 50));
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), listMode ? 100 : 100);

  if (listMode && doneOnly && program === "capaska") {
    try {
      return ok(await getCapaskaDoneParticipants({
        supabase,
        user,
        program,
        sourceId,
        limit,
      }));
    } catch (error: any) {
      return fail(error?.message || "Gagal memuat daftar peserta selesai.", 500);
    }
  }

  // Search biasa tetap butuh keyword supaya tombol Cari Peserta tidak tiba-tiba
  // membuka semua peserta. Khusus daftar operator, frontend mengirim done=1
  // dan diproses lewat cabang ringan di atas.
  if (!keyword && !listMode) return ok({ participants: [] });

  const escaped = keyword.replace(/,/g, " ");
  const like = `%${escaped}%`;

  let query = supabase
    .from("participants")
    .select("id,name,mcu_id,external_id,nik,barcode_value,province,package_id,source_id,company_id,program_type")
    .order("name", { ascending: true })
    .limit(limit);

  if (keyword) {
    query = query.or(`name.ilike.${like},mcu_id.ilike.${like},external_id.ilike.${like},nik.ilike.${like},barcode_value.ilike.${like},province.ilike.${like}`);
  }

  if (program !== "all") query = query.eq("program_type", program);
  if (sourceId && sourceId !== "all") query = query.eq("source_id", Number(sourceId));

  const { data, error } = await query;

  if (error) return fail(error.message, 500);

  const participants = await enrichParticipants({ supabase, participants: data || [] });
  const participantsWithScores = await attachCapaskaOperatorScores({
    supabase,
    participants,
    program,
    user,
    listMode,
  });
  const participantsWithSavedTotalsV253 = await attachSavedOperatorScoreTotalV253({
    supabase,
    participants: participantsWithScores,
    program,
    user,
    listMode,
  });

  return ok({ participants: participantsWithSavedTotalsV253, has_more: false });
}

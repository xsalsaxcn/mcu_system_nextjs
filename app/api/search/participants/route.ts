import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import { computeCapaskaDerivedValues } from "@/lib/shared/capaskaDirectScoring2026";

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
    const finalScore = savedFinalScore !== null ? savedFinalScore : derivedFinalScore;

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

/* OPERATOR_DONE_MISSING_HELPER_V256
   Build-safety helper for the done-list score preview.
   Read-only: reads examination_results + parameters and returns the same participant list
   with saved score-total display fields when a Score/Total Score row exists for the operator post.
   Does not write database, save results, change scoring, or change setup parameters.
*/
async function attachSavedOperatorScoreTotalV253(args: any) {
  const supabase = args?.supabase;
  const participants = Array.isArray(args?.participants) ? args.participants : [];
  const postId = Number(args?.postId ?? args?.post_id ?? args?.user?.post_id ?? args?.effectivePostId ?? 0);

  if (!supabase || !participants.length || !postId) return participants;

  const participantIds = participants.map((p: any) => Number(p?.id)).filter((id: number) => Number.isFinite(id) && id > 0);
  if (!participantIds.length) return participants;

  const { data: rows, error } = await supabase
    .from("examination_results")
    .select("participant_id,parameter_id,value,input_post_id,updated_at,created_at")
    .in("participant_id", participantIds)
    .eq("input_post_id", postId)
    .limit(Math.min(30000, Math.max(5000, participantIds.length * 80)));

  if (error || !Array.isArray(rows) || !rows.length) return participants;

  const parameterIds = Array.from(new Set(rows.map((r: any) => Number(r?.parameter_id)).filter((id: number) => Number.isFinite(id) && id > 0)));
  if (!parameterIds.length) return participants;

  const { data: params, error: paramError } = await supabase
    .from("parameters")
    .select("id,name,category,post_id")
    .in("id", parameterIds);

  if (paramError || !Array.isArray(params)) return participants;

  const paramById = new Map<number, any>();
  for (const param of params) paramById.set(Number(param?.id), param);

  const savedScoreByParticipant = new Map<number, number>();

  for (const row of rows) {
    const participantId = Number(row?.participant_id);
    const param = paramById.get(Number(row?.parameter_id));
    const name = String(param?.name || "").trim().toLowerCase();
    const valueNumber = Number(row?.value);

    const isScoreTotal =
      name.startsWith("score total") ||
      name.startsWith("total score") ||
      name.includes("score total") ||
      name.includes("skor total");

    if (!isScoreTotal || !Number.isFinite(valueNumber)) continue;

    const previous = savedScoreByParticipant.get(participantId);
    if (previous === undefined || valueNumber > previous) {
      savedScoreByParticipant.set(participantId, valueNumber);
    }
  }

  if (!savedScoreByParticipant.size) return participants;

  return participants.map((participant: any) => {
    const participantId = Number(participant?.id);
    const savedScore = savedScoreByParticipant.get(participantId);
    if (savedScore === undefined) return participant;

    return {
      ...participant,
      score: savedScore,
      total_score: savedScore,
      final_score: savedScore,
      stage_score: savedScore,
      operator_score: savedScore,
      score_akhir: savedScore,
      operator_final_score: savedScore,
      saved_total_score_v253: savedScore,
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

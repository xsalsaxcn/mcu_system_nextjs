import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import { computeCapaskaDerivedValues } from "@/lib/shared/capaskaDirectScoring2026";

function normalizeProgram(value: any) {
  return String(value || "").trim().toLowerCase();
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

  // Hanya aktif di mode daftar CAPASKA operator. Corporate MCU dan Vaksinasi tidak disentuh.
  if (!listMode || program !== "capaska" || !participants.length || !user?.post_id) return participants;

  const participantIds = participants.map((p) => Number(p.id)).filter(Boolean);
  const packageIds = Array.from(new Set(participants.map((p) => Number(p.package_id)).filter(Boolean)));
  if (!participantIds.length || !packageIds.length) return participants;

  const { data: mappings, error: mappingError } = await supabase
    .from("package_parameters")
    .select("package_id,parameter_id")
    .in("package_id", packageIds);

  if (mappingError) return participants;

  const allParameterIds = Array.from(new Set((mappings || []).map((m: any) => Number(m.parameter_id)).filter(Boolean)));
  if (!allParameterIds.length) return participants;

  const { data: params, error: paramError } = await supabase
    .from("parameters")
    .select("*")
    .in("id", allParameterIds)
    .eq("post_id", Number(user.post_id))
    .eq("is_active", 1)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (paramError || !params?.length) return participants;

  const activePostParameterIds = (params || []).map((p: any) => Number(p.id)).filter(Boolean);

  const { data: results, error: resultError } = await supabase
    .from("examination_results")
    .select("participant_id,parameter_id,value")
    .in("participant_id", participantIds)
    .in("parameter_id", activePostParameterIds);

  if (resultError) return participants;

  const mappingsByPackage = new Map<number, Set<number>>();
  for (const m of mappings || []) {
    const packageId = Number(m.package_id);
    const parameterId = Number(m.parameter_id);
    if (!mappingsByPackage.has(packageId)) mappingsByPackage.set(packageId, new Set());
    mappingsByPackage.get(packageId)!.add(parameterId);
  }

  const paramsByPackage = new Map<number, any[]>();
  for (const packageId of packageIds) {
    const allowed = mappingsByPackage.get(packageId) || new Set<number>();
    paramsByPackage.set(
      packageId,
      (params || []).filter((p: any) => allowed.has(Number(p.id)))
    );
  }

  const resultsByParticipant = new Map<number, Record<string, string>>();
  for (const r of results || []) {
    const participantId = Number(r.participant_id);
    if (!resultsByParticipant.has(participantId)) resultsByParticipant.set(participantId, {});
    resultsByParticipant.get(participantId)![String(r.parameter_id)] = String(r.value ?? "").trim();
  }

  return participants.map((participant) => {
    const packageId = Number(participant.package_id);
    const participantParams = paramsByPackage.get(packageId) || [];
    const rawValues = resultsByParticipant.get(Number(participant.id)) || {};
    const derivedValues = computeCapaskaDerivedValues(participantParams, rawValues);

    const finalScoreParam = participantParams.find((param: any) => isFinalScoreParameter(param.name));
    const finalScore = finalScoreParam ? toNumberOrNull(derivedValues[String(finalScoreParam.id)]) : null;

    return {
      ...participant,
      operator_final_score: finalScore,
      operator_final_score_label: finalScore === null ? "-" : String(finalScore),
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

  if (program !== "capaska" || !user?.post_id) {
    return { participants: [], has_more: false };
  }

  const { data: postParams, error: paramError } = await supabase
    .from("parameters")
    .select("id,name,post_id,sort_order,config_json,input_type,is_active")
    .eq("post_id", Number(user.post_id))
    .eq("is_active", 1)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (paramError) throw new Error(paramError.message);

  const inputParams = (postParams || []).filter((p: any) => !isScoreHelperParameter(p.name));
  const inputParamIds = inputParams.map((p: any) => Number(p.id)).filter(Boolean);
  if (!inputParamIds.length) return { participants: [], has_more: false };

  // Ambil hasil hanya untuk parameter post operator ini.
  // Ini menghindari N+1 request ke /api/participant untuk setiap peserta.
  const resultRowLimit = Math.min(10000, Math.max(1500, limit * inputParamIds.length * 8));
  const { data: resultRows, error: resultError } = await supabase
    .from("examination_results")
    .select("participant_id,parameter_id,value,updated_at")
    .in("parameter_id", inputParamIds)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(resultRowLimit);

  if (resultError) throw new Error(resultError.message);

  const resultByParticipant = new Map<number, Map<number, string>>();
  const latestByParticipant = new Map<number, string>();

  for (const row of resultRows || []) {
    if (!nonEmptyValue(row.value)) continue;

    const participantId = Number(row.participant_id);
    const parameterId = Number(row.parameter_id);
    if (!participantId || !parameterId) continue;

    if (!resultByParticipant.has(participantId)) resultByParticipant.set(participantId, new Map());
    resultByParticipant.get(participantId)!.set(parameterId, String(row.value ?? "").trim());

    const updatedAt = String(row.updated_at || "");
    const currentLatest = latestByParticipant.get(participantId) || "";
    if (updatedAt > currentLatest) latestByParticipant.set(participantId, updatedAt);
  }

  const candidateParticipantIds = Array.from(resultByParticipant.keys());
  if (!candidateParticipantIds.length) return { participants: [], has_more: false };

  const { data: candidates, error: participantError } = await supabase
    .from("participants")
    .select("id,name,mcu_id,external_id,nik,barcode_value,province,package_id,source_id,company_id,program_type")
    .in("id", candidateParticipantIds)
    .eq("program_type", "capaska");

  if (participantError) throw new Error(participantError.message);

  let filteredCandidates = candidates || [];
  if (sourceId && sourceId !== "all") {
    filteredCandidates = filteredCandidates.filter((p: any) => Number(p.source_id) === Number(sourceId));
  }

  const packageIds = Array.from(new Set(filteredCandidates.map((p: any) => Number(p.package_id)).filter(Boolean)));
  if (!packageIds.length) return { participants: [], has_more: false };

  const { data: packageParameters, error: mappingError } = await supabase
    .from("package_parameters")
    .select("package_id,parameter_id")
    .in("package_id", packageIds)
    .in("parameter_id", inputParamIds);

  if (mappingError) throw new Error(mappingError.message);

  const requiredParamsByPackage = new Map<number, number[]>();
  for (const mapping of packageParameters || []) {
    const packageId = Number(mapping.package_id);
    const parameterId = Number(mapping.parameter_id);
    if (!requiredParamsByPackage.has(packageId)) requiredParamsByPackage.set(packageId, []);
    requiredParamsByPackage.get(packageId)!.push(parameterId);
  }

  const doneParticipants = filteredCandidates
    .filter((participant: any) => {
      const packageId = Number(participant.package_id);
      const requiredParameterIds = requiredParamsByPackage.get(packageId) || [];
      if (!requiredParameterIds.length) return false;

      const results = resultByParticipant.get(Number(participant.id)) || new Map<number, string>();
      return requiredParameterIds.every((parameterId) => nonEmptyValue(results.get(parameterId)));
    })
    .map((participant: any) => ({
      ...participant,
      is_done_for_operator: true,
      operator_latest_updated_at: latestByParticipant.get(Number(participant.id)) || null,
    }))
    .sort((a: any, b: any) => {
      const latestA = String(a.operator_latest_updated_at || "");
      const latestB = String(b.operator_latest_updated_at || "");
      if (latestA !== latestB) return latestA < latestB ? 1 : -1;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });

  const limited = doneParticipants.slice(0, limit);
  const enriched = await enrichParticipants({ supabase, participants: limited });
  const scored = await attachCapaskaOperatorScores({
    supabase,
    participants: enriched,
    program,
    user,
    listMode: true,
  });

  return {
    participants: scored,
    has_more: doneParticipants.length > limited.length,
  };
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

  return ok({ participants: participantsWithScores, has_more: false });
}

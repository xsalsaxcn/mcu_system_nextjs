import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import { computeCapaskaDerivedValues } from "@/lib/shared/capaskaDirectScoring2026";

function normalizeProgram(value: any) {
  return String(value || "").trim().toLowerCase();
}

function stringifyValues(values: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(values || {}).map(([key, value]) => [key, String(value ?? "").trim()])
  ) as Record<string, string>;
}

function capaskaRouteThtNormV161(value: any) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[â€“â€”]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaRouteThtCompactV161(value: any) {
  return capaskaRouteThtNormV161(value).replace(/\s+/g, "");
}

function capaskaRouteThtParamTextV161(param: any) {
  return capaskaRouteThtNormV161([
    param?.name,
    param?.label,
    param?.title,
    param?.parameter,
    param?.param_name,
    param?.question,
    param?.category,
    param?.post_name,
    param?.stage_name,
    param?.station_name,
    param?.id,
  ].filter(Boolean).join(" "));
}

function capaskaRouteThtCanonicalKeyV161(param: any): string | null {
  const text = capaskaRouteThtParamTextV161(param);

  if (/membran.*timpani|timpani/.test(text)) return "membran";
  if (/serumen/.test(text)) return "serumen";
  if (/rhinitis|rinitis|lividae|divide|dividae|bividas/.test(text)) return "rhinitis";
  if (/tonsil/.test(text)) return "tonsil";
  if (/epistaksis|epistaxis/.test(text)) return "epistaksis";
  if (/garputala|weber/.test(text)) return "weber";

  return null;
}

function capaskaRouteIsScoreFieldV161(param: any) {
  const name = String(param?.name || "").toLowerCase().trim();
  return name.startsWith("score ") || name.startsWith("total score") || name.includes("score total");
}

function capaskaRouteThtScoreV161(param: any, rawValue: any): number | null {
  const key = capaskaRouteThtCanonicalKeyV161(param);
  if (!key) return null;

  const value = capaskaRouteThtNormV161(rawValue);
  const compact = capaskaRouteThtCompactV161(rawValue);

  if (!value) return null;

  if (key === "membran") {
    if (/tidakintak|tidakintac|tidakintact/.test(compact)) return -10;
    if (/intak|intac|intact/.test(compact)) return 2;
  }

  if (key === "serumen") {
    if (/tidakada|tidakterdapat|\(-\)|negatif|negative/.test(compact)) return 2;
    if (/adaserumen|ada|\(\+\)|positif|positive/.test(compact)) return 1;
  }

  if (key === "rhinitis") {
    if (/negatif|negative|\(-\)|tidakada/.test(compact)) return 2;
    if (/positif|positive|\(\+\)|ada/.test(compact)) return 1;
  }

  if (key === "tonsil") {
    if (/tonsilektomi/.test(compact)) return 2;
    if (/t0\/?t1-?t1|t0\/?t1|t0-?t1|t1-?t1|t1\/?t1|t0t1t1/.test(compact)) return 2;
    if (/t2a/.test(compact)) return 1;
    if (/t2b/.test(compact)) return -1;
    if (/t3/.test(compact)) return -10;
  }

  if (key === "epistaksis") {
    if (/tidakada|tidakterdapat|\(-\)|negatif|negative/.test(compact)) return 1;
    if (/ada|\(\+\)|positif|positive/.test(compact)) return -1;
  }

  if (key === "weber") {
    if (/tidaknormal|abnormal/.test(compact)) return -10;
    if (/normal/.test(compact)) return 1;
  }

  return null;
}

function capaskaRouteApplyThtBackendTotalV161(parameters: any[], values: Record<string, string>) {
  const list = Array.isArray(parameters) ? parameters : [];
  const nextValues = { ...(values || {}) };

  const requiredKeys = ["membran", "serumen", "rhinitis", "tonsil", "epistaksis", "weber"];
  const seen = new Set<string>();
  let total = 0;

  for (const param of list) {
    const key = capaskaRouteThtCanonicalKeyV161(param);
    if (!key || seen.has(key)) continue;

    const selected = nextValues[String(param?.id)];
    const score = capaskaRouteThtScoreV161(param, selected);

    if (typeof score !== "number" || !Number.isFinite(score)) continue;

    seen.add(key);
    total += score;
  }

  const hasAllThtKeys = requiredKeys.every((key) => seen.has(key));
  if (!hasAllThtKeys) return nextValues;

  const scoreFields = list.filter((param) => capaskaRouteIsScoreFieldV161(param));
  for (const scoreField of scoreFields) {
    nextValues[String(scoreField.id)] = String(total);
  }

  return nextValues;
}

async function maybeComputeCapaskaBackendValues(args: {
  supabase: any;
  participantId: number;
  postId: number;
  values: Record<string, string>;
}) {
  const { supabase, participantId, postId, values } = args;

  const { data: participant, error: participantError } = await supabase
    .from("participants")
    .select("id,package_id,program_type")
    .eq("id", participantId)
    .maybeSingle();

  if (participantError || !participant) return values;

  let programType = normalizeProgram(participant.program_type);

  if (programType !== "capaska" && participant.package_id) {
    const { data: pkg } = await supabase
      .from("packages")
      .select("id,program_type")
      .eq("id", Number(participant.package_id))
      .maybeSingle();

    programType = normalizeProgram(pkg?.program_type || programType);
  }

  // Backend scoring ini sengaja hanya aktif untuk CAPASKA.
  // Corporate MCU dan Vaksinasi tetap memakai flow lama.
  if (programType !== "capaska" || !participant.package_id) return values;

  const { data: mappings, error: mappingError } = await supabase
    .from("package_parameters")
    .select("parameter_id")
    .eq("package_id", Number(participant.package_id));

  if (mappingError) return values;

  const ids = (mappings || []).map((m: any) => Number(m.parameter_id)).filter(Boolean);
  if (!ids.length) return values;

  const { data: parameters, error: parameterError } = await supabase
    .from("parameters")
    .select("*")
    .in("id", ids)
    .eq("post_id", postId)
    .eq("is_active", 1)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (parameterError || !parameters?.length) return values;

  const backendValues = computeCapaskaDerivedValues(parameters || [], values);
  return capaskaRouteApplyThtBackendTotalV161(parameters || [], backendValues);
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const participantId = Number(body.participant_id);
  const postId = Number(body.post_id || user.post_id);
  const rawValues = body.values || {};

  if (!participantId || !postId) return fail("participant_id dan post_id wajib.");

  if (user.role === "operator" && Number(user.post_id) !== postId) {
    return fail("Operator hanya boleh input di post sendiri.", 403);
  }

  const supabase = getSupabaseAdmin();
  const inputValues = stringifyValues(rawValues);
  const values = await maybeComputeCapaskaBackendValues({ supabase, participantId, postId, values: inputValues });

  // bulkSaveResultsV173:
  // Previous version did SELECT + UPDATE/INSERT one by one for every parameter.
  // That makes the UI popup stay too long. This version:
  // 1. fetches all existing results in one query,
  // 2. bulk inserts new results,
  // 3. updates changed existing rows in parallel,
  // 4. bulk inserts audit logs.
  const saveEntries = Object.entries(values)
    .map(([parameterIdText, rawValue]) => ({
      parameterId: Number(parameterIdText),
      value: String(rawValue ?? "").trim()
    }))
    .filter((entry) => Boolean(entry.parameterId));

  const parameterIds = saveEntries.map((entry) => entry.parameterId);
  let saved = 0;

  if (parameterIds.length) {
    const { data: existingRows, error: existingReadError } = await supabase
      .from("examination_results")
      .select("id, parameter_id, value")
      .eq("participant_id", participantId)
      .in("parameter_id", parameterIds);

    if (existingReadError) return fail(existingReadError.message, 500);

    const existingByParameterId = new Map<number, any>();
    for (const row of existingRows || []) {
      const parameterId = Number(row.parameter_id);
      if (!existingByParameterId.has(parameterId)) existingByParameterId.set(parameterId, row);
    }

    const nowIso = new Date().toISOString();
    const updates: any[] = [];
    const inserts: any[] = [];
    const auditLogs: any[] = [];

    for (const entry of saveEntries) {
      const parameterId = entry.parameterId;
      const value = entry.value;
      const existing = existingByParameterId.get(parameterId);

      if (existing) {
        if (String(existing.value || "") !== value) {
          updates.push({
            id: existing.id,
            parameterId,
            oldValue: existing.value,
            value
          });

          auditLogs.push({
            user_id: user.id,
            action: "UPDATE_RESULT",
            participant_id: participantId,
            parameter_id: parameterId,
            old_value: existing.value,
            new_value: value
          });
        }
      } else if (value !== "") {
        inserts.push({
          participant_id: participantId,
          parameter_id: parameterId,
          value,
          input_by: user.id,
          input_post_id: postId
        });

        auditLogs.push({
          user_id: user.id,
          action: "CREATE_RESULT",
          participant_id: participantId,
          parameter_id: parameterId,
          old_value: null,
          new_value: value
        });
      }

      saved += 1;
    }

    if (inserts.length) {
      const { error: insertError } = await supabase
        .from("examination_results")
        .insert(inserts);

      if (insertError) return fail(insertError.message, 500);
    }

    if (updates.length) {
      const updateResults = await Promise.all(
        updates.map((item) =>
          supabase
            .from("examination_results")
            .update({
              value: item.value,
              updated_by: user.id,
              updated_at: nowIso
            })
            .eq("id", item.id)
        )
      );

      const updateError = updateResults.find((result) => result.error)?.error;
      if (updateError) return fail(updateError.message, 500);
    }

    if (auditLogs.length) {
      const { error: auditError } = await supabase.from("audit_logs").insert(auditLogs);
      if (auditError) return fail(auditError.message, 500);
    }
  }

  return ok({ saved, scoring_backend: true });
}


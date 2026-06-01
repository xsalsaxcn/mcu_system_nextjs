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

  return computeCapaskaDerivedValues(parameters || [], values);
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

  let saved = 0;

  for (const [parameterIdText, rawValue] of Object.entries(values)) {
    const parameterId = Number(parameterIdText);
    if (!parameterId) continue;

    const value = String(rawValue ?? "").trim();

    const { data: existing } = await supabase
      .from("examination_results")
      .select("*")
      .eq("participant_id", participantId)
      .eq("parameter_id", parameterId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (String(existing.value || "") !== value) {
        const { error } = await supabase
          .from("examination_results")
          .update({
            value,
            updated_by: user.id,
            updated_at: new Date().toISOString()
          })
          .eq("id", existing.id);

        if (error) return fail(error.message, 500);

        await supabase.from("audit_logs").insert({
          user_id: user.id,
          action: "UPDATE_RESULT",
          participant_id: participantId,
          parameter_id: parameterId,
          old_value: existing.value,
          new_value: value
        });
      }
    } else if (value !== "") {
      const { error } = await supabase.from("examination_results").insert({
        participant_id: participantId,
        parameter_id: parameterId,
        value,
        input_by: user.id,
        input_post_id: postId
      });

      if (error) return fail(error.message, 500);

      await supabase.from("audit_logs").insert({
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

  return ok({ saved, scoring_backend: true });
}

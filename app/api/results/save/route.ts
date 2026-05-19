import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const participantId = Number(body.participant_id);
  const postId = Number(body.post_id || user.post_id);
  const values = body.values || {};

  if (!participantId || !postId) return fail("participant_id dan post_id wajib.");

  if (user.role === "operator" && Number(user.post_id) !== postId) {
    return fail("Operator hanya boleh input di post sendiri.", 403);
  }

  const supabase = getSupabaseAdmin();
  let saved = 0;

  for (const [parameterIdText, rawValue] of Object.entries(values)) {
    const parameterId = Number(parameterIdText);
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

  return ok({ saved });
}

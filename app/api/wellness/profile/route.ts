import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import {
  actorWebhookPayload,
  getSupportActor,
  postSupportWebhook,
} from "@/lib/wellness/supportServer";

// WELLNESS_PROFILE_GOOGLE_SHEET_API_V76

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const actor = await getSupportActor(request);
    if (!actor || actor.isAdmin)
      return fail("Session Wellness belum aktif.", 401);

    const result = await postSupportWebhook("wellnessProfileGet", {
      ...actorWebhookPayload(actor),
    }).catch(() => ({ ok: false, profile: null }));

    return ok({
      profile: {
        actor_type: actor.type,
        actor_id: actor.id,
        name: result?.profile?.name || actor.name,
        code: result?.profile?.code || actor.code,
        email: result?.profile?.email || actor.email,
        photo_url: result?.profile?.photo_url || "",
        photo_preview_url: result?.profile?.photo_preview_url || "",
        updated_at: result?.profile?.updated_at || "",
      },
    });
  } catch (error: any) {
    return fail(error?.message || "Profil Wellness gagal dimuat.", 500);
  }
}

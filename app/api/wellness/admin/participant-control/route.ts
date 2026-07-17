import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import {
  loadParticipantControl,
  normalizeFitnessSource,
} from "@/lib/wellness/participantControls";

// WELLNESS_ADMIN_PARTICIPANT_CONTROL_API_V79F

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "supervisor",
  "doctor",
  "wellness_admin",
]);

function clean(value: any) {
  return String(value ?? "").trim();
}

function boolValue(value: any, fallback: boolean) {
  if (value === undefined || value === null || value === "") return fallback;
  return ![false, 0, "0", "false", "off", "nonaktif"].includes(
    typeof value === "string" ? value.toLowerCase() : value,
  );
}

function adminUser(request: NextRequest) {
  const user: any = getSessionUser(request);
  const role = clean(user?.role).toLowerCase();
  return user && ADMIN_ROLES.has(role) ? user : null;
}

export async function GET(request: NextRequest) {
  try {
    if (!adminUser(request)) return fail("Akses Admin Wellness diperlukan.", 401);
    const participantId = Number(
      request.nextUrl.searchParams.get("participant_id") || 0,
    );
    if (!participantId) return fail("participant_id wajib diisi.", 400);
    const supabase = getSupabaseAdmin();
    return ok({ control: await loadParticipantControl(supabase, participantId) });
  } catch (error: any) {
    return fail(error?.message || "Kontrol peserta gagal dimuat.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user: any = adminUser(request);
    if (!user) return fail("Akses Admin Wellness diperlukan.", 401);

    const body = await request.json().catch(() => ({}));
    const participantId = Number(body.participant_id || body.id || 0);
    if (!participantId) return fail("participant_id wajib diisi.", 400);

    const supabase = getSupabaseAdmin();
    const current = await loadParticipantControl(supabase, participantId);
    const sessionEnabled = boolValue(
      body.session_enabled,
      current.session_enabled,
    );
    const fitnessEnabled = boolValue(
      body.fitness_enabled,
      current.fitness_enabled,
    );
    const requestedSource = normalizeFitnessSource(
      body.fitness_source ?? current.fitness_source,
    );
    const fitnessSource = fitnessEnabled ? requestedSource : "none";

    if (fitnessEnabled && fitnessSource === "none") {
      return fail(
        "Pilih Health Connect atau Google Fit sebelum mengaktifkan Fitness App.",
        400,
      );
    }

    const updatedBy = Number(user.id || user.user_id || 0) || null;
    const payload = {
      participant_id: participantId,
      session_enabled: sessionEnabled,
      fitness_enabled: fitnessEnabled,
      fitness_source: fitnessSource,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    };

    const { error: controlError } = await supabase
      .from("wellness_participant_controls")
      .upsert(payload, { onConflict: "participant_id" });

    if (controlError) {
      const detail = clean(controlError.message);
      if (/does not exist|schema cache/i.test(detail)) {
        return fail(
          "Table kontrol belum tersedia. Jalankan sql/wellness_participant_controls_v79f.sql di Supabase.",
          500,
        );
      }
      throw controlError;
    }

    // Enforce one active device integration. Historical activity logs remain
    // untouched; dashboards filter them by the selected source.
    const { error: disableError } = await supabase
      .from("wellness_integrations")
      .update({ is_active: 0, updated_at: new Date().toISOString() })
      .eq("participant_id", participantId)
      .in("provider", ["health_connect", "google_fit"]);
    if (disableError) throw disableError;

    if (fitnessEnabled && fitnessSource !== "none") {
      const { error: activateError } = await supabase
        .from("wellness_integrations")
        .update({ is_active: 1, updated_at: new Date().toISOString() })
        .eq("participant_id", participantId)
        .eq("provider", fitnessSource);
      if (activateError) throw activateError;
    }

    const control = await loadParticipantControl(supabase, participantId);
    return ok({
      control,
      message: sessionEnabled
        ? fitnessEnabled
          ? `Session aktif. Sumber fitness: ${fitnessSource === "health_connect" ? "Health Connect" : "Google Fit"}.`
          : "Session aktif. Fitness App dinonaktifkan."
        : "Session Wellness dinonaktifkan.",
    });
  } catch (error: any) {
    return fail(error?.message || "Kontrol peserta gagal disimpan.", 500);
  }
}

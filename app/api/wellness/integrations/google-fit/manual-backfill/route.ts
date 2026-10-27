// WELLNESS_GOOGLE_FIT_PARTICIPANT_BACKDATE_SELF_SERVICE_V1
// Participant self-service recovery for MISSED GOOGLE FIT STEPS only.
// Exact selected Log Date range, max 14 days.
// No calories/distance/duration overwrite on existing rows.
// No point reconciliation. No streak calculation/rule mutation.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import { loadParticipantControl } from "@/lib/wellness/participantControls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MARKER = "WELLNESS_GOOGLE_FIT_PARTICIPANT_BACKDATE_SELF_SERVICE_V1";
const TZ = "Asia/Jakarta";
const MAX_DAYS = 14;

function clean(value: any) {
  return String(value ?? "").trim();
}

function valueNumber(value: any) {
  if (!value) return 0;
  if (value.intVal !== undefined && value.intVal !== null) return Number(value.intVal) || 0;
  if (value.fpVal !== undefined && value.fpVal !== null) return Number(value.fpVal) || 0;
  if (value.stringVal !== undefined && value.stringVal !== null) return Number(value.stringVal) || 0;
  return 0;
}

function jakartaDateKey(ms: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const y = parts.find((item) => item.type === "year")?.value;
  const m = parts.find((item) => item.type === "month")?.value;
  const d = parts.find((item) => item.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : new Date(ms).toISOString().slice(0, 10);
}

function todayKey() {
  return jakartaDateKey(Date.now());
}

function jakartaDayStartUtc(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0));
}

function addDays(dateKey: string, days: number) {
  return jakartaDateKey(jakartaDayStartUtc(dateKey).getTime() + days * 86400000);
}

function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    return jakartaDateKey(jakartaDayStartUtc(value).getTime()) === value;
  } catch {
    return false;
  }
}

function inclusiveDays(startDate: string, endDate: string) {
  return Math.floor((jakartaDayStartUtc(endDate).getTime() - jakartaDayStartUtc(startDate).getTime()) / 86400000) + 1;
}

function reconnectProblem(message: string) {
  const text = clean(message).toLowerCase();
  return [
    "refresh_token",
    "invalid_grant",
    "insufficient authentication",
    "authentication scopes",
    "unauthorized",
    "permission denied",
    "invalid token",
    "token expired",
    "token has been expired",
    "oauth",
  ].some((needle) => text.includes(needle));
}

function reconnectResponse(message: string, status = 409) {
  return NextResponse.json(
    {
      ok: false,
      marker: MARKER,
      reconnect_required: true,
      reconnect_url: "/api/wellness/integrations/google-fit/connect",
      message: clean(message) || "Koneksi Google Fit perlu dihubungkan ulang ke Harmony App.",
      steps: [
        "Buka Google Fit di HP dan pastikan akun yang benar serta data langkah tanggal tersebut tampil.",
        "Di Harmony App tekan Hubungkan Ulang Google Fit.",
        "Pilih akun Google yang sama dengan Google Fit di HP.",
        "Izinkan akses data aktivitas/fitness yang diminta Google.",
        "Setelah kembali ke Harmony App, tekan Tarik Data Backdate lagi.",
      ],
    },
    { status },
  );
}

function rawObject(value: any) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

async function refreshAccessTokenIfNeeded(supabase: any, integration: any) {
  const expiresAt = integration?.expires_at ? new Date(integration.expires_at).getTime() : 0;
  if (clean(integration?.access_token) && expiresAt > Date.now() + 60_000) {
    return clean(integration.access_token);
  }

  const refreshToken = clean(integration?.refresh_token);
  if (!refreshToken) throw new Error("Google Fit refresh_token tidak tersedia.");

  const clientId = clean(process.env.GOOGLE_FIT_CLIENT_ID) || clean(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = clean(process.env.GOOGLE_FIT_CLIENT_SECRET) || clean(process.env.GOOGLE_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    throw new Error("Konfigurasi server Google Fit belum lengkap. Hubungi Admin.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
    cache: "no-store",
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok || !clean(payload?.access_token)) {
    throw new Error(clean(payload?.error_description || payload?.error) || "Google Fit token tidak dapat diperbarui.");
  }

  const accessToken = clean(payload.access_token);
  const saved = await supabase
    .from("wellness_integrations")
    .update({
      access_token: accessToken,
      expires_at: new Date(Date.now() + Number(payload.expires_in || 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", integration.id);
  if (saved.error) throw saved.error;
  return accessToken;
}

async function readStepAggregate(params: { accessToken: string; startDate: string; endDate: string }) {
  const start = jakartaDayStartUtc(params.startDate);
  const end = jakartaDayStartUtc(addDays(params.endDate, 1));
  const response = await fetch("https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: start.getTime(),
      endTimeMillis: end.getTime(),
    }),
    cache: "no-store",
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(clean(payload?.error?.message || payload?.error) || `Google Fit HTTP ${response.status}`);
  }

  const rows = new Map<string, number>();
  for (const bucket of Array.isArray(payload?.bucket) ? payload.bucket : []) {
    const startMs = Number(bucket?.startTimeMillis || 0);
    const date = startMs ? jakartaDateKey(startMs) : "";
    if (!date) continue;
    let total = 0;
    for (const dataset of Array.isArray(bucket?.dataset) ? bucket.dataset : []) {
      for (const point of Array.isArray(dataset?.point) ? dataset.point : []) {
        total += (Array.isArray(point?.value) ? point.value : []).reduce(
          (sum: number, item: any) => sum + valueNumber(item),
          0,
        );
      }
    }
    if (total > 0) rows.set(date, Math.round(total));
  }
  return rows;
}

async function saveStepsOnly(params: { supabase: any; participant: any; date: string; steps: number }) {
  const externalId = `google_fit_daily_${params.participant.id}_${params.date}`;
  const existing = await params.supabase
    .from("wellness_activity_logs")
    .select("id,steps,raw_payload")
    .eq("participant_id", params.participant.id)
    .eq("source", "google_fit")
    .eq("external_activity_id", externalId)
    .maybeSingle();
  if (existing.error) throw existing.error;

  const existingRaw = rawObject(existing.data?.raw_payload);
  const previousSteps = Math.round(Number(existing.data?.steps || 0));

  if (existingRaw?.native_snapshot_persisted === true) {
    return { action: "skipped_native", previous_steps: previousSteps, steps: previousSteps };
  }
  if (existing.data?.id && previousSteps === params.steps) {
    return { action: "unchanged", previous_steps: previousSteps, steps: params.steps };
  }

  const nowIso = new Date().toISOString();
  const nextRaw = {
    ...existingRaw,
    marker: MARKER,
    provider: "google_fit",
    log_date: params.date,
    google_fit_steps: params.steps,
    manual_backdate_steps_only: true,
    manual_backdate_at: nowIso,
    manual_backdate_note:
      "Participant self-service steps-only recovery. Historical date uses log_date. Calories/distance/duration and points are not recalculated.",
  };

  if (existing.data?.id) {
    const updated = await params.supabase
      .from("wellness_activity_logs")
      .update({
        steps: params.steps,
        activity_name: `Google Fit Daily - ${params.steps} steps`,
        log_date: params.date,
        raw_payload: nextRaw,
      })
      .eq("id", existing.data.id)
      .select("id")
      .single();
    if (updated.error) throw updated.error;
    return { action: "updated", previous_steps: previousSteps, steps: params.steps };
  }

  const inserted = await params.supabase
    .from("wellness_activity_logs")
    .insert({
      participant_id: Number(params.participant.id),
      source: "google_fit",
      external_activity_id: externalId,
      provider_activity_id: externalId,
      activity_type: "Google Fit Daily",
      activity_name: `Google Fit Daily - ${params.steps} steps`,
      log_date: params.date,
      started_at: nowIso,
      duration_minutes: 0,
      calories: 0,
      distance_km: 0,
      steps: params.steps,
      raw_payload: nextRaw,
    })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  return { action: "inserted", previous_steps: 0, steps: params.steps };
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const participant = await getParticipantFromPortalSession(supabase, req).catch(() => null);
  if (!participant?.id) {
    return NextResponse.json({ ok: false, marker: MARKER, message: "Session peserta belum aktif. Silakan login ulang." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const startDate = clean(body?.start_date);
  const endDate = clean(body?.end_date);
  if (!validDateKey(startDate) || !validDateKey(endDate)) {
    return NextResponse.json({ ok: false, marker: MARKER, message: "Pilih tanggal mulai dan tanggal akhir yang valid." }, { status: 400 });
  }
  if (startDate > endDate) {
    return NextResponse.json({ ok: false, marker: MARKER, message: "Tanggal mulai tidak boleh setelah tanggal akhir." }, { status: 400 });
  }

  const days = inclusiveDays(startDate, endDate);
  if (days < 1 || days > MAX_DAYS) {
    return NextResponse.json({ ok: false, marker: MARKER, message: `Maksimal ${MAX_DAYS} hari dalam satu kali tarik data.` }, { status: 400 });
  }
  if (endDate > todayKey()) {
    return NextResponse.json({ ok: false, marker: MARKER, message: "Tanggal akhir tidak boleh melebihi hari ini." }, { status: 400 });
  }

  const programStartDate = clean(participant?.program_start_date).slice(0, 10);
  if (programStartDate && startDate < programStartDate) {
    return NextResponse.json({ ok: false, marker: MARKER, message: `Tanggal mulai tidak boleh sebelum awal program (${programStartDate}).` }, { status: 400 });
  }

  const control = await loadParticipantControl(supabase, Number(participant.id)).catch(() => null);
  if (control && (control?.fitness_enabled === false || clean(control?.fitness_source).toLowerCase().replace(/-/g, "_") !== "google_fit")) {
    return NextResponse.json({ ok: false, marker: MARKER, message: "Google Fit bukan sumber fitness aktif untuk akun ini." }, { status: 409 });
  }

  const { data: integration, error: integrationError } = await supabase
    .from("wellness_integrations")
    .select("*")
    .eq("participant_id", participant.id)
    .eq("provider", "google_fit")
    .neq("is_active", 0)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (integrationError) {
    return NextResponse.json({ ok: false, marker: MARKER, message: integrationError.message || "Gagal membaca koneksi Google Fit." }, { status: 500 });
  }
  if (!integration?.id) {
    return reconnectResponse("Google Fit belum terhubung ke Harmony App. Hubungkan ulang terlebih dahulu.");
  }

  try {
    const accessToken = await refreshAccessTokenIfNeeded(supabase, integration);
    const stepRows = await readStepAggregate({ accessToken, startDate, endDate });

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let skippedNative = 0;
    const cloudMissingDates: string[] = [];
    const daily: any[] = [];

    for (let offset = 0; offset < days; offset += 1) {
      const date = addDays(startDate, offset);
      const steps = Math.round(Number(stepRows.get(date) || 0));
      if (!(steps > 0)) {
        cloudMissingDates.push(date);
        daily.push({ date, action: "no_cloud_steps", steps: 0 });
        continue;
      }

      const saved = await saveStepsOnly({ supabase, participant, date, steps });
      if (saved.action === "inserted") inserted += 1;
      if (saved.action === "updated") updated += 1;
      if (saved.action === "unchanged") unchanged += 1;
      if (saved.action === "skipped_native") skippedNative += 1;
      daily.push({ date, ...saved });
    }

    const nowIso = new Date().toISOString();
    await supabase.from("wellness_integrations").update({ last_sync_at: nowIso, updated_at: nowIso }).eq("id", integration.id);

    const changed = inserted + updated;
    const noCloudData = changed === 0 && unchanged === 0 && skippedNative === 0;
    return NextResponse.json({
      ok: true,
      marker: MARKER,
      mode: "participant_manual_backdate_steps_only",
      timezone: TZ,
      date_range: { start: startDate, end: endDate, days },
      log_date_basis: "selected_google_fit_daily_date",
      point_reconciliation: false,
      streak_rule_change: false,
      calories_changed: false,
      distance_changed: false,
      duration_changed: false,
      inserted,
      updated,
      unchanged,
      skipped_native: skippedNative,
      cloud_missing_dates: cloudMissingDates,
      no_cloud_data: noCloudData,
      daily,
      message:
        changed > 0
          ? `Tarik data selesai. ${changed} tanggal diperbarui dari Google Fit.`
          : cloudMissingDates.length > 0
            ? "Google Fit cloud belum memiliki steps untuk tanggal yang dipilih. Buka Google Fit di HP dan pastikan data tanggal tersebut sudah tampil, lalu coba lagi."
            : "Data Google Fit untuk tanggal yang dipilih sudah sama dengan Harmony App.",
    });
  } catch (error: any) {
    const message = clean(error?.message) || "Gagal menarik data Google Fit.";
    console.error(`${MARKER}_ERROR`, error);
    if (reconnectProblem(message)) {
      return reconnectResponse(`Koneksi Google Fit perlu dihubungkan ulang. ${message}`);
    }
    return NextResponse.json({ ok: false, marker: MARKER, reconnect_required: false, message }, { status: 500 });
  }
}

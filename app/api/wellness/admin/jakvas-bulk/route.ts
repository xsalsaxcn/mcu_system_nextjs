// WELLNESS_ADMIN_JAKVAS_SCORE_EXPORT_V1_BULK
import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import { loadParticipantJakvasReport } from "@/lib/wellness/jakvasServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function parseParticipantIds(value: string | null) {
  return [
    ...new Set(
      clean(value)
        .split(",")
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
        .map((item) => Math.floor(item)),
    ),
  ].slice(0, 50);
}

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

export async function GET(request: NextRequest) {
  try {
    const user: any = getSessionUser(request);
    if (!user) return fail("Session Admin belum aktif.", 401);
    if (!ADMIN_ROLES.has(clean(user.role).toLowerCase())) {
      return fail("Akun ini tidak memiliki akses Portal Admin.", 403);
    }

    const participantIds = parseParticipantIds(
      request.nextUrl.searchParams.get("participant_ids"),
    );

    if (!participantIds.length) {
      return ok({ reports: {}, requested: 0, loaded: 0 });
    }

    const supabase = getSupabaseAdmin();
    const participantResult = await supabase
      .from("wellness_participants")
      .select("*")
      .in("id", participantIds);

    if (participantResult.error) {
      return fail(
        participantResult.error.message ||
          "Data peserta JAKVAS gagal dimuat.",
        500,
      );
    }

    const participantById = new Map<number, any>(
      (participantResult.data || []).map((participant: any) => [
        Number(participant?.id || 0),
        participant,
      ]),
    );

    const entries = await mapConcurrent(
      participantIds,
      5,
      async (participantId) => {
        const participant = participantById.get(participantId);

        if (!participant) {
          return [
            String(participantId),
            {
              participant_id: participantId,
              error: true,
              message: "Peserta tidak ditemukan.",
            },
          ] as const;
        }

        try {
          const report = await loadParticipantJakvasReport({
            supabase,
            participant,
          });

          return [
            String(participantId),
            {
              participant_id: participantId,
              complete: report.complete,
              eligible: report.eligible,
              total_score: report.total_score,
              risk_category: report.risk_category,
              risk_label: report.risk_label,
              risk_10y_label: report.risk_10y_label,
              recommendation: report.recommendation,
              missing_fields: report.missing_fields,
              sources: report.sources,
            },
          ] as const;
        } catch (error: any) {
          return [
            String(participantId),
            {
              participant_id: participantId,
              error: true,
              message:
                error?.message || "Laporan JAKVAS peserta gagal dimuat.",
            },
          ] as const;
        }
      },
    );

    const reports = Object.fromEntries(entries);

    return ok({
      reports,
      requested: participantIds.length,
      loaded: entries.filter(([, report]: any) => !report?.error).length,
    });
  } catch (error: any) {
    return fail(
      error?.message || "Ringkasan JAKVAS Admin gagal dimuat.",
      500,
    );
  }
}

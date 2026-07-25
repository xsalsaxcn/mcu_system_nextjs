import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import {
  WELLNESS_CLEANUP_CONFIRMATION,
  buildWellnessCleanupBackup,
  executeWellnessCleanup,
  getSelectedWellnessParticipants,
  loadWellnessCleanupBootstrap,
  normalizeCleanupCategory,
  normalizeParticipantIds,
  previewWellnessCleanup,
  signWellnessCleanupBackup,
  verifyWellnessCleanupBackupToken,
  wellnessCleanupEnabled,
  writeWellnessCleanupAudit,
} from "@/lib/wellness/cleanupService";

// WELLNESS_DUMMY_DATA_MAINTENANCE_API_V109
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLEANUP_ROLES = new Set(["admin", "super_admin", "wellness_admin"]);
const MAX_PARTICIPANTS_PER_REQUEST = 5000;

function clean(value: any) {
  return String(value ?? "").trim();
}

function getCleanupAdmin(request: NextRequest) {
  const user: any = getSessionUser(request);
  if (!user) return null;
  const role = clean(user.role).toLowerCase();
  return CLEANUP_ROLES.has(role) ? user : null;
}

function validateParticipantIds(input: any) {
  const ids = normalizeParticipantIds(Array.isArray(input) ? input : []);
  if (!ids.length) throw new Error("Pilih minimal satu peserta dummy.");
  if (ids.length > MAX_PARTICIPANTS_PER_REQUEST) {
    throw new Error(
      `Maksimal ${MAX_PARTICIPANTS_PER_REQUEST} peserta per proses cleanup.`,
    );
  }
  return ids;
}

export async function GET(request: NextRequest) {
  try {
    const user = getCleanupAdmin(request);
    if (!user) return fail("Hanya Admin Wellness yang dapat mengakses Maintenance.", 403);

    const supabase = getSupabaseAdmin();
    const bootstrap = await loadWellnessCleanupBootstrap(supabase);

    return ok({
      marker: "WELLNESS_DUMMY_DATA_MAINTENANCE_V109",
      enabled: wellnessCleanupEnabled(),
      confirmation_text: WELLNESS_CLEANUP_CONFIRMATION,
      admin: {
        id: user.id,
        name: clean(user.name || user.username) || "Admin",
        role: clean(user.role),
      },
      ...bootstrap,
    });
  } catch (error: any) {
    return fail(error?.message || "Maintenance Wellness gagal dimuat.", 500);
  }
}

export async function POST(request: NextRequest) {
  const user = getCleanupAdmin(request);
  if (!user) return fail("Hanya Admin Wellness yang dapat menjalankan Maintenance.", 403);

  const supabase = getSupabaseAdmin();
  const body = await request.json().catch(() => ({}));
  const action = clean(body?.action).toLowerCase();

  try {
    const category = normalizeCleanupCategory(body?.category);
    if (!category) return fail("Kategori cleanup tidak valid.", 400);

    const participantIds = validateParticipantIds(body?.participant_ids);
    const participants = await getSelectedWellnessParticipants(
      supabase,
      participantIds,
    );

    if (participants.length !== participantIds.length) {
      return fail(
        "Sebagian peserta tidak ditemukan. Muat ulang halaman sebelum melanjutkan.",
        409,
      );
    }

    if (action === "preview") {
      const preview = await previewWellnessCleanup(
        supabase,
        category,
        participantIds,
      );
      return ok({
        marker: "WELLNESS_DUMMY_DATA_MAINTENANCE_V109",
        enabled: wellnessCleanupEnabled(),
        preview,
      });
    }

    if (action === "backup") {
      const backup = await buildWellnessCleanupBackup(
        supabase,
        category,
        participantIds,
      );
      const backupToken = signWellnessCleanupBackup(backup);

      await writeWellnessCleanupAudit(
        supabase,
        user,
        "WELLNESS_DUMMY_BACKUP_CREATED",
        {
          category,
          participant_ids: participantIds,
          participant_count: participants.length,
          backup_created_at: backup.created_at,
          row_count: backup.preview.total_rows,
        },
      );

      return ok({
        marker: "WELLNESS_DUMMY_DATA_MAINTENANCE_V109",
        backup,
        backup_token: backupToken,
        token_expires_in_minutes: 30,
      });
    }

    if (action === "delete") {
      if (!wellnessCleanupEnabled()) {
        return fail(
          "Mode penghapusan masih nonaktif. Preview dan backup tetap dapat digunakan.",
          409,
        );
      }

      if (clean(body?.confirmation).toUpperCase() !== WELLNESS_CLEANUP_CONFIRMATION) {
        return fail(
          `Konfirmasi salah. Ketik persis: ${WELLNESS_CLEANUP_CONFIRMATION}`,
          400,
        );
      }

      if (body?.backup_acknowledged !== true) {
        return fail("Backup JSON wajib dibuat dan diakui sebelum penghapusan.", 400);
      }

      const tokenValid = verifyWellnessCleanupBackupToken({
        token: body?.backup_token,
        category,
        participantIds,
      });
      if (!tokenValid) {
        return fail(
          "Token backup tidak valid atau sudah kedaluwarsa. Buat backup baru.",
          409,
        );
      }

      await writeWellnessCleanupAudit(
        supabase,
        user,
        "WELLNESS_DUMMY_CLEANUP_START",
        {
          category,
          participant_ids: participantIds,
          participant_count: participants.length,
        },
      );

      try {
        const result = await executeWellnessCleanup(
          supabase,
          category,
          participantIds,
        );

        await writeWellnessCleanupAudit(
          supabase,
          user,
          "WELLNESS_DUMMY_CLEANUP_COMPLETE",
          result,
        );

        return ok({
          marker: "WELLNESS_DUMMY_DATA_MAINTENANCE_V109",
          message: category === "full" ? "Peserta dan seluruh data terkait berhasil dihapus." : category === "reset_all" ? "Data dummy dan akun login peserta berhasil direset." : "Cleanup data dummy Wellness selesai.",
          result,
        });
      } catch (deleteError: any) {
        await writeWellnessCleanupAudit(
          supabase,
          user,
          "WELLNESS_DUMMY_CLEANUP_FAILED",
          {
            category,
            participant_ids: participantIds,
            error: clean(deleteError?.message || deleteError),
          },
        ).catch(() => null);
        throw deleteError;
      }
    }

    return fail("Action Maintenance tidak dikenali.", 400);
  } catch (error: any) {
    return fail(error?.message || "Proses Maintenance Wellness gagal.", 500);
  }
}

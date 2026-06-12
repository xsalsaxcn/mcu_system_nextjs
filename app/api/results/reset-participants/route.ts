import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

// RESET_PARTICIPANTS_RESULTS_V221
// Reset massal dari dashboard: hanya menghapus hasil input form pemeriksaan.
// Data peserta, nomor MCU, status label print, dan data registrasi peserta tidak diubah.

function uniquePositiveIds(values: any[]) {
  return Array.from(new Set((values || [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
  ));
}

function isAdminLike(user: any) {
  const role = String(user?.role || user?.role_name || user?.user_role || "").toLowerCase();
  const username = String(user?.username || user?.email || user?.name || "").toLowerCase();
  return role.includes("admin") || username === "admin" || username.includes("admin");
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  if (!isAdminLike(user)) {
    return fail("Hanya admin yang dapat reset hasil form dari dashboard.", 403);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const participantIds = uniquePositiveIds(body.participantIds || body.ids || []);
  if (!participantIds.length) {
    return fail("Pilih minimal satu peserta untuk direset.", 400);
  }

  const supabase = getSupabaseAdmin();

  const { error: resultError, count: resultCount } = await supabase
    .from("examination_results")
    .delete({ count: "exact" })
    .in("participant_id", participantIds);

  if (resultError) return fail(resultError.message, 500);

  // Nama petugas pemeriksa juga bagian dari hasil form per stage. Jika tabel ini ada, kosongkan juga.
  // Kalau tabel belum ada di environment tertentu, abaikan error table-not-found agar reset hasil utama tetap berhasil.
  const { error: staffError, count: staffCount } = await supabase
    .from("mcu_stage_staff_assignments")
    .delete({ count: "exact" })
    .in("participant_id", participantIds);

  const staffErrorMessage = staffError?.message || "";
  const staffTableMissing = /does not exist|schema cache|not found/i.test(staffErrorMessage);
  if (staffError && !staffTableMissing) return fail(staffError.message, 500);

  return ok({
    participantCount: participantIds.length,
    deletedResults: resultCount || 0,
    deletedStaffAssignments: staffError ? 0 : (staffCount || 0),
    labelPrintStatusChanged: false,
    participantDataChanged: false,
    message: "Reset hasil form peserta terpilih berhasil. Data peserta, nomor MCU, dan status label print tidak diubah.",
  });
}

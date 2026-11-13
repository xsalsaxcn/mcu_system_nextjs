// V633.1_RESET_TESTING_FAIL_CLOSED_20261113
// TEMPORARY SAFETY LOCK — this route deliberately performs NO DELETE/UPDATE/INSERT.
// A future transactional reset must be separately audited, deployed, and approved.
// Retained read-only diagnostics for staff so error is actionable.
import { NextRequest } from "next/server";
import { clean, fail, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "session")) {
    return fail("Akses reset Session ditolak untuk role ini.", 403);
  }

  const body = await req.json().catch(() => ({}));
  const sessionId = toInt(body.sessionId || body.session_id, 0);
  const expectedName = clean(body.sessionName || body.session_name);
  if (!sessionId || !expectedName) {
    return fail("Session dan nama Session harus diisi untuk pemeriksaan reset.", 400);
  }

  const supabase = supabaseAdmin();
  const lookup = await supabase
    .from("vaccination_sessions")
    .select("id,session_name")
    .eq("id", sessionId)
    .single();
  if (lookup.error || !lookup.data) {
    return fail(lookup.error?.message || "Session tidak ditemukan.", 404);
  }
  if (clean(lookup.data.session_name) !== expectedName) {
    return fail("Nama Session berubah. Refresh halaman sebelum mencoba lagi.", 409);
  }

  // READ ONLY. These counts are only a status hint; they are NOT a complete FK audit.
  const [registrations, records, administered] = await Promise.all([
    supabase.from("vaccination_registrations")
      .select("id", { count: "exact", head: true }).eq("session_id", sessionId),
    supabase.from("vaccination_records")
      .select("id", { count: "exact", head: true }).eq("session_id", sessionId),
    supabase.from("vaccination_records")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .in("status", ["ADMINISTERED", "DONE", "FINISHED"]),
  ]);
  if (registrations.error || records.error || administered.error) {
    return fail("Pemeriksaan data reset gagal. Tidak ada data diubah. Reset tetap dikunci.", 503);
  }

  return fail(
    `Reset Testing dikunci sementara (V633.1) untuk mencegah penghapusan sebagian / perubahan stok yang tidak aman. ` +
    `Session ${sessionId}: ${Number(registrations.count || 0)} registrasi, ` +
    `${Number(records.count || 0)} record vaksin, ` +
    `${Number(administered.count || 0)} record selesai. ` +
    `Tidak ada data dihapus. Lakukan audit FK dan siapkan reset atomik terverifikasi sebelum reset diaktifkan kembali.`,
    423,
  );
}

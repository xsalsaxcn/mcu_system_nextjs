// V537_SESSION_TEST_DATA_RESET
import { NextRequest } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { reverseQueueDoneTrack } from "@/lib/vaccination/queueDoneInventory";

export const dynamic = "force-dynamic";

function isFinalItemStatus(value: any) {
  return ["ADMINISTERED", "DONE", "FINISHED"].includes(clean(value).toUpperCase());
}

function recordTrack(notes: any): "HEALTHDAY" | "BAZAR" | null {
  const value = clean(notes).toUpperCase();
  if (value.includes("QUEUE_DONE_SYNC:HEALTHDAY")) return "HEALTHDAY";
  if (value.includes("QUEUE_DONE_SYNC:BAZAR")) return "BAZAR";
  return null;
}

function missingTable(error: any, table: string) {
  const code = clean(error?.code);
  const message = clean(error?.message).toLowerCase();
  return code === "42P01" || message.includes(table.toLowerCase());
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "session")) {
    return fail("Akses reset Session ditolak untuk role ini.", 403);
  }

  const body = await req.json().catch(() => ({}));
  const sessionId = toInt(body.sessionId || body.session_id, 0);
  const expectedName = clean(body.sessionName || body.session_name);
  if (!sessionId) return fail("Session tidak valid.");

  const supabase = supabaseAdmin();
  const sessionResult = await supabase
    .from("vaccination_sessions")
    .select("id,session_name,company_name,location,session_date")
    .eq("id", sessionId)
    .single();
  if (sessionResult.error) return fail(sessionResult.error.message, 404);

  const session = sessionResult.data;
  if (expectedName && clean(session.session_name) !== expectedName) {
    return fail("Nama Session berubah. Refresh halaman sebelum melakukan reset.", 409);
  }

  const registrationResult = await supabase
    .from("vaccination_registrations")
    .select("id")
    .eq("session_id", sessionId);
  if (registrationResult.error) return fail(registrationResult.error.message, 500);

  const registrationIds = (registrationResult.data || [])
    .map((row: any) => Number(row.id || 0))
    .filter(Boolean);

  const recordsResult = await supabase
    .from("vaccination_records")
    .select("id,registration_id,notes,status")
    .eq("session_id", sessionId);
  if (recordsResult.error) return fail(recordsResult.error.message, 500);
  const records = recordsResult.data || [];

  let items: any[] = [];
  if (registrationIds.length) {
    const itemResult = await supabase
      .from("vaccination_registration_items")
      .select("id,registration_id,status,service_mode,administered_record_id")
      .in("registration_id", registrationIds);
    if (itemResult.error) return fail(itemResult.error.message, 500);
    items = itemResult.data || [];
  }

  const itemByRecordId = new Map<number, any>();
  for (const item of items) {
    const recordId = Number(item?.administered_record_id || 0);
    if (recordId) itemByRecordId.set(recordId, item);
  }

  // Safety: only auto-reset records made by Registration/Validation DONE sync.
  const unsafeRecords = records.filter((record: any) => {
    const track = recordTrack(record?.notes);
    const item = itemByRecordId.get(Number(record?.id || 0));
    return (
      !track ||
      !item ||
      Number(item.registration_id || 0) !== Number(record.registration_id || 0) ||
      !isFinalItemStatus(item.status)
    );
  });

  if (unsafeRecords.length) {
    return fail(
      `Reset dihentikan: ada ${unsafeRecords.length} record vaksin pada Session ini yang bukan berasal dari flow Registrasi/Validasi otomatis. Data tersebut tidak diubah agar stok tetap aman.`,
      409,
    );
  }

  let reversedDone = 0;
  for (const registrationId of registrationIds) {
    const healthday = await reverseQueueDoneTrack(
      supabase,
      registrationId,
      "HEALTHDAY",
      "session-test-reset",
    );
    const bazar = await reverseQueueDoneTrack(
      supabase,
      registrationId,
      "BAZAR",
      "session-test-reset",
    );
    reversedDone += Number(healthday?.reversed || 0) + Number(bazar?.reversed || 0);
  }

  const remainingRecords = await supabase
    .from("vaccination_records")
    .select("id")
    .eq("session_id", sessionId)
    .limit(20);
  if (remainingRecords.error) return fail(remainingRecords.error.message, 500);
  if ((remainingRecords.data || []).length) {
    return fail(
      "Reset dihentikan karena masih ada record vaksin yang belum dapat direverse. Registrasi belum dihapus.",
      409,
    );
  }

  const selfBookingDelete = await supabase
    .from("vaccination_bazar_self_bookings")
    .delete()
    .eq("session_id", sessionId);
  if (selfBookingDelete.error && !missingTable(selfBookingDelete.error, "vaccination_bazar_self_bookings")) {
    return fail(selfBookingDelete.error.message, 500);
  }

  if (registrationIds.length) {
    const auditDelete = await supabase
      .from("vaccination_inventory_movements")
      .delete()
      .eq("movement_type", "queue_done_reversal_audit")
      .eq("reference_type", "registration")
      .in("reference_id", registrationIds);
    if (auditDelete.error) return fail(auditDelete.error.message, 500);

    const itemDelete = await supabase
      .from("vaccination_registration_items")
      .delete()
      .in("registration_id", registrationIds);
    if (itemDelete.error) return fail(itemDelete.error.message, 500);
  }

  const registrationDelete = await supabase
    .from("vaccination_registrations")
    .delete()
    .eq("session_id", sessionId);
  if (registrationDelete.error) return fail(registrationDelete.error.message, 500);

  return ok({
    message: `Data testing Session "${clean(session.session_name)}" berhasil direset.`,
    reset: {
      sessionId,
      registrations: registrationIds.length,
      reversedDone,
      selfBookingCleared: !selfBookingDelete.error,
    },
  });
}

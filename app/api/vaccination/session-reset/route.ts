// V539_SESSION_TEST_RESET_RESIDUAL_CLEANUP
import { NextRequest } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";

export const dynamic = "force-dynamic";

function missingTable(error: any, table: string) {
  const code = clean(error?.code);
  const message = clean(error?.message).toLowerCase();
  return code === "42P01" || message.includes(table.toLowerCase());
}

async function deleteOptional(
  supabase: any,
  table: string,
  builder: (query: any) => any,
) {
  const result = await builder(supabase.from(table).delete());
  if (result.error && !missingTable(result.error, table)) {
    throw new Error(result.error.message || `Gagal membersihkan ${table}.`);
  }
  return !result.error;
}

async function recomputeLotStockUsed(supabase: any, lotId: number) {
  const remaining = await supabase
    .from("vaccination_records")
    .select("id", { count: "exact", head: true })
    .eq("lot_id", lotId)
    .in("status", ["ADMINISTERED", "DONE", "FINISHED"]);

  if (remaining.error) throw new Error(remaining.error.message);

  const update = await supabase
    .from("vaccination_vaccine_lots")
    .update({
      stock_used: Math.max(0, Number(remaining.count || 0)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", lotId);

  if (update.error) throw new Error(update.error.message);
  return Math.max(0, Number(remaining.count || 0));
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

  if (sessionResult.error || !sessionResult.data) {
    return fail(sessionResult.error?.message || "Session tidak ditemukan.", 404);
  }

  const session = sessionResult.data;
  if (expectedName && clean(session.session_name) !== expectedName) {
    return fail("Nama Session berubah. Refresh halaman sebelum melakukan reset.", 409);
  }

  try {
    // 1) Collect all operational rows first. No destructive action before this preflight completes.
    const registrationsResult = await supabase
      .from("vaccination_registrations")
      .select("id")
      .eq("session_id", sessionId);
    if (registrationsResult.error) throw new Error(registrationsResult.error.message);

    const registrationIds = (registrationsResult.data || [])
      .map((row: any) => Number(row.id || 0))
      .filter(Boolean);

    const recordsResult = await supabase
      .from("vaccination_records")
      .select("id,registration_id,lot_id,status")
      .eq("session_id", sessionId);
    if (recordsResult.error) throw new Error(recordsResult.error.message);

    const records = recordsResult.data || [];
    const recordIds = records
      .map((row: any) => Number(row.id || 0))
      .filter(Boolean);

    const affectedLotIds = Array.from(
      new Set(
        records
          .map((row: any) => Number(row.lot_id || 0))
          .filter(Boolean),
      ),
    );

    let itemCount = 0;
    if (registrationIds.length) {
      const itemsResult = await supabase
        .from("vaccination_registration_items")
        .select("id,lot_id")
        .in("registration_id", registrationIds);
      if (itemsResult.error) throw new Error(itemsResult.error.message);

      itemCount = (itemsResult.data || []).length;
      for (const item of itemsResult.data || []) {
        const lotId = Number(item?.lot_id || 0);
        if (lotId && !affectedLotIds.includes(lotId)) affectedLotIds.push(lotId);
      }
    }

    // 2) Remove dependent operational data first.
    let selfBookingCleared = false;
    const selfBookingDelete = await supabase
      .from("vaccination_bazar_self_bookings")
      .delete()
      .eq("session_id", sessionId);
    if (selfBookingDelete.error) {
      if (!missingTable(selfBookingDelete.error, "vaccination_bazar_self_bookings")) {
        throw new Error(selfBookingDelete.error.message);
      }
    } else {
      selfBookingCleared = true;
    }

    let onsiteEntriesCleared = 0;
    let onsiteEventsCleared = 0;
    const onsiteEvents = await supabase
      .from("vaccination_onsite_queue_events")
      .select("id")
      .eq("session_id", sessionId);

    if (onsiteEvents.error) {
      if (!missingTable(onsiteEvents.error, "vaccination_onsite_queue_events")) {
        throw new Error(onsiteEvents.error.message);
      }
    } else {
      const eventIds = (onsiteEvents.data || [])
        .map((row: any) => Number(row.id || 0))
        .filter(Boolean);

      if (eventIds.length) {
        const entries = await supabase
          .from("vaccination_onsite_queue_entries")
          .select("id")
          .in("event_id", eventIds);

        if (entries.error) {
          if (!missingTable(entries.error, "vaccination_onsite_queue_entries")) {
            throw new Error(entries.error.message);
          }
        } else {
          onsiteEntriesCleared = (entries.data || []).length;
          const deleteEntries = await supabase
            .from("vaccination_onsite_queue_entries")
            .delete()
            .in("event_id", eventIds);
          if (deleteEntries.error && !missingTable(deleteEntries.error, "vaccination_onsite_queue_entries")) {
            throw new Error(deleteEntries.error.message);
          }
        }

        onsiteEventsCleared = eventIds.length;
        const deleteEvents = await supabase
          .from("vaccination_onsite_queue_events")
          .delete()
          .in("id", eventIds);
        if (deleteEvents.error) throw new Error(deleteEvents.error.message);
      }
    }

    if (recordIds.length) {
      const remindersDelete = await supabase
        .from("vaccination_reminders")
        .delete()
        .in("record_id", recordIds);
      if (remindersDelete.error && !missingTable(remindersDelete.error, "vaccination_reminders")) {
        throw new Error(remindersDelete.error.message);
      }

      const recordMovementDelete = await supabase
        .from("vaccination_inventory_movements")
        .delete()
        .eq("reference_type", "vaccination_record")
        .in("reference_id", recordIds);
      if (recordMovementDelete.error) throw new Error(recordMovementDelete.error.message);
    }

    if (registrationIds.length) {
      // Remove reset/reversal audit and any operational movement tied directly to these test registrations.
      const registrationMovementDelete = await supabase
        .from("vaccination_inventory_movements")
        .delete()
        .eq("reference_type", "registration")
        .in("reference_id", registrationIds);
      if (registrationMovementDelete.error) throw new Error(registrationMovementDelete.error.message);

      // Break item -> record link before removing records.
      const unlinkItems = await supabase
        .from("vaccination_registration_items")
        .update({
          administered_record_id: null,
          administered_at: null,
          updated_at: new Date().toISOString(),
        })
        .in("registration_id", registrationIds);
      if (unlinkItems.error) throw new Error(unlinkItems.error.message);
    }

    // 3) Remove session records and operational registration items.
    if (recordIds.length) {
      const recordDelete = await supabase
        .from("vaccination_records")
        .delete()
        .in("id", recordIds);
      if (recordDelete.error) throw new Error(recordDelete.error.message);
    }

    if (registrationIds.length) {
      const itemDelete = await supabase
        .from("vaccination_registration_items")
        .delete()
        .in("registration_id", registrationIds);
      if (itemDelete.error) throw new Error(itemDelete.error.message);

      const registrationDelete = await supabase
        .from("vaccination_registrations")
        .delete()
        .eq("session_id", sessionId);
      if (registrationDelete.error) throw new Error(registrationDelete.error.message);
    }

    // 4) Recompute stock_used from surviving administered records.
    // This avoids blind subtraction and preserves usage from every other Session.
    const stockAfter: Record<string, number> = {};
    for (const lotId of affectedLotIds) {
      stockAfter[String(lotId)] = await recomputeLotStockUsed(supabase, lotId);
    }

    // 5) Final verification: the reset is only successful if no operational registration remains.
    const verifyRegs = await supabase
      .from("vaccination_registrations")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);
    if (verifyRegs.error) throw new Error(verifyRegs.error.message);

    const verifyRecords = await supabase
      .from("vaccination_records")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);
    if (verifyRecords.error) throw new Error(verifyRecords.error.message);

    if (Number(verifyRegs.count || 0) !== 0 || Number(verifyRecords.count || 0) !== 0) {
      throw new Error(
        `Reset belum bersih. Sisa registrasi: ${Number(verifyRegs.count || 0)}, sisa record: ${Number(verifyRecords.count || 0)}.`,
      );
    }

    return ok({
      message: `Data testing Session "${clean(session.session_name)}" berhasil dibersihkan tanpa menghapus Master/Rule.`,
      reset: {
        sessionId,
        registrations: registrationIds.length,
        items: itemCount,
        records: recordIds.length,
        affectedLots: affectedLotIds.length,
        selfBookingCleared,
        onsiteEntriesCleared,
        onsiteEventsCleared,
      },
      preserved: {
        session: true,
        masterProducts: true,
        lots: true,
        stockInitialAndAdded: true,
        seriesRules: true,
        productAssignments: true,
      },
      stockUsedAfter: stockAfter,
    });
  } catch (error: any) {
    return fail(error?.message || "Reset data testing gagal.", 500);
  }
}

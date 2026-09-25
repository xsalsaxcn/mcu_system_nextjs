// V153.35_SAFE_ONSITE_WHATSAPP_PREPARE
// Server-only helper for the Onsite Queue -> Notiva transactional bridge.
// WhatsApp failure is intentionally non-blocking for queue operations.

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || ["null", "undefined", "nan", "-", "—"].includes(text.toLowerCase())) return "";
  return text;
}

export type OnsiteWhatsAppPrepareResult = {
  attempted: boolean;
  sent: boolean;
  skipped: boolean;
  reason?: string;
  queue_number?: string;
  meta_message_id?: string;
  error?: string;
};

export function getOnsiteWhatsAppPrepareConfig() {
  const baseUrl = clean(
    process.env.NOTIVA_VACCINATION_QUEUE_URL || "https://wa-reminder-blast.vercel.app"
  ).replace(/\/+$/, "");
  const secret = clean(process.env.NOTIVA_VACCINATION_QUEUE_SECRET);

  return {
    configured: Boolean(baseUrl && secret),
    baseUrl,
    secret,
    trigger_ahead: 1,
  };
}

async function patchEntry(
  supabase: any,
  entryId: number,
  values: Record<string, unknown>
) {
  try {
    const result = await supabase
      .from("vaccination_onsite_queue_entries")
      .update({
        ...values,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entryId);

    return result?.error?.message || "";
  } catch (error: any) {
    return clean(error?.message) || "Gagal menyimpan status WhatsApp.";
  }
}

async function releaseClaim(
  supabase: any,
  entryId: number,
  errorMessage: string
) {
  await patchEntry(supabase, entryId, {
    wa_prepare_claimed_at: null,
    wa_prepare_last_error: errorMessage.slice(0, 1000),
  });
}

export async function notifyOnsiteNextWaitingPrepare(
  supabase: any,
  eventId: number
): Promise<OnsiteWhatsAppPrepareResult> {
  if (!eventId) {
    return {
      attempted: false,
      sent: false,
      skipped: true,
      reason: "EVENT_ID_MISSING",
    };
  }

  try {
    const activeResult = await supabase
      .from("vaccination_onsite_queue_entries")
      .select("id,queue_number,queue_sequence")
      .eq("event_id", eventId)
      .in("queue_status", ["CALLED", "IN_PROGRESS"])
      .order("queue_sequence", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (activeResult.error) {
      return {
        attempted: false,
        sent: false,
        skipped: true,
        reason: "ACTIVE_LOOKUP_FAILED",
        error: activeResult.error.message,
      };
    }

    // No active queue = nobody is exactly 1 position behind the active participant.
    if (!activeResult.data) {
      return {
        attempted: false,
        sent: false,
        skipped: true,
        reason: "NO_ACTIVE_QUEUE",
      };
    }

    const nextResult = await supabase
      .from("vaccination_onsite_queue_entries")
      .select(
        "id,participant_name,phone,queue_number,queue_sequence,wa_prepare_claimed_at,wa_prepare_attempted_at,wa_prepare_sent_at,wa_prepare_meta_message_id,wa_prepare_last_error"
      )
      .eq("event_id", eventId)
      .eq("queue_status", "WAITING")
      .order("queue_sequence", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextResult.error) {
      const migrationHint = /wa_prepare_/i.test(nextResult.error.message || "")
        ? " Jalankan SQL V153.35 di Supabase."
        : "";
      return {
        attempted: false,
        sent: false,
        skipped: true,
        reason: "WAITING_LOOKUP_FAILED",
        error: `${nextResult.error.message}${migrationHint}`,
      };
    }

    const entry = nextResult.data;
    if (!entry) {
      return {
        attempted: false,
        sent: false,
        skipped: true,
        reason: "NO_WAITING_QUEUE",
      };
    }

    if (entry.wa_prepare_sent_at) {
      return {
        attempted: false,
        sent: true,
        skipped: true,
        reason: "ALREADY_SENT",
        queue_number: clean(entry.queue_number),
        meta_message_id: clean(entry.wa_prepare_meta_message_id) || undefined,
      };
    }

    // Recover a claim left behind by an interrupted server function after 2 minutes.
    if (entry.wa_prepare_claimed_at) {
      const claimedAtMs = new Date(entry.wa_prepare_claimed_at).getTime();
      const isStale =
        Number.isFinite(claimedAtMs) && Date.now() - claimedAtMs > 120_000;

      if (!isStale) {
        return {
          attempted: false,
          sent: false,
          skipped: true,
          reason: "SEND_IN_PROGRESS",
          queue_number: clean(entry.queue_number),
        };
      }

      await supabase
        .from("vaccination_onsite_queue_entries")
        .update({ wa_prepare_claimed_at: null })
        .eq("id", entry.id)
        .is("wa_prepare_sent_at", null);
    }

    const claimTime = new Date().toISOString();
    const claimResult = await supabase
      .from("vaccination_onsite_queue_entries")
      .update({
        wa_prepare_claimed_at: claimTime,
        wa_prepare_attempted_at: claimTime,
        wa_prepare_last_error: null,
        updated_at: claimTime,
      })
      .eq("id", entry.id)
      .eq("event_id", eventId)
      .eq("queue_status", "WAITING")
      .is("wa_prepare_sent_at", null)
      .is("wa_prepare_claimed_at", null)
      .select("id")
      .maybeSingle();

    if (claimResult.error) {
      return {
        attempted: false,
        sent: false,
        skipped: true,
        reason: "CLAIM_FAILED",
        queue_number: clean(entry.queue_number),
        error: claimResult.error.message,
      };
    }

    if (!claimResult.data) {
      return {
        attempted: false,
        sent: false,
        skipped: true,
        reason: "ALREADY_CLAIMED",
        queue_number: clean(entry.queue_number),
      };
    }

    const phone = clean(entry.phone);
    if (!phone) {
      const error = "No HP peserta kosong.";
      await releaseClaim(supabase, Number(entry.id), error);
      return {
        attempted: true,
        sent: false,
        skipped: false,
        reason: "PHONE_MISSING",
        queue_number: clean(entry.queue_number),
        error,
      };
    }

    const config = getOnsiteWhatsAppPrepareConfig();
    if (!config.configured) {
      const error =
        "NOTIVA_VACCINATION_QUEUE_SECRET belum dikonfigurasi di Vaccination environment.";
      await releaseClaim(supabase, Number(entry.id), error);
      return {
        attempted: true,
        sent: false,
        skipped: false,
        reason: "NOTIVA_NOT_CONFIGURED",
        queue_number: clean(entry.queue_number),
        error,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const response = await fetch(
        `${config.baseUrl}/api/internal/vaccination-queue-call`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-vaccination-queue-secret": config.secret,
          },
          body: JSON.stringify({
            phone,
            participant_name: clean(entry.participant_name) || "Peserta",
            queue_number: clean(entry.queue_number),
            notification_type: "prepare",
          }),
          cache: "no-store",
          signal: controller.signal,
        }
      );

      const json: any = await response.json().catch(() => ({}));

      if (!response.ok || !json?.success) {
        const error =
          clean(json?.message || json?.error) || `Notiva HTTP ${response.status}`;
        await releaseClaim(supabase, Number(entry.id), error);
        return {
          attempted: true,
          sent: false,
          skipped: false,
          reason: "NOTIVA_SEND_FAILED",
          queue_number: clean(entry.queue_number),
          error,
        };
      }

      const sentAt = clean(json?.sent_at) || new Date().toISOString();
      const metaMessageId = clean(json?.meta_message_id);

      const saveError = await patchEntry(supabase, Number(entry.id), {
        wa_prepare_claimed_at: null,
        wa_prepare_sent_at: sentAt,
        wa_prepare_meta_message_id: metaMessageId || null,
        wa_prepare_last_error: null,
      });

      return {
        attempted: true,
        sent: true,
        skipped: false,
        reason: saveError ? "SENT_STATUS_SAVE_WARNING" : "SENT",
        queue_number: clean(entry.queue_number),
        meta_message_id: metaMessageId || undefined,
        error: saveError || undefined,
      };
    } catch (error: any) {
      const message =
        error?.name === "AbortError"
          ? "Timeout menghubungi Notiva."
          : clean(error?.message) || "Gagal menghubungi Notiva.";

      await releaseClaim(supabase, Number(entry.id), message);

      return {
        attempted: true,
        sent: false,
        skipped: false,
        reason: "NOTIVA_REQUEST_FAILED",
        queue_number: clean(entry.queue_number),
        error: message,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: any) {
    return {
      attempted: false,
      sent: false,
      skipped: true,
      reason: "UNEXPECTED_ERROR",
      error: clean(error?.message) || "Unexpected WhatsApp prepare error.",
    };
  }
}

export function onsiteWhatsAppPrepareSuffix(
  result: OnsiteWhatsAppPrepareResult | null | undefined
) {
  if (!result) return "";

  if (result.sent && !result.skipped) {
    return ` WhatsApp persiapan ${result.queue_number || "nomor berikutnya"} terkirim.`;
  }

  if (result.reason === "ALREADY_SENT") {
    return ` WhatsApp persiapan ${result.queue_number || "nomor berikutnya"} sudah pernah terkirim.`;
  }

  if (result.attempted && !result.sent) {
    return ` WhatsApp persiapan gagal${result.error ? `: ${result.error}` : "."}`;
  }

  return "";
}

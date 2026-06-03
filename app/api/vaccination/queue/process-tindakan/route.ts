import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../_utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(data: any, status = 200) {
  const res = NextResponse.json(data, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function clean(value: any) {
  return String(value ?? "").trim();
}

function toId(value: any) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const registrationId = toId(body.registration_id ?? body.registrationId ?? body.id);
    const sessionId = body.session_id ?? body.sessionId;
    const queueNumber = clean(body.queue_number ?? body.queueNumber);

    const supabase = supabaseAdmin();

    let query = supabase.from("vaccination_registrations").select("*");

    if (registrationId) {
      query = query.eq("id", registrationId);
    } else if (queueNumber && sessionId !== undefined && sessionId !== null && clean(sessionId) !== "") {
      query = query.eq("session_id", sessionId).eq("queue_number", queueNumber);
    } else if (queueNumber) {
      query = query.eq("queue_number", queueNumber);
    } else {
      return json({ ok: false, message: "Pilih peserta dulu sebelum Proses Tindakan." }, 400);
    }

    const found = await query.order("id", { ascending: false }).limit(1).maybeSingle();

    if (found.error) {
      return json({ ok: false, message: found.error.message || "Peserta tidak ditemukan." }, 500);
    }

    const row = found.data;
    if (!row?.id) {
      return json({ ok: false, message: "Peserta antrian tidak ditemukan." }, 404);
    }

    const payloadWithTime: any = {
      queue_status: "IN_PROGRESS",
      updated_at: new Date().toISOString(),
    };

    let updated = await supabase
      .from("vaccination_registrations")
      .update(payloadWithTime)
      .eq("id", row.id)
      .select("*")
      .maybeSingle();

    // Some schemas may not have updated_at. Retry safely without touching other fields.
    if (updated.error) {
      updated = await supabase
        .from("vaccination_registrations")
        .update({ queue_status: "IN_PROGRESS" })
        .eq("id", row.id)
        .select("*")
        .maybeSingle();
    }

    if (updated.error) {
      return json({ ok: false, message: updated.error.message || "Gagal mengubah status menjadi Dokter." }, 500);
    }

    return json({
      ok: true,
      message: "Status antrian diubah menjadi Dokter / Proses Tindakan.",
      registration: updated.data,
    });
  } catch (error: any) {
    return json({ ok: false, message: error?.message || "Gagal memproses tindakan." }, 500);
  }
}

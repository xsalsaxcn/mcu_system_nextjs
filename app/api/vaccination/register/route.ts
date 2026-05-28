import { NextRequest } from "next/server";
import { clean, fail, formatQueueNumber, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

async function getNextQueueNumber(supabase: any, sessionId: number) {
  const result = await supabase
    .from("vaccination_registrations")
    .select("queue_number")
    .eq("session_id", sessionId)
    .not("queue_number", "is", null);

  if (result.error) throw new Error(result.error.message);

  let maxNumber = 0;

  for (const row of result.data || []) {
    const text = String(row.queue_number || "");
    const match = text.match(/(\d+)$/);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > maxNumber) maxNumber = n;
  }

  return formatQueueNumber(maxNumber + 1);
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  const sourceId = toInt(req.nextUrl.searchParams.get("source_id"), 0);
  const supabase = supabaseAdmin();

  let query = supabase
    .from("vaccination_registrations")
    .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date,public_queue_token,source_id,source_name,default_vaccine_id,default_lot_id), vaccine:vaccination_vaccines(id,name,brand)")
    .order("id", { ascending: false })
    .limit(1000);

  if (sessionId) query = query.eq("session_id", sessionId);
  if (sourceId) query = query.eq("source_id", sourceId);

  const result = await query;
  if (result.error) return fail(result.error.message, 500);

  return ok({ registrations: result.data || [] });
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const action = clean(body.action);
  const supabase = supabaseAdmin();

  if (action === "release-queue") {
    const registrationId = toInt(body.registrationId || body.registration_id, 0);
    if (!registrationId) return fail("Peserta registrasi wajib dipilih.");

    const regResult = await supabase
      .from("vaccination_registrations")
      .select("*")
      .eq("id", registrationId)
      .single();

    if (regResult.error) return fail(regResult.error.message, 500);

    const reg = regResult.data;
    if (clean(reg.queue_number)) {
      return ok({ message: `Nomor antrian sudah dirilis: ${reg.queue_number}`, registration: reg });
    }

    const queueNumber = await getNextQueueNumber(supabase, Number(reg.session_id));

    const updateResult = await supabase
      .from("vaccination_registrations")
      .update({
        queue_number: queueNumber,
        queue_status: "WAITING",
        updated_at: new Date().toISOString(),
      })
      .eq("id", registrationId)
      .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date,public_queue_token,source_id,source_name,default_vaccine_id,default_lot_id), vaccine:vaccination_vaccines(id,name,brand)")
      .single();

    if (updateResult.error) return fail(updateResult.error.message, 500);

    return ok({ message: `Nomor antrian berhasil dirilis: ${queueNumber}`, registration: updateResult.data });
  }

  const sessionId = toInt(body.sessionId || body.session_id, 0);
  const participantName = clean(body.participantName || body.participant_name);

  if (!sessionId) return fail("Session wajib dipilih.");
  if (!participantName) return fail("Nama peserta wajib diisi.");

  const sessionResult = await supabase.from("vaccination_sessions").select("*").eq("id", sessionId).single();
  if (sessionResult.error) return fail(sessionResult.error.message, 500);
  const session = sessionResult.data || {};

  const vaccineIdInput = toInt(body.vaccineId, 0);
  const vaccineId = vaccineIdInput || toInt(session.default_vaccine_id, 0) || null;

  const queueNumber = clean(body.queueNumber) || await getNextQueueNumber(supabase, sessionId);

  const payload: Record<string, any> = {
    session_id: sessionId,
    source_id: toInt(body.sourceId, 0) || toInt(session.source_id, 0) || null,
    participant_id: toInt(body.participantId, 0) || null,
    vaccine_id: vaccineId || null,
    participant_name: participantName,
    employee_id: clean(body.employeeId) || null,
    nik: clean(body.nik) || null,
    mcu_id: clean(body.mcuId) || null,
    email: clean(body.email) || null,
    phone: clean(body.phone) || null,
    company_name: clean(body.companyName) || clean(session.company_name) || null,
    department: clean(body.department) || null,
    queue_number: queueNumber,
    queue_status: "WAITING",
    registered_by: ((user as any).email || (user as any).name || (user as any).id || "system"),
  };

  const result = await supabase
    .from("vaccination_registrations")
    .insert(payload)
    .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date,public_queue_token,source_id,source_name,default_vaccine_id,default_lot_id), vaccine:vaccination_vaccines(id,name,brand)")
    .single();

  if (result.error) return fail(result.error.message, 500);

  return ok({
    message: `Registrasi ulang berhasil. Nomor antrian: ${queueNumber}`,
    registration: result.data,
  });
}

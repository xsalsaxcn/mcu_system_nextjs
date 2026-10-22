import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function xmlEscape(value: any) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
function text(value: any) { return String(value ?? "").trim(); }
function boolLabel(value: any) { return value ? "Ya" : "Tidak"; }
function calcAge(value: any) {
  const raw = text(value); if (!raw) return "";
  const date = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date(); let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) age -= 1;
  return age >= 0 ? String(age) : "";
}
function sanitizeFilePart(value: any, fallback: string) {
  const cleaned = text(value).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
  return cleaned || fallback;
}
function cell(value: any, style = "Cell") {
  return `<Cell ss:StyleID="${style}"><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
}
function row(values: any[], style = "Cell") { return `<Row>${values.map((value) => cell(value, style)).join("")}</Row>`; }
function latestByParticipant(rows: any[]) {
  const map = new Map<number, any>();
  for (const item of rows || []) {
    const id = Number(item?.participant_id || 0); if (!id) continue;
    const current = map.get(id);
    if (!current || Number(item?.id || 0) >= Number(current?.id || 0)) map.set(id, item);
  }
  return map;
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  if (String((user as any)?.role || "") !== "admin") {
    return NextResponse.json({ ok: false, message: "Hanya admin yang dapat export data Registrasi Ulang." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  // MCU_CORPORATE_FULL_EXPORT_TYPES_V506_2
  const participantIds: number[] = Array.from(
    new Set<number>(
      (Array.isArray(body?.participant_ids) ? body.participant_ids : [])
        .map((value: any) => Number(value || 0))
        .filter((value: number) => Number.isFinite(value) && value > 0),
    ),
  ).slice(0, 1000);
  const queueSessionId = Number(body?.queue_session_id || 0);
  if (!participantIds.length) return NextResponse.json({ ok: false, message: "Tidak ada peserta untuk diexport." }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();
    const participantRes = await supabase.from("participants").select("*").in("id", participantIds).eq("program_type", "corporate");
    if (participantRes.error) throw new Error(participantRes.error.message);
    const participants = participantRes.data || [];
    if (!participants.length) return NextResponse.json({ ok: false, message: "Data peserta Corporate tidak ditemukan." }, { status: 404 });

    let queueSession: any = null; let assignments: any[] = []; let registrations: any[] = []; let queues: any[] = []; let informedRows: any[] = [];
    if (queueSessionId > 0) {
      const [sessionRes, assignmentRes, registrationRes, queueRes, informedRes] = await Promise.all([
        supabase.from("mcu_queue_sessions").select("*").eq("id", queueSessionId).maybeSingle(),
        supabase.from("mcu_participant_session_assignments").select("*").eq("queue_session_id", queueSessionId).in("participant_id", participantIds),
        supabase.from("mcu_registration_sessions").select("*").eq("queue_session_id", queueSessionId).in("participant_id", participantIds),
        supabase.from("mcu_queue_entries").select("*").eq("queue_session_id", queueSessionId).in("participant_id", participantIds),
        supabase.from("mcu_queue_informed").select("*").eq("queue_session_id", queueSessionId).in("participant_id", participantIds),
      ]);
      if (sessionRes.error) throw new Error(sessionRes.error.message);
      if (assignmentRes.error) throw new Error(assignmentRes.error.message);
      if (registrationRes.error) throw new Error(registrationRes.error.message);
      if (queueRes.error) throw new Error(queueRes.error.message);
      queueSession = sessionRes.data || null; assignments = assignmentRes.data || []; registrations = registrationRes.data || []; queues = queueRes.data || [];
      informedRows = informedRes.error ? [] : informedRes.data || [];
    }

    const companyIds = Array.from(new Set([...participants.map((item: any) => Number(item?.company_id || 0)), Number(queueSession?.company_id || 0)].filter(Boolean)));
    const packageIds = Array.from(new Set([...participants.map((item: any) => Number(item?.package_id || 0)), Number(queueSession?.package_id || 0)].filter(Boolean)));
    const sourceIds = Array.from(new Set([...participants.map((item: any) => Number(item?.source_id || 0)), ...assignments.map((item: any) => Number(item?.source_id || 0))].filter(Boolean)));
    const [companiesRes, packagesRes, sourcesRes] = await Promise.all([
      companyIds.length ? supabase.from("companies").select("id,name").in("id", companyIds) : Promise.resolve({ data: [], error: null } as any),
      packageIds.length ? supabase.from("packages").select("id,name").in("id", packageIds) : Promise.resolve({ data: [], error: null } as any),
      sourceIds.length ? supabase.from("participant_sources").select("id,name").in("id", sourceIds) : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (companiesRes.error) throw new Error(companiesRes.error.message);
    if (packagesRes.error) throw new Error(packagesRes.error.message);
    if (sourcesRes.error) throw new Error(sourcesRes.error.message);

    const companyMap: Map<number, any> = new Map<number, any>(
      (companiesRes.data || []).map(
        (item: any): [number, any] => [Number(item.id), item],
      ),
    );
    const packageMap: Map<number, any> = new Map<number, any>(
      (packagesRes.data || []).map(
        (item: any): [number, any] => [Number(item.id), item],
      ),
    );
    const sourceMap: Map<number, any> = new Map<number, any>(
      (sourcesRes.data || []).map(
        (item: any): [number, any] => [Number(item.id), item],
      ),
    );
    const assignmentMap: Map<number, any> = latestByParticipant(assignments);
    const registrationMap: Map<number, any> = latestByParticipant(registrations);
    const queueMap: Map<number, any> = latestByParticipant(queues);
    const informedMap: Map<number, any> = latestByParticipant(informedRows);
    const orderMap: Map<number, number> = new Map<number, number>(
      participantIds.map(
        (id: number, index: number): [number, number] => [id, index],
      ),
    );
    const sessionCompany = companyMap.get(Number(queueSession?.company_id || 0));
    const sessionPackage = packageMap.get(Number(queueSession?.package_id || 0));

    const headers = ["No","Participant ID","Nama Lengkap","Nomor MCU","Barcode Value","External ID / Binusian ID","NIK Karyawan","NIK / Identitas","Jenis Kelamin","Tanggal Lahir","Usia","Tanggal Pemeriksaan","Department Karyawan","Position / Jabatan Session","Provinsi / Lokasi Peserta","No HP / WhatsApp","Perusahaan","Company ID","Database Existing / Source","Source ID","Paket Peserta","Package ID","Program","Status Registrasi Global","Registrasi Ulang At","Status Registrasi Session","Registrasi Session At","Session ID","Session Name","Lokasi Session","Tanggal Session","Paket Session","Department Session","Nomor Antrian A","Sequence A","Status A","Called At A","Started At A","Finished At A","Cancelled At A","Cancel Reason A","Nomor Antrian B","Sequence B","Status B","Called At B","Started At B","Finished At B","Cancelled At B","Cancel Reason B","Status Informed","Informed At","Informed By","Label Print Count","Photo URL","Participant Created At","Participant Updated At"];
    const orderedParticipants = [...participants].sort((a: any, b: any) => Number(orderMap.get(Number(a.id)) ?? 999999) - Number(orderMap.get(Number(b.id)) ?? 999999));
    const exportRows = orderedParticipants.map((p: any, index: number) => {
      const participantId = Number(p?.id || 0), assignment = assignmentMap.get(participantId) || {}, registration = registrationMap.get(participantId) || {}, queue = queueMap.get(participantId) || {}, informed = informedMap.get(participantId) || {};
      const company = companyMap.get(Number(p?.company_id || 0)), pkg = packageMap.get(Number(p?.package_id || 0)), source = sourceMap.get(Number(p?.source_id || 0)), assignmentSource = sourceMap.get(Number(assignment?.source_id || 0));
      const birthDate = text(p?.birth_date || p?.date_of_birth), examDate = text(p?.examination_date || p?.exam_date || queueSession?.session_date);
      return [index+1,participantId,p?.name,p?.mcu_id,p?.barcode_value,p?.external_id,p?.employee_nik,p?.nik,p?.gender,birthDate,text(p?.age)||calcAge(birthDate),examDate,p?.department,assignment?.position,p?.province,p?.phone,company?.name||p?.company_name,p?.company_id,source?.name||assignmentSource?.name||p?.source_name,p?.source_id||assignment?.source_id,pkg?.name||p?.package_name,p?.package_id,p?.program_type,boolLabel(Number(p?.registrasi_ulang_done||0)===1||Boolean(p?.registrasi_ulang_at)),p?.registrasi_ulang_at,boolLabel(Boolean(registration?.participant_id)),registration?.registered_at||registration?.created_at||registration?.updated_at,queueSession?.id||queueSessionId||"",queueSession?.session_name,queueSession?.location,queueSession?.session_date,sessionPackage?.name||queueSession?.package_name,assignment?.department,queue?.a_queue_number,queue?.a_queue_sequence,queue?.a_status,queue?.a_called_at,queue?.a_started_at,queue?.a_finished_at,queue?.a_cancelled_at,queue?.a_cancel_reason,queue?.b_queue_number,queue?.b_queue_sequence,queue?.b_status,queue?.b_called_at,queue?.b_started_at,queue?.b_finished_at,queue?.b_cancelled_at,queue?.b_cancel_reason,informed?.informed_at?"Sudah di Informed":"Belum di Informed",informed?.informed_at,informed?.informed_by,p?.label_print_count,p?.photo_url,p?.created_at,p?.updated_at];
    });

    const workbook = `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Cell"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10"/></Style><Style ss:ID="Header"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#D9EAF7" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="Peserta MCU Corporate"><Table>${row(headers,"Header")}${exportRows.map((values)=>row(values,"Cell")).join("")}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions></Worksheet></Workbook>`;
    const location = sanitizeFilePart(queueSession?.location, "MCU_Corporate"), sessionDate = sanitizeFilePart(queueSession?.session_date, new Date().toISOString().slice(0,10)), companyName = sanitizeFilePart(sessionCompany?.name, "Company");
    const filename = `MCU_Corporate_${companyName}_${location}_${sessionDate}.xls`;
    return new NextResponse(workbook,{status:200,headers:{"Content-Type":"application/vnd.ms-excel; charset=utf-8","Content-Disposition":`attachment; filename="${filename}"`,"Cache-Control":"no-store, no-cache, must-revalidate"}});
  } catch (error: any) {
    return NextResponse.json({ ok:false, message:error?.message || "Gagal export data MCU Corporate." },{ status:500 });
  }
}

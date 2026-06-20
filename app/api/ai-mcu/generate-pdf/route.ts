import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { scoreCapaskaDirectChoice } from "@/lib/shared/capaskaDirectScoring2026";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    {
      ok: false,
      message,
      ...extra,
    },
    { status }
  );
}

function normalizeEngineUrl() {
  return String(process.env.AI_MCU_ENGINE_URL || "").replace(/\/$/, "");
}

function pick(...values: any[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && !["null", "undefined", "nan", "-"].includes(text.toLowerCase())) {
      return text;
    }
  }
  return "";
}

function formatDateId(value: any) {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

async function fetchParticipantsByIds(supabase: any, ids: number[]) {
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
  const chunks: number[][] = [];

  for (let i = 0; i < uniqueIds.length; i += 500) {
    chunks.push(uniqueIds.slice(i, i + 500));
  }

  const rows: any[] = [];

  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from("participants")
      .select("*")
      .in("id", chunk);

    if (error) throw new Error(error.message);
    rows.push(...(data || []));
  }

  const orderMap = new Map(uniqueIds.map((id, index) => [id, index]));
  rows.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

  return rows;
}

async function loadLookupMaps(supabase: any) {
  const [packages, sources, companies] = await Promise.all([
    supabase.from("packages").select("id,name"),
    supabase.from("participant_sources").select("id,name,institution_name,program_type"),
    supabase.from("companies").select("id,name"),
  ]);

  return {
    packageMap: new Map((packages.data || []).map((x: any) => [x.id, x.name])),
    sourceMap: new Map((sources.data || []).map((x: any) => [x.id, x])),
    companyMap: new Map((companies.data || []).map((x: any) => [x.id, x.name])),
  };
}

async function fetchImportRows(supabase: any, ids: number[]) {
  try {
    const { data, error } = await supabase
      .from("ai_mcu_import_rows")
      .select("participant_id,row_data,participant_name,mcu_id,nik,company_name,database_name")
      .in("participant_id", ids)
      .order("id", { ascending: true });

    if (error) return new Map();

    const map = new Map<number, any>();
    for (const row of data || []) {
      const pid = Number(row.participant_id);
      if (Number.isFinite(pid) && !map.has(pid)) {
        map.set(pid, row);
      }
    }

    return map;
  } catch {
    return new Map();
  }
}

function participantToRekapRow(
  p: any,
  importRow: any,
  maps: {
    packageMap: Map<any, any>;
    sourceMap: Map<any, any>;
    companyMap: Map<any, any>;
  }
) {
  const source = maps.sourceMap.get(p.source_id) as any;
  const companyName = maps.companyMap.get(p.company_id) as any;
  const packageName = maps.packageMap.get(p.package_id) as any;

  const uploadedRow = importRow?.row_data && typeof importRow.row_data === "object"
    ? importRow.row_data
    : {};

  const name = pick(uploadedRow.NAMA, uploadedRow.Nama, importRow?.participant_name, p.name, p.nama);
  const mcuId = pick(uploadedRow.NOMCU, uploadedRow["NO MCU"], importRow?.mcu_id, p.mcu_id, p.no_mcu, p.nomcu, p.barcode_value, p.external_id, p.id);
  const nik = pick(uploadedRow.NIK, uploadedRow["NIK/NRP/ID"], importRow?.nik, p.nik, p.external_id, p.employee_id, p.id);
  const medicalRecordNo = pick(uploadedRow.MEDICAL_RECORD_NO, uploadedRow.NO_MR, uploadedRow["No. Medical Record"], uploadedRow["No Medical Record"], uploadedRow["No MR"], uploadedRow["NO MR"], uploadedRow["MR"], uploadedRow["No Rekam Medis"], p.medical_record_no, p.no_mr, p.no_rekam_medis);
  const mcuDate = formatDateId(pick(uploadedRow["Tanggal MCU"], uploadedRow.TANGGAL_MCU, uploadedRow["TGL MCU"], uploadedRow.TGLMCU, uploadedRow["Tanggal Pemeriksaan"], p.mcu_date, uploadedRow.service_date, p.service_date, p.created_at, p.updated_at));
  const department = pick(uploadedRow.DEPARTEMEN, uploadedRow.DEPT, uploadedRow.Department, uploadedRow.Departemen, p.department, p.departement, p.division, p.unit);
  const bagian = pick(uploadedRow.BAGIAN, uploadedRow.Bagian, uploadedRow["Dept/Bagian"], uploadedRow.Unit, p.bagian, p.section, p.unit);
  const jabatan = pick(uploadedRow.JABATAN, uploadedRow.Jabatan, uploadedRow.Position, uploadedRow["Job Title"], p.jabatan, p.position);
  const company = pick(uploadedRow["Nama PT"], uploadedRow.PERUSAHAAN, uploadedRow.Perusahaan, uploadedRow.Company, uploadedRow["Company Name"], importRow?.company_name, companyName, source?.institution_name, source?.name, p.company_name, p.institution_name);
  const packageText = pick(uploadedRow.PAKET, uploadedRow.Paket, packageName, p.package_name, p.paket);

  return {
    ...uploadedRow,

    "_SheetName": pick(uploadedRow._SheetName, "FISIK"),
    "Nama PT": company,
    "PERUSAHAAN": company,
    "Perusahaan": company,
    "Tanggal MCU": mcuDate,
    "TANGGAL_MCU": mcuDate,
    "Issueddate": formatDateId(new Date().toISOString()),

    "NOMCU": mcuId,
    "NO MCU": mcuId,
    "NO.MCU": mcuId,
    "No. Medical Record": medicalRecordNo,
    "No Medical Record": medicalRecordNo,
    "MEDICAL_RECORD_NO": medicalRecordNo,
    "NO MR": medicalRecordNo,
    "NO_MR": medicalRecordNo,
    "No Rekam Medis": medicalRecordNo,
    "NO.URUT": pick(uploadedRow["NO.URUT"], uploadedRow["NO URUT"], p.no_urut, p.urut, p.sequence_no, p.barcode_value, mcuId),

    "NAMA": name,
    "Nama": name,

    "JK": pick(uploadedRow.JK, uploadedRow.Gender, p.gender, p.sex, p.jenis_kelamin),
    "TGLLAHIR": formatDateId(pick(uploadedRow.TGLLAHIR, uploadedRow["Tanggal Lahir"], p.birth_date, p.date_of_birth, p.tanggal_lahir)),
    "USIA": pick(uploadedRow.USIA, uploadedRow.Usia, p.age, p.usia),

    "NIK": nik,
    "NIK/NRP/ID": nik,

    "DEPARTEMEN": department,
    "Department": department,
    "DEPT": department,
    "Bagian": bagian,
    "BAGIAN": bagian,
    "Jabatan": jabatan,
    "JABATAN": jabatan,
    "PAKET": packageText,
    "KATEGORI": pick(uploadedRow.KATEGORI, p.program_type, source?.program_type, "corporate"),

    "KESIMPULAN": pick(uploadedRow.KESIMPULAN, uploadedRow.Kesimpulan, p.conclusion, p.kesimpulan),
    "SARAN": pick(uploadedRow.SARAN, uploadedRow.Saran, p.recommendation, p.saran),
    "FIT_STATUS": pick(uploadedRow.FIT_STATUS, uploadedRow.fitStatus, p.fit_status, p.status_fit),
  };
}


// CAPASKA_PDF_DETAILED_TEMPLATE_V341
function isCapaskaTextV341(...values: any[]) {
  return values.some((value) => String(value || "").toLowerCase().includes("capaska"));
}

function isAuxCapaskaParamV341(param: any) {
  const name = String(param?.name || "").trim().toLowerCase();
  const category = String(param?.category || "").trim().toLowerCase();
  if (!name) return true;
  if (name.startsWith("value ") || name.startsWith("value")) return true;
  if (name.includes("total score") || name.includes("total skor")) return true;
  if (name.includes("skor maksimal") || name.includes("score maksimal")) return true;
  if (category.includes("hidden") || category.includes("system")) return true;
  return false;
}

function cleanCapaskaPdfValueV341(value: any) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text || ["-", "null", "undefined", "nan"].includes(text.toLowerCase())) return "";
  return text;
}

async function fetchCapaskaPdfDetailRowsV341(supabase: any, participantIds: number[], participantMap: Map<number, any>, importRowMap: Map<number, any>) {
  const uniqueIds = Array.from(new Set((participantIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
  if (!uniqueIds.length) return [];

  const [paramsRes, postsRes] = await Promise.all([
    supabase.from("parameters").select("*").order("post_id", { ascending: true }).order("sort_order", { ascending: true }).order("id", { ascending: true }),
    supabase.from("posts").select("*")
  ]);

  const params = paramsRes.data || [];
  const posts = postsRes.data || [];
  // CAPASKA_PDF_DETAILED_TEMPLATE_TYPE_FIX_V342
  const paramById = new Map<number, any>(params.map((p: any) => [Number(p.id), p]));
  const postName = new Map(posts.map((p: any) => [Number(p.id), p.name]));

  const results: any[] = [];
  const staffRows: any[] = [];
  for (let i = 0; i < uniqueIds.length; i += 400) {
    const chunk = uniqueIds.slice(i, i + 400);
    const { data: resultChunk, error: resultError } = await supabase
      .from("examination_results")
      .select("participant_id,parameter_id,value,updated_at,created_at")
      .in("participant_id", chunk);
    if (resultError) throw new Error(resultError.message);
    results.push(...(resultChunk || []));

    try {
      const { data: staffChunk } = await supabase
        .from("mcu_stage_staff_assignments")
        .select("participant_id,post_id,staff_name")
        .in("participant_id", chunk);
      staffRows.push(...(staffChunk || []));
    } catch (_) {
      // staff assignment is optional for PDF detail.
    }
  }

  const doctorsByParticipantPost = new Map<string, string[]>();
  for (const row of staffRows) {
    const key = String(Number(row.participant_id)) + ":" + String(Number(row.post_id));
    const current = doctorsByParticipantPost.get(key) || [];
    const staff = cleanCapaskaPdfValueV341(row.staff_name);
    if (staff && !current.includes(staff)) current.push(staff);
    doctorsByParticipantPost.set(key, current);
  }

  const rows: any[] = [];
  for (const result of results) {
    const participantId = Number(result.participant_id);
    const param = paramById.get(Number(result.parameter_id));
    const paramAny: any = param;
    if (!paramAny || isAuxCapaskaParamV341(paramAny)) continue;
    const value = cleanCapaskaPdfValueV341(result.value);
    if (!value) continue;

    let score: any = "";
    try { score = scoreCapaskaDirectChoice(paramAny, value); } catch (_) { score = ""; }

    const participant = participantMap.get(participantId) || {};
    const importRow = importRowMap.get(participantId) || {};
    const uploaded = importRow?.row_data && typeof importRow.row_data === "object" ? importRow.row_data : {};
    const mcuId = pick(uploaded.NOMCU, uploaded["NO MCU"], importRow?.mcu_id, participant.mcu_id, participant.external_id, participant.id);
    const name = pick(uploaded.NAMA, uploaded.Nama, importRow?.participant_name, participant.name, participant.nama);
    const postId = Number(paramAny.post_id || 0);
    const doctorKey = String(participantId) + ":" + String(postId);

    rows.push({
      participantId,
      name,
      mcuId,
      postId,
      postName: postName.get(postId) || "Post " + postId,
      category: paramAny.category || "",
      parameter: paramAny.name || "",
      value,
      score,
      sortOrder: Number(paramAny.sort_order || paramAny.order_no || paramAny.id || 0),
      updatedAt: result.updated_at || result.created_at || "",
      doctorNames: doctorsByParticipantPost.get(doctorKey) || [],
    });
  }

  rows.sort((a, b) => {
    const pid = Number(a.participantId) - Number(b.participantId);
    if (pid) return pid;
    const post = Number(a.postId) - Number(b.postId);
    if (post) return post;
    return Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
  });
  return rows;
}

export async function POST(req: NextRequest) {
  try {
    const user = getSessionUser(req);
    if (!user) return fail("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));

    const modeRaw = String(body.mode || "single");
    const uploadDrive = Boolean(body.uploadDrive);
    const mergePdfRequested = Boolean(body.mergePdf);
    const participantIds = Array.isArray(body.participantIds)
      ? body.participantIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id))
      : [];

    if (!["single", "batch"].includes(modeRaw)) {
      return fail("Mode generate tidak valid.");
    }

    if (!participantIds.length) {
      return fail("Pilih minimal 1 peserta untuk generate PDF.");
    }

    // CAPASKA_GENERATE_PDF_SINGLE_FAST_V335
    const mergePdf = mergePdfRequested && participantIds.length > 1;

    const engineUrl = normalizeEngineUrl();

    if (!engineUrl) {
      return fail("AI_MCU_ENGINE_URL belum dikonfigurasi di Vercel.", 500);
    }

    const supabase = getSupabaseAdmin();

    const participants = await fetchParticipantsByIds(supabase, participantIds);

    if (!participants.length) {
      return fail("Data peserta tidak ditemukan.");
    }

    const maps = await loadLookupMaps(supabase);
    const importRows = await fetchImportRows(supabase, participantIds);

    // CAPASKA_PDF_DETAILED_TEMPLATE_V341
    const participantMapV341 = new Map((participants || []).map((p: any) => [Number(p.id), p]));
    const isCapaskaPdfV341 = (participants || []).some((p: any) => isCapaskaTextV341(p.program_type, p.package_name, p.mcu_id, p.external_id)) || isCapaskaTextV341(body.program, body.template);
    const capaskaPdfRowsV341 = isCapaskaPdfV341
      ? await fetchCapaskaPdfDetailRowsV341(supabase, participantIds, participantMapV341, importRows)
      : [];

    const rekapRows = participants.map((p) => participantToRekapRow(p, importRows.get(Number(p.id)), maps));
    const names = rekapRows.map((row) => pick(row.NAMA, row.Nama)).filter(Boolean);

    const firstSource = maps.sourceMap.get(participants[0]?.source_id) as any;
    const firstCompany = maps.companyMap.get(participants[0]?.company_id) as any;
    const firstImport = importRows.get(Number(participants[0]?.id)) as any;

    const effectiveMode = participants.length > 1 ? "batch" : modeRaw;

    const res = await fetch(`${engineUrl}/generate-pdf-async`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        mode: effectiveMode,
        uploadDrive,
        mergePdf,
        baseUrl: engineUrl,
        names,
        rekapRows,
        abnRows: [],
        condRows: [],
        company: pick(
          firstImport?.company_name,
          firstCompany,
          firstSource?.institution_name,
          firstSource?.name,
          "AI MCU"
        ),
        year: new Date().getFullYear(),
        // CAPASKA_PDF_DETAILED_TEMPLATE_V341
        template: isCapaskaPdfV341 ? "capaska" : "corporate",
        program: isCapaskaPdfV341 ? "capaska" : String(participants[0]?.program_type || body.program || ""),
        capaskaRows: capaskaPdfRowsV341,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      return fail(json.message || "Gagal memulai job PDF.", 500, {
        engineStatus: res.status,
        response: json,
      });
    }

    return NextResponse.json({
      ok: true,
      status: json.status || "queued",
      message: json.message || "Generate PDF dimulai.",
      jobId: json.jobId,
      progress: Number(json.progress || 0),
      current: Number(json.current || 0),
      total: Number(json.total || participants.length),
      selectedCount: participants.length,
      importedRowsUsed: importRows.size,
      engineMode: json.engineMode || "python-engine-async",
    });
  } catch (error: any) {
    return fail(error?.message || "Generate PDF gagal.", 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

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
  const company = pick(uploadedRow["Nama PT"], uploadedRow.Perusahaan, importRow?.company_name, companyName, source?.institution_name, source?.name, p.company_name, p.institution_name);
  const packageText = pick(uploadedRow.PAKET, uploadedRow.Paket, packageName, p.package_name, p.paket);

  return {
    ...uploadedRow,

    "_SheetName": pick(uploadedRow._SheetName, "FISIK"),
    "Nama PT": company,
    "Tanggal MCU": formatDateId(p.mcu_date || uploadedRow["Tanggal MCU"] || p.created_at || p.updated_at),
    "Issueddate": formatDateId(new Date().toISOString()),

    "NOMCU": mcuId,
    "NO MCU": mcuId,
    "NO.MCU": mcuId,
    "NO.URUT": pick(uploadedRow["NO.URUT"], uploadedRow["NO URUT"], p.no_urut, p.urut, p.sequence_no, p.barcode_value, mcuId),

    "NAMA": name,
    "Nama": name,

    "JK": pick(uploadedRow.JK, uploadedRow.Gender, p.gender, p.sex, p.jenis_kelamin),
    "TGLLAHIR": formatDateId(pick(uploadedRow.TGLLAHIR, uploadedRow["Tanggal Lahir"], p.birth_date, p.date_of_birth, p.tanggal_lahir)),
    "USIA": pick(uploadedRow.USIA, uploadedRow.Usia, p.age, p.usia),

    "NIK": nik,
    "NIK/NRP/ID": nik,

    "DEPARTEMEN": pick(uploadedRow.DEPARTEMEN, uploadedRow.Department, p.department, p.departement, p.division, p.unit, p.bagian),
    "PAKET": packageText,
    "KATEGORI": pick(uploadedRow.KATEGORI, p.program_type, source?.program_type, "corporate"),

    "KESIMPULAN": pick(uploadedRow.KESIMPULAN, uploadedRow.Kesimpulan, p.conclusion, p.kesimpulan),
    "SARAN": pick(uploadedRow.SARAN, uploadedRow.Saran, p.recommendation, p.saran),
    "FIT_STATUS": pick(uploadedRow.FIT_STATUS, uploadedRow.fitStatus, p.fit_status, p.status_fit),
  };
}

export async function POST(req: NextRequest) {
  try {
    const user = getSessionUser(req);
    if (!user) return fail("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));

    const modeRaw = String(body.mode || "single");
    const uploadDrive = Boolean(body.uploadDrive);
    const mergePdf = Boolean(body.mergePdf);
    const participantIds = Array.isArray(body.participantIds)
      ? body.participantIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id))
      : [];

    if (!["single", "batch"].includes(modeRaw)) {
      return fail("Mode generate tidak valid.");
    }

    if (!participantIds.length) {
      return fail("Pilih minimal 1 peserta untuk generate PDF.");
    }

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

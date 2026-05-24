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

function participantToRekapRow(
  p: any,
  maps: {
    packageMap: Map<any, any>;
    sourceMap: Map<any, any>;
    companyMap: Map<any, any>;
  }
) {
  const source = maps.sourceMap.get(p.source_id);
  const companyName = maps.companyMap.get(p.company_id);
  const packageName = maps.packageMap.get(p.package_id);

  const name = pick(p.name, p.nama);
  const mcuId = pick(p.mcu_id, p.no_mcu, p.nomcu, p.barcode_value, p.external_id, p.id);
  const nik = pick(p.nik, p.external_id, p.employee_id, p.id);
  const birthDate = pick(p.birth_date, p.date_of_birth, p.tanggal_lahir, p.dob);
  const gender = pick(p.gender, p.sex, p.jenis_kelamin, p.jk);
  const department = pick(p.department, p.departement, p.division, p.unit, p.bagian);
  const company = pick(companyName, source?.institution_name, source?.name, p.company_name, p.institution_name);
  const packageText = pick(packageName, p.package_name, p.paket);

  return {
    "_SheetName": "FISIK",

    "Nama PT": company,
    "Tanggal MCU": formatDateId(p.mcu_date || p.created_at || p.updated_at),
    "Issueddate": formatDateId(new Date().toISOString()),

    "NOMCU": mcuId,
    "NO MCU": mcuId,
    "NO.MCU": mcuId,
    "NO.URUT": pick(p.no_urut, p.urut, p.sequence_no, p.barcode_value, mcuId),

    "NAMA": name,
    "Nama": name,

    "JK": gender,
    "TGLLAHIR": formatDateId(birthDate),
    "USIA": pick(p.age, p.usia),

    "NIK": nik,
    "NIK/NRP/ID": nik,

    "DEPARTEMEN": department,
    "PAKET": packageText,
    "KATEGORI": pick(p.program_type, source?.program_type, "corporate"),

    "KESIMPULAN": pick(p.conclusion, p.kesimpulan),
    "SARAN": pick(p.recommendation, p.saran),
    "FIT_STATUS": pick(p.fit_status, p.status_fit),
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

    const rekapRows = participants.map((p) => participantToRekapRow(p, maps));
    const names = participants.map((p) => pick(p.name, p.nama)).filter(Boolean);

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
          maps.companyMap.get(participants[0]?.company_id),
          maps.sourceMap.get(participants[0]?.source_id)?.institution_name,
          maps.sourceMap.get(participants[0]?.source_id)?.name,
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
      engineMode: json.engineMode || "python-engine-async",
    });
  } catch (error: any) {
    return fail(error?.message || "Generate PDF gagal.", 500);
  }
}

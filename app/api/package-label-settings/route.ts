import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

const STATION_PRINT_OPTIONS = [
  { key: "registrasi_ulang", label: "REGISTRASI ULANG", shortCode: "REG", defaultCopies: 1 },
  { key: "pemeriksaan_fisik", label: "PEMERIKSAAN FISIK", shortCode: "FISIK", defaultCopies: 1 },
  { key: "darah", label: "DARAH", shortCode: "DRH", defaultCopies: 1 },
  { key: "urine", label: "URINE", shortCode: "URN", defaultCopies: 1 },
  { key: "dokter", label: "DOKTER", shortCode: "DOK", defaultCopies: 1 },
  { key: "rontgen", label: "RONTGEN", shortCode: "RO", defaultCopies: 1 },
  { key: "ekg_hasil", label: "EKG - HASIL", shortCode: "EKG", defaultCopies: 1 },
  { key: "ekg_nakes", label: "EKG - NAKES", shortCode: "EKG", defaultCopies: 1 },
  { key: "audio", label: "AUDIO", shortCode: "AUD", defaultCopies: 1 },
  { key: "mata", label: "MATA", shortCode: "MATA", defaultCopies: 1 },
  { key: "tht", label: "THT", shortCode: "THT", defaultCopies: 1 },
  { key: "gigi", label: "GIGI", shortCode: "GIGI", defaultCopies: 2 },
  { key: "penyakit_dalam", label: "PENYAKIT DALAM", shortCode: "PD", defaultCopies: 1 },
  { key: "jantung", label: "JANTUNG", shortCode: "JTG", defaultCopies: 1 },
  { key: "radiologi", label: "RADIOLOGI", shortCode: "RAD", defaultCopies: 1 },
  { key: "ortopedi", label: "ORTOPEDI", shortCode: "ORT", defaultCopies: 1 }
];


function readBarcodeCategory(configJson: any) {
  try {
    const parsed = typeof configJson === "string" ? JSON.parse(configJson || "[]") : configJson;
    return String(parsed?.barcode_category || "paket").toLowerCase() === "non_paket"
      ? "non_paket"
      : "paket";
  } catch {
    return "paket";
  }
}

function makeNonPackageStation(parameter: any) {
  const id = Number(parameter?.id || 0);
  const label = String(parameter?.name || `PARAMETER ${id}`).trim() || `PARAMETER ${id}`;
  const shortCode = label
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 4))
    .join("")
    .slice(0, 12) || `NP${id}`;

  return {
    key: `non_paket_parameter_${id}`,
    label,
    shortCode,
    defaultCopies: 1,
    parameter_id: id
  };
}

function defaultSettings(packageId: number, programType: string) {
  return STATION_PRINT_OPTIONS.map((station) => ({
    package_id: packageId,
    program_type: programType,
    station_key: station.key,
    station_label: station.label,
    short_code: station.shortCode,
    default_copies: station.defaultCopies,
    is_active: 1
  }));
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const supabase = getSupabaseAdmin();
  const program = req.nextUrl.searchParams.get("program") || "capaska";
  const packageId = Number(req.nextUrl.searchParams.get("package_id") || 0);

  if (!packageId) {
    const { data, error } = await supabase
      .from("packages")
      .select("id,name,program_type,company_id,is_active")
      .eq("program_type", program)
      .order("name", { ascending: true });

    if (error) return fail(error.message, 500);

    return ok({
      packages: (data || []).filter((pkg: any) => pkg.is_active === 1 || pkg.is_active === true || pkg.is_active === null)
    });
  }

  const { data, error } = await supabase
    .from("package_label_print_settings")
    .select("*")
    .eq("package_id", packageId)
    .order("station_key", { ascending: true });

  if (error) return fail(error.message, 500);

  let nonPackageStations: any[] = [];

  if (String(program).toLowerCase() === "corporate") {
    const mappingsRes = await supabase
      .from("package_parameters")
      .select("parameter_id,sort_order")
      .eq("package_id", packageId)
      .order("sort_order", { ascending: true });

    if (mappingsRes.error) return fail(mappingsRes.error.message, 500);

    const mappedIds = (mappingsRes.data || [])
      .map((row: any) => Number(row.parameter_id))
      .filter((id: number) => Number.isFinite(id) && id > 0);

    if (mappedIds.length) {
      const parametersRes = await supabase
        .from("parameters")
        .select("id,name,config_json,is_active,sort_order,program_type")
        .in("id", mappedIds)
        .eq("program_type", "corporate")
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });

      if (parametersRes.error) return fail(parametersRes.error.message, 500);

      const mappingOrder = new Map<number, number>();
      (mappingsRes.data || []).forEach((row: any, index: number) => {
        mappingOrder.set(Number(row.parameter_id), Number(row.sort_order ?? index + 1));
      });

      nonPackageStations = (parametersRes.data || [])
        .filter((parameter: any) => parameter.is_active === 1 || parameter.is_active === true || parameter.is_active === null)
        .filter((parameter: any) => readBarcodeCategory(parameter.config_json) === "non_paket")
        .sort((a: any, b: any) => {
          const aOrder = mappingOrder.get(Number(a.id)) ?? Number(a.sort_order || 0);
          const bOrder = mappingOrder.get(Number(b.id)) ?? Number(b.sort_order || 0);
          return aOrder - bOrder || Number(a.id) - Number(b.id);
        })
        .map(makeNonPackageStation);
    }
  }

  return ok({
    settings: data?.length ? data : defaultSettings(packageId, program),
    source: data?.length ? "database" : "default",
    non_package_stations: nonPackageStations
  });
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const body = await req.json();
  const supabase = getSupabaseAdmin();

  const packageId = Number(body.package_id || 0);
  const programType = String(body.program_type || "capaska");
  const settings = Array.isArray(body.settings) ? body.settings : [];

  if (!packageId) return fail("Paket tidak valid.", 400);

  const rows = settings.map((setting: any) => ({
    package_id: packageId,
    program_type: programType,
    station_key: String(setting.station_key || ""),
    station_label: String(setting.station_label || ""),
    short_code: String(setting.short_code || ""),
    default_copies: Math.max(0, Math.min(20, Number(setting.default_copies || 0))),
    is_active: 1,
    updated_at: new Date().toISOString()
  })).filter((row: any) => row.station_key);

  const { error } = await supabase
    .from("package_label_print_settings")
    .upsert(rows, {
      onConflict: "package_id,station_key"
    });

  if (error) return fail(error.message, 500);

  return ok({
    message: "Setting label paket berhasil disimpan.",
    count: rows.length
  });
}

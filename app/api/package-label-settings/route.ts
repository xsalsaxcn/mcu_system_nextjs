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

function defaultSettings(packageId: number, programType: string) {
  return STATION_PRINT_OPTIONS.map((station) => ({
    package_id: packageId,
    program_type: programType,
    station_key: station.key,
    station_label: station.label,
    short_code: station.shortCode,
    default_copies: station.defaultCopies,
    font_size: 9,
    show_border: 0,
    show_qr: 1,
    show_footer_text: 1,
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

  if (!data?.length) {
    const defaults = defaultSettings(packageId, program);

    return ok({
      settings: defaults,
      label_style: defaults[0],
      source: "default"
    });
  }

  return ok({
    settings: data,
    label_style: data[0],
    source: "database"
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
    font_size: Math.max(7, Math.min(14, Number(setting.font_size || body.font_size || 9))),
    show_border: Number(setting.show_border ?? body.show_border ?? 0) === 1 ? 1 : 0,
    show_qr: Number(setting.show_qr ?? body.show_qr ?? 1) === 1 ? 1 : 0,
    show_footer_text: Number(setting.show_footer_text ?? body.show_footer_text ?? 1) === 1 ? 1 : 0,
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

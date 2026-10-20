import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

type StationTemplate = {
  key: string;
  label: string;
  shortCode: string;
  defaultCopies: number;
};

const STATION_PRINT_OPTIONS: StationTemplate[] = [
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

const STATION_BY_KEY = new Map(STATION_PRINT_OPTIONS.map((station) => [station.key, station]));

function defaultSettings(packageId: number, programType: string, stations = STATION_PRINT_OPTIONS) {
  return stations.map((station) => ({
    package_id: packageId,
    program_type: programType,
    station_key: station.key,
    station_label: station.label,
    short_code: station.shortCode,
    default_copies: station.defaultCopies,
    is_active: 1
  }));
}

function normalizeText(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCorporateNonPackageCategory(value: any) {
  const text = normalizeText(value);
  if (!text) return false;
  return text === "non paket" || text === "nonpackage" || text === "non package" || (text.includes("non") && text.includes("paket"));
}

function stationKeysFromText(value: any): string[] {
  const text = normalizeText(value);
  if (!text) return [];

  if (text.includes("registrasi")) return ["registrasi_ulang"];
  if (text.includes("ekg") || text.includes("elektrokardi")) return ["ekg_hasil", "ekg_nakes"];
  if (text.includes("rontgen") || text.includes("x ray") || text.includes("xray") || text.includes("thorax") || text.includes("thoraks")) return ["rontgen"];
  if (text.includes("audio") || text.includes("audiometri") || text.includes("audiometry")) return ["audio"];
  if (text.includes("pemeriksaan fisik") || text === "fisik" || text.includes("physical exam") || text.includes("general check up")) return ["pemeriksaan_fisik"];
  if (text.includes("urine") || text.includes("urinalisa") || text.includes("urinalysis")) return ["urine"];
  if (text.includes("mata") || text.includes("visus") || text.includes("refraksi") || text.includes("refraction")) return ["mata"];
  if (text === "tht" || text.includes("telinga hidung tenggorok") || text.includes("ent")) return ["tht"];
  if (text.includes("gigi") || text.includes("dental") || text.includes("odont")) return ["gigi"];
  if (text.includes("penyakit dalam") || text.includes("internal medicine")) return ["penyakit_dalam"];
  if (text.includes("jantung") || text.includes("kardiologi") || text.includes("cardio")) return ["jantung"];
  if (text.includes("radiologi") || text.includes("radiology")) return ["radiologi"];
  if (text.includes("ortopedi") || text.includes("orthop")) return ["ortopedi"];
  if (text.includes("darah") || text.includes("laboratorium") || text === "lab" || text.startsWith("lab ") || text.includes("hematologi") || text.includes("kimia darah")) return ["darah"];
  if (text.includes("dokter") || text.includes("doctor")) return ["dokter"];

  return [];
}

function specificStationKeysFromParameterName(value: any): string[] {
  const text = normalizeText(value);
  if (!text) return [];
  if (text.includes("ekg") || text.includes("elektrokardi")) return ["ekg_hasil", "ekg_nakes"];
  if (text.includes("rontgen") || text.includes("x ray") || text.includes("xray") || text.includes("thorax") || text.includes("thoraks")) return ["rontgen"];
  if (text.includes("audio") || text.includes("audiometri") || text.includes("audiometry")) return ["audio"];
  return [];
}

function stationOptionsForPaketParameter(parameter: any, postName: string): StationTemplate[] {
  const specific = specificStationKeysFromParameterName(parameter?.name);
  const keys = specific.length ? specific : stationKeysFromText(postName || parameter?.name);

  if (keys.length) {
    return keys
      .map((key) => STATION_BY_KEY.get(key))
      .filter(Boolean) as StationTemplate[];
  }

  const postId = Number(parameter?.post_id || 0);
  const fallbackLabel = String(postName || parameter?.name || "PEMERIKSAAN").trim().toUpperCase();
  const fallbackKey = postId ? `paket_post_${postId}` : `paket_param_${Number(parameter?.id || 0)}`;

  return [{
    key: fallbackKey,
    label: fallbackLabel,
    shortCode: "PKT",
    defaultCopies: 1
  }];
}

async function loadCorporateBarcodePlan(supabase: any, packageId: number) {
  const { data: mappings, error: mappingError } = await supabase
    .from("package_parameters")
    .select("parameter_id,sort_order")
    .eq("package_id", packageId)
    .order("sort_order", { ascending: true });

  if (mappingError) throw mappingError;

  const orderedMappings = (mappings || []).filter((row: any) => Number(row.parameter_id || 0));
  const parameterIds = orderedMappings.map((row: any) => Number(row.parameter_id));

  const registration = STATION_BY_KEY.get("registrasi_ulang")!;

  if (!parameterIds.length) {
    return {
      availableStations: [{
        station_key: registration.key,
        station_label: registration.label,
        short_code: registration.shortCode,
        default_copies: registration.defaultCopies,
        kind: "system"
      }],
      nonPackageParameters: [],
      packageParameters: []
    };
  }

  const { data: parameters, error: parameterError } = await supabase
    .from("parameters")
    .select("id,name,category,post_id,sort_order,is_active,program_type")
    .in("id", parameterIds)
    .eq("program_type", "corporate");

  if (parameterError) throw parameterError;

  const activeParameters = (parameters || []).filter((parameter: any) => {
    return parameter.is_active === null || parameter.is_active === undefined || parameter.is_active === 1 || parameter.is_active === true;
  });

  const parameterMap = new Map<number, any>(
    activeParameters.map((parameter: any): [number, any] => [Number(parameter.id), parameter])
  );
  const postIds = Array.from(new Set(activeParameters.map((parameter: any) => Number(parameter.post_id || 0)).filter(Boolean)));

  let postMap = new Map<number, string>();
  if (postIds.length) {
    const { data: posts, error: postError } = await supabase
      .from("posts")
      .select("id,name")
      .in("id", postIds);
    if (postError) throw postError;
    postMap = new Map((posts || []).map((post: any) => [Number(post.id), String(post.name || "")]));
  }

  const paketStations: StationTemplate[] = [];
  const nonPackageParameters: any[] = [];
  const packageParameters: any[] = [];

  // REGISTRASI ULANG adalah station sistem. Masukkan ke seen sejak awal supaya
  // parameter/post bernama Registrasi Ulang tidak bisa membuat station duplikat.
  const seenStationKeys = new Set<string>([registration.key]);
  const seenNonPackageLabels = new Set<string>();

  for (const mapping of orderedMappings) {
    const parameter = parameterMap.get(Number(mapping.parameter_id));
    if (!parameter) continue;

    const postName = postMap.get(Number(parameter.post_id || 0)) || "";
    const categoryText = normalizeText(parameter.category);
    const isNonPackage = isCorporateNonPackageCategory(parameter.category)
      || (categoryText.includes("non") && categoryText.includes("paket"));

    const parameterName = String(parameter.name || "").trim();
    const registrationLike =
      stationKeysFromText(postName).includes("registrasi_ulang")
      || stationKeysFromText(parameterName).includes("registrasi_ulang");

    packageParameters.push({
      parameter_id: Number(parameter.id),
      parameter_name: parameterName,
      raw_category: String(parameter.category || ""),
      barcode_category: isNonPackage ? "Non Paket" : "Paket",
      post_id: Number(parameter.post_id || 0) || null,
      post_name: postName || null,
      ignored_system_registration: !isNonPackage && registrationLike
    });

    // IMPORTANT: kategori Non Paket menang atas nama Post Pemeriksaan.
    // Contoh Informed Consent berada di post Registrasi Corporate, tetapi karena
    // kategorinya Non Paket maka label harus bernama "Informed Consent", bukan
    // dipetakan menjadi station sistem REGISTRASI ULANG.
    if (isNonPackage) {
      const normalizedLabel = normalizeText(parameterName);
      if (!parameterName || !normalizedLabel || seenNonPackageLabels.has(normalizedLabel)) continue;
      seenNonPackageLabels.add(normalizedLabel);

      nonPackageParameters.push({
        parameter_id: Number(parameter.id),
        station_key: `non_paket_param_${Number(parameter.id)}`,
        station_label: parameterName,
        short_code: "NP",
        default_copies: 1,
        kind: "non_paket"
      });
      continue;
    }

    // Hanya parameter kategori Paket yang boleh dipetakan ke station sistem.
    // REGISTRASI ULANG tetap satu kali dari station sistem bawaan.
    if (registrationLike) continue;

    // Kategori Paket tetap memakai station/post pemeriksaan.
    for (const station of stationOptionsForPaketParameter(parameter, postName)) {
      // Jangan pernah menambahkan REGISTRASI ULANG dari mapping paket.
      if (station.key === registration.key) continue;
      if (seenStationKeys.has(station.key)) continue;
      seenStationKeys.add(station.key);
      paketStations.push(station);
    }
  }

  const availableStations = [
    {
      station_key: registration.key,
      station_label: registration.label,
      short_code: registration.shortCode,
      default_copies: registration.defaultCopies,
      kind: "system"
    },
    ...paketStations.map((station) => ({
      station_key: station.key,
      station_label: station.label,
      short_code: station.shortCode,
      default_copies: station.defaultCopies,
      kind: "paket"
    })),
    ...nonPackageParameters
  ];

  return {
    availableStations,
    nonPackageParameters,
    packageParameters
  };
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

  if (program !== "corporate") {
    if (!data?.length) {
      return ok({
        settings: defaultSettings(packageId, program),
        source: "default"
      });
    }

    return ok({
      settings: data,
      source: "database"
    });
  }

  try {
    const plan = await loadCorporateBarcodePlan(supabase, packageId);
    const savedMap = new Map((data || []).map((row: any) => [String(row.station_key || ""), row]));

    const settings = plan.availableStations.map((station: any) => {
      const saved: any = savedMap.get(String(station.station_key || ""));
      return {
        ...(saved || {}),
        package_id: packageId,
        program_type: "corporate",
        station_key: station.station_key,
        station_label: station.station_label,
        short_code: station.short_code,
        default_copies: saved
          ? Math.max(0, Math.min(20, Number(saved.default_copies ?? station.default_copies ?? 1)))
          : Math.max(0, Math.min(20, Number(station.default_copies ?? 1))),
        is_active: saved?.is_active ?? 1
      };
    });

    const hasRelevantSavedSetting = settings.some((setting: any) => savedMap.has(String(setting.station_key || "")));

    return ok({
      settings,
      source: hasRelevantSavedSetting ? "database" : "default",
      available_stations: plan.availableStations,
      non_package_parameters: plan.nonPackageParameters,
      package_parameters: plan.packageParameters
    });
  } catch (planError: any) {
    return fail(planError?.message || "Gagal memuat isi paket Corporate untuk setting barcode.", 500);
  }
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

  let sourceSettings = settings;
  let planByKey = new Map<string, any>();

  if (programType === "corporate") {
    try {
      const plan = await loadCorporateBarcodePlan(supabase, packageId);
      planByKey = new Map(plan.availableStations.map((station: any) => [String(station.station_key || ""), station]));
      sourceSettings = settings.filter((setting: any) => planByKey.has(String(setting.station_key || "")));
    } catch (planError: any) {
      return fail(planError?.message || "Gagal memvalidasi isi paket Corporate.", 500);
    }
  }

  const rows = sourceSettings.map((setting: any) => {
    const stationKey = String(setting.station_key || "");
    const planStation = planByKey.get(stationKey);
    return {
      package_id: packageId,
      program_type: programType,
      station_key: stationKey,
      station_label: String(planStation?.station_label || setting.station_label || ""),
      short_code: String(planStation?.short_code || setting.short_code || ""),
      default_copies: Math.max(0, Math.min(20, Number(setting.default_copies || 0))),
      is_active: 1,
      updated_at: new Date().toISOString()
    };
  }).filter((row: any) => row.station_key);

  if (!rows.length) return fail("Tidak ada setting label yang valid untuk paket ini.", 400);

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

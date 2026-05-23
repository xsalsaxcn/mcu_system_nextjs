import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ManualMapping = Record<string, string>;

const FIELD_ALIASES: Record<string, string[]> = {
  name: ["nama", "nama peserta", "name", "patient name"],
  nomcu: ["nomcu", "no mcu", "no. mcu", "mcu id", "mcu_id"],
  nik: ["nik", "nrp", "id", "nik/nrp/id", "employee id"],
  gender: ["jk", "jenis kelamin", "gender", "sex"],
  dob: ["tgllahir", "tgl lahir", "tanggal lahir", "dob", "birth date"],
  age: ["usia", "umur", "age"],
  company: ["nama pt", "perusahaan", "company", "pt"],
  department: ["departemen", "department", "dept", "bagian"],
  mcuDate: ["tanggal mcu", "tgl mcu", "tglmcu", "mcu date"],

  bb: ["fs:bb", "bb", "berat badan"],
  tb: ["fs:tb", "tb", "tinggi badan"],
  bmi: ["fs:bmi", "bmi"],
  tensi: ["fs:tensi", "tensi", "tekanan darah", "td"],
  butaWarna: ["fs:butawarna", "buta warna", "butawarna"],
  mata: ["fs:tnpkcmata", "fs:dgnkcmata", "visus", "mata"],

  fisik: ["pemeriksaan fisik", "fisik", "hasil fisik"],

  sgot: ["fh:sgot", "sgot"],
  sgpt: ["fh:sgpt", "sgpt"],
  chol: ["ld:chol", "chol", "kolesterol", "cholesterol"],
  hdl: ["ld:hdl", "hdl"],
  ldl: ["ld:ldl", "ldl"],
  trig: ["ld:trig", "trig", "trigliserida"],
  gds: ["gd:sewaktu", "gds", "gula darah sewaktu", "sewaktu"],
  gdp: ["gd:gdp", "gdp"],
  ureum: ["fk:ureum", "fg:ureum", "ureum"],
  kreatinin: ["fk:kreatinin", "fg:kreatinin", "fg:creat", "kreatinin", "creat"],
  asamUrat: ["fk:asamurat", "fg:asur", "asam urat", "asamurat"],

  conclusion: ["kesimpulan", "conclusion"],
  suggestion: ["saran", "suggestion", "rekomendasi"],
};

function normalize(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function fail(message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      message,
    },
    { status }
  );
}

function autoDetect(headers: string[]) {
  const detected: Record<string, string> = {};

  const normalizedHeaders = headers.map((header) => ({
    raw: header,
    norm: normalize(header),
  }));

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const aliasNorms = aliases.map(normalize);

    const exact = normalizedHeaders.find((h) => aliasNorms.includes(h.norm));
    if (exact) {
      detected[field] = exact.raw;
      continue;
    }

    const partial = normalizedHeaders.find((h) =>
      aliasNorms.some((alias) => alias && (h.norm.includes(alias) || alias.includes(h.norm)))
    );

    if (partial) {
      detected[field] = partial.raw;
    }
  }

  return detected;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const preset = String(body.preset || "autodetect");
    const headers = Array.isArray(body.headers)
      ? body.headers.map((x: unknown) => String(x || "").trim()).filter(Boolean)
      : [];

    const manualMapping: ManualMapping =
      body.manualMapping && typeof body.manualMapping === "object"
        ? body.manualMapping
        : {};

    if (!["autodetect", "manual"].includes(preset)) {
      return fail("Preset mapping tidak valid.");
    }

    if (!headers.length) {
      return fail("Header Excel belum diisi.");
    }

    const detected =
      preset === "manual"
        ? manualMapping
        : {
            ...autoDetect(headers),
            ...Object.fromEntries(
              Object.entries(manualMapping).filter(([, value]) => Boolean(value))
            ),
          };

    const targetFields = Object.keys(FIELD_ALIASES);
    const unmapped = targetFields.filter((field) => !detected[field]);

    return NextResponse.json({
      ok: true,
      message:
        preset === "manual"
          ? "Manual mapping berhasil disimpan sementara."
          : "Auto Detect mapping selesai.",
      detected,
      unmapped,
    });
  } catch (error: any) {
    return fail(error?.message || "Mapping gagal.", 500);
  }
}
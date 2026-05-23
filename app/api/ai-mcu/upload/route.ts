import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      message,
    },
    { status }
  );
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const file = form.get("file");
    const preset = String(form.get("preset") || "autodetect");

    if (!file || !(file instanceof File)) {
      return fail("File Excel wajib diupload.");
    }

    const fileName = file.name || "";
    const lowerName = fileName.toLowerCase();

    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
      return fail("Format file harus .xlsx atau .xls.");
    }

    if (!["autodetect", "manual"].includes(preset)) {
      return fail("Preset mapping tidak valid.");
    }

    return NextResponse.json({
      ok: true,
      message: "Upload Excel berhasil diterima.",
      file: {
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
      },
      preset,
      nextStep:
        preset === "manual"
          ? "Lanjut ke halaman Manual Mapping."
          : "Lanjut ke Auto Detect Mapping.",
    });
  } catch (error: any) {
    return fail(error?.message || "Upload gagal.", 500);
  }
}
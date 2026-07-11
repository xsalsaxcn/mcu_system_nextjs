import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { CORPORATE_SIGNATORY_FIELDS } from "@/lib/shared/corporatePdf";

export const dynamic = "force-dynamic";

// CORPORATE_SETUP_PERSISTENCE_V411
const TABLE_NAME = "corporate_mcu_pdf_setups";
const ALLOWED_KEYS = new Set(CORPORATE_SIGNATORY_FIELDS.map((item) => item.key));

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function sanitizeSignatories(value: unknown): Record<string, string> {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    result[key] = String(raw ?? "").trim().slice(0, 250);
  }
  return result;
}

async function validateCorporateSource(sourceId: number) {
  const supabase = getSupabaseAdmin();
  const sourceRes = await supabase
    .from("participant_sources")
    .select("id,name,institution_name,program_type")
    .eq("id", sourceId)
    .maybeSingle();

  if (sourceRes.error) throw new Error(sourceRes.error.message);
  if (!sourceRes.data) throw new Error("Database MCU tidak ditemukan.");
  if (String(sourceRes.data.program_type || "").toLowerCase() !== "corporate") {
    throw new Error("Setup ini hanya dapat digunakan untuk database MCU Corporate.");
  }

  return { supabase, source: sourceRes.data };
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const sourceId = Number(req.nextUrl.searchParams.get("sourceId") || 0);
  if (!Number.isFinite(sourceId) || sourceId <= 0) {
    return fail("sourceId database MCU Corporate wajib diisi.");
  }

  try {
    const { supabase, source } = await validateCorporateSource(sourceId);
    const setupRes = await supabase
      .from(TABLE_NAME)
      .select("source_id,signatories,updated_at,updated_by,updated_by_name")
      .eq("source_id", sourceId)
      .maybeSingle();

    if (setupRes.error) return fail(setupRes.error.message, 500);

    return NextResponse.json({
      ok: true,
      source,
      signatories: sanitizeSignatories(setupRes.data?.signatories),
      updatedAt: setupRes.data?.updated_at || "",
      updatedBy: setupRes.data?.updated_by_name || "",
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat setup Corporate.", 500);
  }
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const sourceId = Number(body.sourceId || 0);
  if (!Number.isFinite(sourceId) || sourceId <= 0) {
    return fail("sourceId database MCU Corporate wajib diisi.");
  }

  const signatories = sanitizeSignatories(body.signatories);

  try {
    const { supabase, source } = await validateCorporateSource(sourceId);
    const now = new Date().toISOString();
    const upsertRes = await supabase
      .from(TABLE_NAME)
      .upsert(
        {
          source_id: sourceId,
          signatories,
          updated_by: Number(user.id) || null,
          updated_by_name: String(user.name || user.username || "").slice(0, 200),
          updated_at: now,
        },
        { onConflict: "source_id" }
      )
      .select("source_id,signatories,updated_at,updated_by,updated_by_name")
      .single();

    if (upsertRes.error) return fail(upsertRes.error.message, 500);

    return NextResponse.json({
      ok: true,
      message: "Setup penanggung jawab berhasil disimpan.",
      source,
      signatories: sanitizeSignatories(upsertRes.data?.signatories),
      updatedAt: upsertRes.data?.updated_at || now,
      updatedBy: upsertRes.data?.updated_by_name || "",
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan setup Corporate.", 500);
  }
}

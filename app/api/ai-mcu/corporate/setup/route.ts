import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { CORPORATE_SIGNATORY_FIELDS } from "@/lib/shared/corporatePdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// CORPORATE_SETUP_PERSISTENCE_V411
// CORPORATE_SETUP_TYPE_FIX_V412

const TABLE_NAME = "corporate_mcu_pdf_setups";

const ALLOWED_KEYS = new Set<string>(
  CORPORATE_SIGNATORY_FIELDS.map((item) => String(item.key))
);

type SignatoryMap = Record<string, string>;

function jsonError(message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      message,
    },
    {
      status,
    }
  );
}

function sanitizeSignatories(value: unknown): SignatoryMap {
  const source =
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const result: SignatoryMap = {};

  for (const [key, raw] of Object.entries(source)) {
    if (!ALLOWED_KEYS.has(String(key))) {
      continue;
    }

    result[String(key)] = String(raw ?? "")
      .trim()
      .slice(0, 250);
  }

  return result;
}

async function validateCorporateSource(sourceId: number) {
  const supabase = getSupabaseAdmin();

  const sourceResponse = await supabase
    .from("participant_sources")
    .select("id,name,institution_name,program_type")
    .eq("id", sourceId)
    .maybeSingle();

  if (sourceResponse.error) {
    throw new Error(sourceResponse.error.message);
  }

  if (!sourceResponse.data) {
    throw new Error("Database MCU tidak ditemukan.");
  }

  const programType = String(
    sourceResponse.data.program_type || ""
  )
    .trim()
    .toLowerCase();

  if (programType !== "corporate") {
    throw new Error(
      "Setup ini hanya dapat digunakan untuk database MCU Corporate."
    );
  }

  return {
    supabase,
    source: sourceResponse.data,
  };
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);

  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const sourceId = Number(
    req.nextUrl.searchParams.get("sourceId") || 0
  );

  if (!Number.isFinite(sourceId) || sourceId <= 0) {
    return jsonError(
      "sourceId database MCU Corporate wajib diisi."
    );
  }

  try {
    const { supabase, source } =
      await validateCorporateSource(sourceId);

    const setupResponse = await supabase
      .from(TABLE_NAME)
      .select(
        "source_id,signatories,updated_at,updated_by,updated_by_name"
      )
      .eq("source_id", sourceId)
      .maybeSingle();

    if (setupResponse.error) {
      return jsonError(setupResponse.error.message, 500);
    }

    return NextResponse.json({
      ok: true,
      source,
      signatories: sanitizeSignatories(
        setupResponse.data?.signatories
      ),
      updatedAt:
        setupResponse.data?.updated_at || "",
      updatedBy:
        setupResponse.data?.updated_by_name || "",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal memuat setup Corporate.";

    return jsonError(message, 500);
  }
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);

  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const body = await req
    .json()
    .catch(() => ({} as Record<string, unknown>));

  const sourceId = Number(
    (body as Record<string, unknown>).sourceId || 0
  );

  if (!Number.isFinite(sourceId) || sourceId <= 0) {
    return jsonError(
      "sourceId database MCU Corporate wajib diisi."
    );
  }

  const signatories = sanitizeSignatories(
    (body as Record<string, unknown>).signatories
  );

  try {
    const { supabase, source } =
      await validateCorporateSource(sourceId);

    const now = new Date().toISOString();

    const userRecord = user as unknown as Record<
      string,
      unknown
    >;

    const rawUserId = Number(userRecord.id || 0);

    const updatedBy =
      Number.isFinite(rawUserId) && rawUserId > 0
        ? rawUserId
        : null;

    const updatedByName = String(
      userRecord.name ||
        userRecord.username ||
        userRecord.email ||
        ""
    )
      .trim()
      .slice(0, 200);

    const setupPayload = {
      source_id: sourceId,
      signatories,
      updated_by: updatedBy,
      updated_by_name: updatedByName,
      updated_at: now,
    };

    const upsertResponse = await supabase
      .from(TABLE_NAME)
      .upsert(setupPayload, {
        onConflict: "source_id",
      })
      .select(
        "source_id,signatories,updated_at,updated_by,updated_by_name"
      )
      .single();

    if (upsertResponse.error) {
      return jsonError(upsertResponse.error.message, 500);
    }

    return NextResponse.json({
      ok: true,
      message:
        "Setup penanggung jawab berhasil disimpan untuk database Corporate ini.",
      source,
      signatories: sanitizeSignatories(
        upsertResponse.data?.signatories
      ),
      updatedAt:
        upsertResponse.data?.updated_at || now,
      updatedBy:
        upsertResponse.data?.updated_by_name ||
        updatedByName,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal menyimpan setup Corporate.";

    return jsonError(message, 500);
  }
}
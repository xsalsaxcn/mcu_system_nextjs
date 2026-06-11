export const dynamic = "force-dynamic";
export const revalidate = 0;
// LABEL_PARTICIPANTS_NO_CACHE_V236
import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

const SELECT_COLUMNS = `
  id,
  name,
  mcu_id,
  external_id,
  nik,
  gender,
  province,
  barcode_value,
  program_type,
  source_id,
  package_id,
  company_id
`;

function extractBarcodeKeyword(rawCode: string) {
  const raw = String(rawCode || "").trim();

  if (!raw) return "";

  const mcuMatch = raw.match(/(?:^|[;|\s])MCU\s*=\s*([^;|]+)/i);
  if (mcuMatch?.[1]) return mcuMatch[1].trim();

  const idMatch = raw.match(/(?:^|[;|\s])ID\s*=\s*([^;|]+)/i);
  if (idMatch?.[1]) return idMatch[1].trim();

  if (raw.includes("|")) {
    const parts = raw.split("|").map((x) => x.trim()).filter(Boolean);
    if (parts[0]) return parts[0];
  }

  return raw;
}

function cleanKeyword(value: string) {
  return String(value || "")
    .replace(/[,%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapRows(data: any[]) {
  return (data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    mcu_id: p.mcu_id,
    external_id: p.external_id,
    nik: p.nik,
    gender: p.gender,
    province: p.province,
    barcode_value: p.barcode_value || p.mcu_id || p.external_id || String(p.id),
    program_type: p.program_type,
    package_name: "-",
    company_name: "",
    source_name: "-",
    institution_name: "",
    label_printed_at: (p as any).label_printed_at || null,
    label_printed_by: (p as any).label_printed_by || "",
    label_print_count: Number((p as any).label_print_count || 0),
    label_print_status: (p as any).label_printed_at ? "printed" : "unprinted"
  }));
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const user = getSessionUser(req);

  if (!user || user.role !== "admin") {
    return fail("Unauthorized", 401);
  }

  const supabase = getSupabaseAdmin();
  const program = req.nextUrl.searchParams.get("program") || "capaska";
  const sourceId = req.nextUrl.searchParams.get("source_id") || "all";
  const rawKeyword = String(req.nextUrl.searchParams.get("keyword") || "").trim();
  const keyword = cleanKeyword(extractBarcodeKeyword(rawKeyword));
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") || 100), 1), 1000);
  const labelPrintStatus = String(req.nextUrl.searchParams.get("label_print_status") || req.nextUrl.searchParams.get("print_status") || "all").toLowerCase();

  if (sourceId === "all" && keyword.length < 2) {
    return ok({
      participants: [],
      message: "Pilih database atau ketik minimal 2 karakter untuk mencari peserta.",
      duration_ms: Date.now() - startedAt
    });
  }

  function baseQuery() {
    let query = supabase
      .from("participants")
      .select(SELECT_COLUMNS)
      .limit(limit);

    if (program !== "all") {
      query = query.eq("program_type", program);
    }

    if (sourceId !== "all") {
      query = query.eq("source_id", Number(sourceId));
    }

    return query;
  }

  // Fast path: exact match untuk hasil scan QR/barcode/MCU ID.
  if (keyword.length >= 2) {
    const exact = keyword.replace(/,/g, " ").trim();

    const exactQuery = baseQuery()
      .or(
        `mcu_id.eq.${exact},external_id.eq.${exact},nik.eq.${exact},barcode_value.eq.${exact}`
      )
      .order("name", { ascending: true });

    const { data: exactData, error: exactError } = await exactQuery;

    if (exactError) {
      return fail(exactError.message, 500);
    }

    if (exactData?.length) {
      return ok({
        participants: mapRows(exactData),
        mode: "exact",
        duration_ms: Date.now() - startedAt
      });
    }
  }

  let query = baseQuery().order("name", { ascending: true });

  if (keyword.length >= 2) {
    const like = `%${keyword}%`;

    query = query.or(
      `name.ilike.${like},mcu_id.ilike.${like},external_id.ilike.${like},nik.ilike.${like},barcode_value.ilike.${like}`
    );
  }

  const { data, error } = await query;

  if (error) {
    return fail(error.message, 500);
  }

  return ok({
    participants: mapRows(data || []),
    mode: keyword.length >= 2 ? "like" : "source",
    duration_ms: Date.now() - startedAt
  });
}

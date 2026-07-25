import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// WELLNESS_COMPANY_SCOPED_PORTALS_V126C
// Daftar perusahaan aktif untuk login Portal Peserta.

function isActive(value: unknown) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === null ||
    value === undefined
  );
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("wellness_companies")
      .select("id,name,is_active")
      .order("name", {
        ascending: true,
      });

    if (error) {
      throw error;
    }

    const companies = (data || [])
      .filter((row: any) =>
        isActive(row?.is_active),
      )
      .map((row: any) => ({
        id: Number(row?.id || 0),
        name: String(
          row?.name || "",
        ).trim(),
      }))
      .filter(
        (row: any) =>
          row.id > 0 &&
          row.name,
      );

    return NextResponse.json({
      ok: true,
      marker:
        "WELLNESS_COMPANY_SCOPED_PORTALS_V126C",
      companies,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        marker:
          "WELLNESS_COMPANY_SCOPED_PORTALS_V126C",
        message:
          error?.message ||
          "Daftar perusahaan gagal dimuat.",
        companies: [],
      },
      {
        status: 500,
      },
    );
  }
}

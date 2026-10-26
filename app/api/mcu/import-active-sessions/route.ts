import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// MCU_CORPORATE_IMPORT_ACTIVE_SESSION_LIST_V479

function clean(value: any) {
  return String(value ?? "").trim();
}

function response(data: any, status = 200) {
  const res = NextResponse.json(data, { status });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

// MCU_CORPORATE_IMPORT_SESSION_COMPANY_SCOPE_V508
// Session MCU Corporate untuk Import di-scope oleh company_id saja.
// package_id pada request tetap diterima untuk backward compatibility,
// tetapi TIDAK menentukan Session; Paket Peserta tetap pilihan Import.
export async function GET(req: NextRequest) {
  const companyId = Number(req.nextUrl.searchParams.get("company_id") || 0);
  const packageId = Number(req.nextUrl.searchParams.get("package_id") || 0);

  if (!companyId || !packageId) {
    return response({ ok: false, message: "company_id dan package_id wajib diisi." }, 400);
  }

  try {
    const supabase = getSupabaseAdmin();

    const [sessionRes, companyRes, packageRes] = await Promise.all([
      supabase
        .from("mcu_queue_sessions")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", 1)
        .order("session_date", { ascending: true })
        .order("id", { ascending: true }),
      supabase.from("companies").select("id,name").eq("id", companyId).maybeSingle(),
      supabase.from("packages").select("id,name").eq("id", packageId).maybeSingle(),
    ]);

    if (sessionRes.error) throw sessionRes.error;
    if (companyRes.error) throw companyRes.error;
    if (packageRes.error) throw packageRes.error;

    const companyName = clean(companyRes.data?.name) || "MCU Corporate";
    const packageName = clean(packageRes.data?.name) || "Paket MCU";

    const sessions = (sessionRes.data || [])
      .filter((row: any) => clean(row?.location) && clean(row?.session_date))
      .map((row: any) => {
        const location = clean(row.location);
        const date = clean(row.session_date).slice(0, 10);
        return {
          id: Number(row.id),
          company_id: Number(row.company_id),
          package_id: Number(row.package_id),
          company_name: companyName,
          package_name: packageName,
          location_name: location,
          session_date: date,
          label: `${packageName} · ${location} · ${date}`,
          track_a_name: clean(row.track_a_name) || "Lab Darah",
          track_b_name: clean(row.track_b_name) || "Rontgen",
        };
      });

    return response({
      ok: true,
      source: "mcu_queue_sessions_active_only",
      sessions,
      count: sessions.length,
    });
  } catch (error: any) {
    return response(
      { ok: false, message: error?.message || "Gagal membaca Session MCU Corporate aktif." },
      500,
    );
  }
}

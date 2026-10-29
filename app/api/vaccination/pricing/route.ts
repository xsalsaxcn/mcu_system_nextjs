import { NextRequest } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";

// V507_VACCINATION_PACKAGE_NON_PACKAGE_PRICING
export const dynamic = "force-dynamic";

function normalizeSaleMode(value: any): "PACKAGE" | "NON_PACKAGE" {
  return String(value || "").trim().toUpperCase() === "PACKAGE"
    ? "PACKAGE"
    : "NON_PACKAGE";
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (
    !canVaccinationAccess(user, "master") &&
    !canVaccinationAccess(user, "register") &&
    !canVaccinationAccess(user, "dashboard")
  ) {
    return fail("Akses harga Paket/Non Paket ditolak untuk role ini.", 403);
  }

  const supabase = supabaseAdmin();
  const [vaccinesResult, offersResult] = await Promise.all([
    supabase
      .from("vaccination_vaccines")
      .select("id,name,brand,dose_count,price,price_category,active")
      .eq("active", true)
      .order("name", { ascending: true })
      .limit(10000),
    supabase
      .from("vaccination_vaccine_sales_options")
      .select("id,vaccine_id,sale_mode,package_dose_count,price,label,active,created_at,updated_at")
      .order("vaccine_id", { ascending: true })
      .order("sale_mode", { ascending: true })
      .limit(10000),
  ]);

  if (vaccinesResult.error) return fail(vaccinesResult.error.message, 500);
  if (offersResult.error) {
    const code = String(offersResult.error?.code || "");
    const message = String(offersResult.error?.message || "").toLowerCase();
    if (code === "42P01" || message.includes("vaccination_vaccine_sales_options")) {
      return fail(
        "Tabel harga Paket/Non Paket belum aktif. Jalankan SQL V507 terlebih dahulu.",
        409,
      );
    }
    return fail(offersResult.error.message, 500);
  }

  return ok({
    vaccines: vaccinesResult.data || [],
    offers: offersResult.data || [],
  });
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "master")) {
    return fail("Akses Master Vaksinasi ditolak untuk role ini.", 403);
  }

  const body = await req.json().catch(() => ({}));
  const action = clean(body.action) || "save";
  const supabase = supabaseAdmin();

  if (action === "delete") {
    const id = toInt(body.id, 0);
    if (!id) return fail("ID harga wajib diisi.");
    const result = await supabase
      .from("vaccination_vaccine_sales_options")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (result.error) return fail(result.error.message, 500);
    return ok({ deleted: true, id });
  }

  const vaccineId = toInt(body.vaccine_id ?? body.vaccineId, 0);
  if (!vaccineId) return fail("Produk vaksin wajib dipilih.");

  const saleMode = normalizeSaleMode(body.sale_mode ?? body.saleMode);
  const rawDoseCount = toInt(body.package_dose_count ?? body.packageDoseCount, 1);
  const packageDoseCount = saleMode === "PACKAGE" ? Math.max(2, rawDoseCount) : 1;
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0) {
    return fail("Harga harus berupa angka 0 atau lebih.");
  }

  const vaccineResult = await supabase
    .from("vaccination_vaccines")
    .select("id,name,brand,dose_count,active")
    .eq("id", vaccineId)
    .maybeSingle();
  if (vaccineResult.error) return fail(vaccineResult.error.message, 500);
  if (!vaccineResult.data || vaccineResult.data.active === false) {
    return fail("Produk vaksin tidak ditemukan atau sudah nonaktif.", 404);
  }

  const defaultLabel =
    saleMode === "PACKAGE"
      ? `Paket ${packageDoseCount} dosis`
      : "Non Paket";
  const label = clean(body.label) || defaultLabel;
  const now = new Date().toISOString();

  const result = await supabase
    .from("vaccination_vaccine_sales_options")
    .upsert(
      {
        vaccine_id: vaccineId,
        sale_mode: saleMode,
        package_dose_count: packageDoseCount,
        price,
        label,
        active: true,
        updated_at: now,
      },
      { onConflict: "vaccine_id,sale_mode" },
    )
    .select("id,vaccine_id,sale_mode,package_dose_count,price,label,active,created_at,updated_at")
    .single();

  if (result.error) return fail(result.error.message, 500);

  // Backward compatibility: existing Bazar registration still reads vaccine.price.
  // Keep NON_PACKAGE as the base/default price without duplicating inventory.
  if (saleMode === "NON_PACKAGE") {
    const syncResult = await supabase
      .from("vaccination_vaccines")
      .update({
        price,
        price_category: "Harga Perusahaan",
        updated_at: now,
      })
      .eq("id", vaccineId);
    if (syncResult.error) return fail(syncResult.error.message, 500);
  }

  return ok({ offer: result.data });
}

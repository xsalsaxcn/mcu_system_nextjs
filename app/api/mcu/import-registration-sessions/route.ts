import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

// MCU_CORPORATE_IMPORT_USE_REGISTRATION_SESSIONS_V476
// Import MCU Corporate must use MCU registration sessions only.
// Do NOT read Vaccination sessions and do NOT use queue runtime as the master import location.

function json(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}

function clean(value: any) {
  return String(value ?? "").trim();
}

function first(...values: any[]) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return "";
}

function norm(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberOrZero(...values: any[]) {
  for (const value of values) {
    const n = Number(value || 0);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function isExplicitlyInactive(row: any) {
  if (row?.is_active === false || Number(row?.is_active) === 0) return true;
  if (row?.active === false || Number(row?.active) === 0) return true;
  const status = norm(row?.status);
  return ["inactive", "deleted", "cancelled", "canceled"].includes(status);
}

function normalizeSession(row: any, companyById: Map<number, string>, packageById: Map<number, string>) {
  const companyId = numberOrZero(row?.company_id, row?.corporate_company_id, row?.institution_id, row?.companyId);
  const packageId = numberOrZero(row?.package_id, row?.exam_package_id, row?.mcu_package_id, row?.packageId);

  const companyName = first(
    row?.company_name,
    row?.institution_name,
    row?.company?.name,
    companyById.get(companyId),
  );

  const packageName = first(
    row?.package_name,
    row?.exam_package_name,
    row?.mcu_package_name,
    row?.package?.name,
    packageById.get(packageId),
  );

  const locationName = first(
    row?.location_name,
    row?.session_location_name,
    row?.session_location,
    row?.location_label,
    row?.location?.name,
    typeof row?.location === "string" ? row.location : "",
    row?.site_name,
    row?.site?.name,
    typeof row?.site === "string" ? row.site : "",
    row?.campus_name,
    row?.campus?.name,
    typeof row?.campus === "string" ? row.campus : "",
    row?.branch_name,
    row?.branch?.name,
    typeof row?.branch === "string" ? row.branch : "",
    row?.venue_name,
    row?.venue?.name,
    typeof row?.venue === "string" ? row.venue : "",
  );

  const sessionDate = first(
    row?.session_date,
    row?.examination_date,
    row?.exam_date,
    row?.event_date,
    row?.scheduled_date,
    row?.service_date,
    row?.date,
  ).slice(0, 10);

  const rawId = first(row?.id, row?.session_id, row?.registration_session_id, row?.uuid);
  const id = rawId || `${companyId}:${packageId}:${locationName}:${sessionDate}`;
  const explicitLabel = first(
    row?.label,
    row?.session_label,
    row?.display_label,
    row?.display_name,
    row?.session_name,
    row?.name,
    row?.title,
  );

  const parts = [companyName, locationName, sessionDate, packageName].filter(Boolean);
  const label = parts.length >= 2 ? parts.join(" · ") : explicitLabel || `Session MCU ${id}`;

  return {
    id,
    registration_session_id: rawId,
    company_id: companyId,
    company_name: companyName,
    package_id: packageId,
    package_name: packageName,
    location_name: locationName,
    session_date: sessionDate,
    label,
    source: "mcu_registration_sessions",
    raw: row,
  };
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return json({ ok: false, message: "Unauthorized" }, 401);

  const companyId = Number(req.nextUrl.searchParams.get("company_id") || 0);
  const packageId = Number(req.nextUrl.searchParams.get("package_id") || 0);

  if (!companyId) {
    return json({ ok: false, message: "Pilih perusahaan MCU Corporate terlebih dahulu." }, 400);
  }

  try {
    const supabase = getSupabaseAdmin();

    const [sessionsRes, companiesRes, packagesRes] = await Promise.all([
      supabase.from("mcu_registration_sessions").select("*"),
      supabase.from("companies").select("id,name"),
      supabase.from("packages").select("id,name"),
    ]);

    if (sessionsRes.error) throw sessionsRes.error;
    if (companiesRes.error) throw companiesRes.error;
    if (packagesRes.error) throw packagesRes.error;

    const companyById = new Map<number, string>(
      (companiesRes.data || []).map((row: any) => [Number(row.id), clean(row.name)]),
    );
    const packageById = new Map<number, string>(
      (packagesRes.data || []).map((row: any) => [Number(row.id), clean(row.name)]),
    );

    const selectedCompanyName = clean(companyById.get(companyId));
    const selectedCompanyNorm = norm(selectedCompanyName);

    const normalized = (sessionsRes.data || [])
      .filter((row: any) => !isExplicitlyInactive(row))
      .map((row: any) => normalizeSession(row, companyById, packageById))
      .filter((session: any) => {
        if (session.company_id) return Number(session.company_id) === companyId;
        const rowCompany = norm(session.company_name);
        return Boolean(
          selectedCompanyNorm &&
          rowCompany &&
          (rowCompany === selectedCompanyNorm ||
            rowCompany.includes(selectedCompanyNorm) ||
            selectedCompanyNorm.includes(rowCompany)),
        );
      })
      .sort((a: any, b: any) => {
        // Package is intentionally NOT a hard filter.
        // Matching package rows are shown first, but all MCU registration sessions
        // for the selected company remain available.
        const aMatch = packageId && Number(a.package_id) === packageId ? 0 : 1;
        const bMatch = packageId && Number(b.package_id) === packageId ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
        const ad = clean(a.session_date) || "9999-99-99";
        const bd = clean(b.session_date) || "9999-99-99";
        if (ad !== bd) return ad.localeCompare(bd);
        return clean(a.location_name).localeCompare(clean(b.location_name));
      });

    const sessions = Array.from(
      new Map(
        normalized.map((row: any) => [
          `${row.registration_session_id || row.id}|${row.company_id}|${row.package_id}|${row.location_name}|${row.session_date}`,
          row,
        ]),
      ).values(),
    );

    return json({
      ok: true,
      source: "mcu_registration_sessions",
      company_id: companyId,
      company_name: selectedCompanyName,
      selected_package_id: packageId || null,
      sessions,
      count: sessions.length,
    });
  } catch (error: any) {
    return json({ ok: false, message: error?.message || "Gagal membaca Session MCU Corporate." }, 500);
  }
}

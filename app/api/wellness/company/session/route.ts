import { NextRequest, NextResponse } from "next/server";
import { resolveCompanyPortalContext } from "@/lib/wellness/companyAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// WELLNESS_COMPANY_CONTEXT_COOKIE_V78

function clean(value: any) {
  return String(value ?? "").trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const companyId = Number(body.company_id || body.companyId || 0);
    if (!Number.isFinite(companyId) || companyId <= 0) {
      return NextResponse.json(
        { ok: false, message: "Pilih perusahaan terlebih dahulu." },
        { status: 400 },
      );
    }

    const context = await resolveCompanyPortalContext(request);
    if (!context.user) {
      return NextResponse.json(
        { ok: false, message: "Session perusahaan belum aktif." },
        { status: 401 },
      );
    }
    if (!context.isManager) {
      return NextResponse.json(
        { ok: false, message: "Akun ini tidak dapat mengganti perusahaan." },
        { status: 403 },
      );
    }

    const company = context.companies.find(
      (item: any) => Number(item.id) === companyId,
    );
    if (!company) {
      return NextResponse.json(
        { ok: false, message: "Perusahaan tidak ditemukan." },
        { status: 404 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      company: {
        id: company.id,
        name: clean(company.name),
      },
    });

    response.cookies.set("wellness_company_context", String(company.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal memilih perusahaan." },
      { status: 500 },
    );
  }
}

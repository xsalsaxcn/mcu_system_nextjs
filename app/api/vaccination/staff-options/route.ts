import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../_utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(data: any, status = 200) {
  const res = NextResponse.json(data, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function cleanName(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isMissingTable(error: any) {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "");
  return code === "42P01" || msg.includes("does not exist") || msg.includes("schema cache");
}

export async function GET() {
  try {
    const supabase = supabaseAdmin();

    const result = await supabase
      .from("vaccination_staff_options")
      .select("id, name, is_active, created_at")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (result.error) {
      if (isMissingTable(result.error)) {
        return json({ ok: true, staff: [], needs_setup: true, message: "Table vaccination_staff_options belum dibuat. Jalankan SQL v122." });
      }

      return json({ ok: false, staff: [], message: result.error.message || "Gagal membaca nama petugas." }, 500);
    }

    return json({ ok: true, staff: result.data || [] });
  } catch (error: any) {
    return json({ ok: false, staff: [], message: error?.message || "Gagal membaca nama petugas." }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = cleanName(body.name);

    if (!name) return json({ ok: false, message: "Nama petugas wajib diisi." }, 400);

    const supabase = supabaseAdmin();

    const existing = await supabase
      .from("vaccination_staff_options")
      .select("id, name, is_active, created_at")
      .eq("name", name)
      .limit(1)
      .maybeSingle();

    if (existing.error) {
      if (isMissingTable(existing.error)) {
        return json({ ok: false, needs_setup: true, message: "Table vaccination_staff_options belum dibuat. Jalankan SQL v122 dahulu." }, 500);
      }

      return json({ ok: false, message: existing.error.message || "Gagal membaca nama petugas." }, 500);
    }

    if (existing.data?.id) {
      const updated = await supabase
        .from("vaccination_staff_options")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", existing.data.id)
        .select("id, name, is_active, created_at")
        .maybeSingle();

      if (updated.error) return json({ ok: false, message: updated.error.message || "Gagal update nama petugas." }, 500);
      return json({ ok: true, staff: updated.data });
    }

    const inserted = await supabase
      .from("vaccination_staff_options")
      .insert({ name, is_active: true })
      .select("id, name, is_active, created_at")
      .maybeSingle();

    if (inserted.error) return json({ ok: false, message: inserted.error.message || "Gagal menyimpan nama petugas." }, 500);

    return json({ ok: true, staff: inserted.data });
  } catch (error: any) {
    return json({ ok: false, message: error?.message || "Gagal menyimpan nama petugas." }, 500);
  }
}

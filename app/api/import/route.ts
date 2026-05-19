import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { importParticipantsFromExcel } from "@/lib/server/importExcel";
import { fail, ok } from "@/lib/server/response";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const form = await req.formData();
  const file = form.get("file") as File | null;

  if (!file) return fail("File Excel wajib diupload.");

  const databaseName = String(form.get("database_name") || "").trim();
  const institutionName = String(form.get("institution_name") || "BPIP / CAPASKA").trim();
  const companyName = String(form.get("company_name") || institutionName || "BPIP / CAPASKA").trim();
  const packageName = String(form.get("package_name") || "CAPASKA 2025/2026").trim();
  const description = String(form.get("description") || "").trim();

  if (!databaseName) return fail("Nama Database wajib diisi.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const supabase = getSupabaseAdmin();

  const stats = await importParticipantsFromExcel(supabase, buffer, {
    database_name: databaseName,
    institution_name: institutionName,
    company_name: companyName,
    package_name: packageName,
    description
  });

  return ok({ stats });
}

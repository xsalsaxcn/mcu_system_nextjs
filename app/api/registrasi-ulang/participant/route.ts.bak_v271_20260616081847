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
  employee_nik,
  gender,
  birth_date,
  date_of_birth,
  age,
  examination_date,
  exam_date,
  department,
  province,
  phone,
  program_type,
  source_id,
  package_id,
  company_id,
  photo_data_url,
  photo_url,
  registrasi_ulang_done,
  registrasi_ulang_at
`;

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const id = Number(req.nextUrl.searchParams.get("id") || 0);
  if (!id) return fail("ID peserta tidak valid.", 400);

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("participants")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .single();

  if (error) return fail(error.message, 500);

  return ok({
    participant: {
      ...data,
      source_name: "-",
      package_name: "-",
      company_name: ""
    }
  });
}

import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

function normalizeName(value: any) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function isProtectedCorporatePostName(value: any) {
  const name = normalizeName(value).toLowerCase();
  return name === "registrasi corporate" || name === "registrasi ulang" || name === "admin";
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") {
    return fail("Unauthorized", 401);
  }

  const body = await req.json().catch(() => ({}));
  const id = body.id ? Number(body.id) : null;
  const name = normalizeName(body.name);
  const description = String(body.description || "").trim();
  const isActive = body.is_active === false ? 0 : 1;

  if (!name) return fail("Nama Section / Post Pemeriksaan wajib diisi.");

  const supabase = getSupabaseAdmin();

  try {
    if (id) {
      const { data: existing, error: existingError } = await supabase
        .from("posts")
        .select("id,name,program_type,is_active")
        .eq("id", id)
        .maybeSingle();

      if (existingError) throw existingError;
      if (!existing) return fail("Section / Post Pemeriksaan tidak ditemukan.", 404);
      if (String(existing.program_type || "") !== "corporate") {
        return fail("Menu ini hanya boleh mengubah Post Pemeriksaan Corporate MCU.", 400);
      }

      if (isProtectedCorporatePostName(existing.name)) {
        return fail(`Section sistem "${existing.name}" tidak dapat diubah dari menu ini.`, 400);
      }

      if (isActive === 0) {
        const { count, error: countError } = await supabase
          .from("parameters")
          .select("id", { count: "exact", head: true })
          .eq("post_id", id)
          .eq("program_type", "corporate")
          .eq("is_active", 1);

        if (countError) throw countError;
        if ((count || 0) > 0) {
          return fail(`Section "${existing.name}" masih memiliki ${count} parameter aktif. Pindahkan atau nonaktifkan parameter tersebut terlebih dahulu.`, 400);
        }
      }
    }

    if (!id && isProtectedCorporatePostName(name)) {
      return fail(`Nama "${name}" adalah nama section sistem dan tidak dapat dibuat ulang.`, 400);
    }

    const { data: duplicate, error: duplicateError } = await supabase
      .from("posts")
      .select("id,name,is_active")
      .eq("program_type", "corporate")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();

    if (duplicateError) throw duplicateError;
    if (duplicate && Number(duplicate.id) !== Number(id || 0)) {
      if (!id && Number(duplicate.is_active ?? 1) === 0) {
        const { error: reactivateError } = await supabase
          .from("posts")
          .update({ name, description, is_active: 1, program_type: "corporate" })
          .eq("id", duplicate.id)
          .eq("program_type", "corporate");

        if (reactivateError) throw reactivateError;

        await supabase.from("audit_logs").insert({
          user_id: user.id,
          action: "REACTIVATE_CORPORATE_POST",
          participant_id: null,
          parameter_id: null,
          old_value: null,
          new_value: `post_id=${duplicate.id}; name=${name}`
        });

        return ok({ post_id: duplicate.id, mode: "reactivated" });
      }

      return fail(`Section Corporate "${duplicate.name}" sudah ada.`, 400);
    }

    if (id) {
      const { error } = await supabase
        .from("posts")
        .update({
          name,
          description,
          is_active: isActive,
          program_type: "corporate"
        })
        .eq("id", id)
        .eq("program_type", "corporate");

      if (error) throw error;

      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: isActive ? "UPDATE_CORPORATE_POST" : "DEACTIVATE_CORPORATE_POST",
        participant_id: null,
        parameter_id: null,
        old_value: null,
        new_value: `post_id=${id}; name=${name}`
      });

      return ok({ post_id: id, mode: isActive ? "updated" : "deactivated" });
    }

    const { data, error } = await supabase
      .from("posts")
      .insert({
        name,
        description,
        is_active: 1,
        program_type: "corporate"
      })
      .select("id")
      .single();

    if (error) throw error;

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "CREATE_CORPORATE_POST",
      participant_id: null,
      parameter_id: null,
      old_value: null,
      new_value: `post_id=${data.id}; name=${name}`
    });

    return ok({ post_id: data.id, mode: "created" });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan Section / Post Pemeriksaan Corporate.", 500);
  }
}

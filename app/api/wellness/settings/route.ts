import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { canManageWellness } from "@/lib/wellness/auth";

// WELLNESS_SETTINGS_PARAMETER_V350_API
// WELLNESS_SETTINGS_COACH_DROPDOWN_V121

const MAIN_PARAMETERS = [
  { parameter_key: "nutrition", label: "Nutrisi", frequency: "Harian", filled_by: "Peserta", sort_order: 10 },
  { parameter_key: "height_weight", label: "TB & BB", frequency: "Berkala", filled_by: "Peserta/Nakes", sort_order: 20 },
  { parameter_key: "workout", label: "Workout", frequency: "Harian", filled_by: "Peserta", sort_order: 30 },
  { parameter_key: "mini_mcu", label: "Mini MCU", frequency: "Berkala", filled_by: "Nakes", sort_order: 40 },
];

const MINI_MCU_PARAMETERS = [
  { parameter_key: "weight_kg", label: "Berat Badan", unit: "kg", sort_order: 10 },
  { parameter_key: "bmi", label: "BMI", unit: "kg/m2", sort_order: 20 },
  { parameter_key: "waist_cm", label: "Lingkar Perut", unit: "cm", sort_order: 30 },
  { parameter_key: "blood_pressure", label: "Tekanan Darah", unit: "mmHg", sort_order: 40 },
  { parameter_key: "glucose", label: "Gula Darah", unit: "mg/dL", sort_order: 50 },
  { parameter_key: "hba1c", label: "HbA1c", unit: "%", sort_order: 60 },
  { parameter_key: "lipid", label: "Profil Lipid", unit: "mg/dL", sort_order: 70 },
  { parameter_key: "uric_acid", label: "Asam Urat", unit: "mg/dL", sort_order: 80 },
  { parameter_key: "notes", label: "Catatan Nakes", unit: "", sort_order: 90 },
];

function clean(value: any) {
  return String(value ?? "").trim();
}

function toNumber(value: any) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isEnabled(value: any) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function activeValue(value: any) {
  return [
    true,
    1,
    "1",
    "true",
    "aktif",
    "active",
  ].includes(
    typeof value === "string"
      ? value.toLowerCase()
      : value,
  );
}

async function getActiveCoach(
  supabase: any,
  coachUserId: number,
) {
  const { data, error } = await supabase
    .from("wellness_coach_users")
    .select("id,name,email,username,is_active")
    .eq("id", coachUserId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error(
      "Coach yang dipilih tidak ditemukan.",
    );
  }

  if (!activeValue(data.is_active)) {
    throw new Error(
      "Coach yang dipilih sedang nonaktif.",
    );
  }

  if (
    !clean(data.name) ||
    !clean(data.email) ||
    !clean(data.username)
  ) {
    throw new Error(
      "Akun Coach belum lengkap. Nama, email, dan username wajib tersedia.",
    );
  }

  return data;
}

async function syncPrimaryCoachAssignment(
  supabase: any,
  groupUnit: any,
  coach: any,
) {
  const groupUnitId = Number(
    groupUnit?.id || 0,
  );

  const coachUserId = Number(
    coach?.id || 0,
  );

  const groupName = clean(
    groupUnit?.name,
  );

  if (!groupUnitId || !coachUserId) {
    throw new Error(
      "Kelompok atau Coach belum valid.",
    );
  }

  const {
    data: previousActive,
    error: previousActiveError,
  } = await supabase
    .from("wellness_coach_group_assignments")
    .select("id")
    .eq(
      "wellness_group_unit_id",
      groupUnitId,
    )
    .eq("is_active", true);

  if (previousActiveError) {
    throw previousActiveError;
  }

  const previousActiveIds = (
    previousActive || []
  )
    .map((item: any) => Number(item.id))
    .filter(Boolean);

  const {
    data: existing,
    error: existingError,
  } = await supabase
    .from("wellness_coach_group_assignments")
    .select("id")
    .eq(
      "wellness_group_unit_id",
      groupUnitId,
    )
    .eq(
      "coach_user_id",
      coachUserId,
    )
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const {
    error: deactivateError,
  } = await supabase
    .from("wellness_coach_group_assignments")
    .update({
      is_active: false,
    })
    .eq(
      "wellness_group_unit_id",
      groupUnitId,
    )
    .eq("is_active", true);

  if (deactivateError) {
    throw deactivateError;
  }

  try {
    if (existing?.id) {
      const {
        data,
        error,
      } = await supabase
        .from(
          "wellness_coach_group_assignments",
        )
        .update({
          group_name: groupName,
          is_active: true,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) throw error;

      return data;
    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "wellness_coach_group_assignments",
      )
      .insert({
        coach_user_id: coachUserId,
        wellness_group_unit_id:
          groupUnitId,
        group_name: groupName,
        is_active: true,
      })
      .select("*")
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    /*
     * Bila assignment baru gagal,
     * kembalikan assignment aktif sebelumnya.
     */
    if (previousActiveIds.length) {
      await supabase
        .from(
          "wellness_coach_group_assignments",
        )
        .update({
          is_active: true,
        })
        .in("id", previousActiveIds);
    }

    throw error;
  }
}

async function getOrCreateCompany(supabase: any, name: string) {
  const companyName = clean(name);
  if (!companyName) throw new Error("Nama perusahaan wajib diisi.");

  const { data: existing, error: selectError } = await supabase
    .from("wellness_companies")
    .select("*")
    .eq("name", companyName)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing?.id) return existing;

  const { data, error } = await supabase
    .from("wellness_companies")
    .insert({ name: companyName, is_active: 1 })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function getOrCreateGroupUnit(supabase: any, input: any) {
  const companyId = toNumber(input.companyId || input.company_id);
  const parentId = toNumber(input.parentId || input.parent_id);
  const unitType = clean(input.unitType || input.unit_type || "kelompok") || "kelompok";
  const name = clean(input.name);
  const coachName = clean(input.coachName || input.coach_name);
  if (!companyId) throw new Error("Pilih perusahaan terlebih dahulu.");
  if (!name) throw new Error("Nama kelompok/group wajib diisi.");

  let query = supabase
    .from("wellness_group_units")
    .select("*")
    .eq("company_id", companyId)
    .eq("unit_type", unitType)
    .eq("name", name);

  query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);
  const { data: existing, error: selectError } = await query.maybeSingle();
  if (selectError) throw selectError;

  if (existing?.id) {
    const { data, error } = await supabase
      .from("wellness_group_units")
      .update({ coach_name: coachName || existing.coach_name || null, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("wellness_group_units")
    .insert({
      company_id: companyId,
      parent_id: parentId,
      unit_type: unitType,
      name,
      coach_name: coachName || null,
      is_active: 1,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function saveProgramParameters(supabase: any, companyId: number, parameters: any[] = [], miniMcuParameters: any[] = []) {
  const parameterMap = new Map(parameters.map((item: any) => [clean(item.parameter_key || item.key), item]));
  const miniMap = new Map(miniMcuParameters.map((item: any) => [clean(item.parameter_key || item.key), item]));

  for (const item of MAIN_PARAMETERS) {
    const selected = parameterMap.get(item.parameter_key);
    const enabled = selected ? isEnabled((selected as any).is_enabled ?? (selected as any).enabled) : item.parameter_key !== "mini_mcu";
    const { error } = await supabase.from("wellness_program_parameters").upsert({
      company_id: companyId,
      parameter_key: item.parameter_key,
      label: item.label,
      frequency: item.frequency,
      filled_by: item.filled_by,
      is_enabled: enabled ? 1 : 0,
      sort_order: item.sort_order,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id,parameter_key" });
    if (error) throw error;
  }

  for (const item of MINI_MCU_PARAMETERS) {
    const selected = miniMap.get(item.parameter_key);
    const enabled = selected ? isEnabled((selected as any).is_enabled ?? (selected as any).enabled) : ["weight_kg", "bmi", "waist_cm", "blood_pressure", "glucose", "hba1c", "notes"].includes(item.parameter_key);
    const { error } = await supabase.from("wellness_mini_mcu_parameters").upsert({
      company_id: companyId,
      parameter_key: item.parameter_key,
      label: item.label,
      unit: item.unit,
      is_enabled: enabled ? 1 : 0,
      sort_order: item.sort_order,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id,parameter_key" });
    if (error) throw error;
  }
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canManageWellness(user)) return fail("Akses ditolak.", 403);

  try {
    const supabase = getSupabaseAdmin();
    const [
      companiesRes,
      groupsRes,
      parametersRes,
      miniMcuRes,
      coachesRes,
    ] = await Promise.all([
      supabase
        .from("wellness_companies")
        .select("*")
        .order("name", { ascending: true }),

      supabase
        .from("wellness_group_units")
        .select("*")
        .order("unit_type", { ascending: true })
        .order("name", { ascending: true }),

      supabase
        .from("wellness_program_parameters")
        .select("*")
        .order("sort_order", { ascending: true }),

      supabase
        .from("wellness_mini_mcu_parameters")
        .select("*")
        .order("sort_order", { ascending: true }),

      supabase
        .from("wellness_coach_users")
        .select(
          "id,name,email,username,is_active",
        )
        .order("name", { ascending: true }),
    ]);

    if (companiesRes.error) throw companiesRes.error;
    if (groupsRes.error) throw groupsRes.error;
    if (parametersRes.error) throw parametersRes.error;
    if (miniMcuRes.error) throw miniMcuRes.error;
    if (coachesRes.error) throw coachesRes.error;

    const activeCoaches = (
      coachesRes.data || []
    ).filter((coach: any) => {
      return (
        activeValue(coach?.is_active) &&
        clean(coach?.name) &&
        clean(coach?.email) &&
        clean(coach?.username)
      );
    });

    return ok({
      companies: companiesRes.data || [],
      groupUnits: groupsRes.data || [],
      programParameters: parametersRes.data || [],
      miniMcuParameters: miniMcuRes.data || [],
      coaches: activeCoaches,
      defaults: {
        mainParameters: MAIN_PARAMETERS,
        miniMcuParameters: MINI_MCU_PARAMETERS,
      },
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat setting Wellness. Jalankan sql/wellness_settings_v350.sql terlebih dahulu.", 500);
  }
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canManageWellness(user)) return fail("Akses ditolak.", 403);

  try {
    const body = await req.json();
    const action = clean(body.action);
    const supabase = getSupabaseAdmin();

    if (action === "save_company") {
      const company = await getOrCreateCompany(supabase, body.name || body.companyName);
      await saveProgramParameters(supabase, Number(company.id), [], []);
      return ok({ company });
    }

    if (action === "add_kelompok") {
      const coachUserId = toNumber(
        body.coachUserId ||
          body.coach_user_id,
      );

      if (!coachUserId) {
        return fail(
          "Pilih Coach penanggung jawab.",
          400,
        );
      }

      const coach = await getActiveCoach(
        supabase,
        coachUserId,
      );

      const groupUnit =
        await getOrCreateGroupUnit(
          supabase,
          {
            ...body,
            unitType: "kelompok",
            parentId: null,
            coachName: coach.name,
          },
        );

      const assignment =
        await syncPrimaryCoachAssignment(
          supabase,
          groupUnit,
          coach,
        );

      return ok({
        groupUnit,
        coach,
        assignment,
      });
    }

    if (action === "add_group") {
      const groupUnit = await getOrCreateGroupUnit(supabase, { ...body, unitType: "group" });
      return ok({ groupUnit });
    }

    if (action === "save_parameters") {
      const companyId = toNumber(body.companyId || body.company_id);
      if (!companyId) return fail("Pilih perusahaan terlebih dahulu.");
      await saveProgramParameters(supabase, companyId, body.parameters || [], body.miniMcuParameters || []);
      return ok({ saved: true });
    }

    return fail("Action setting Wellness tidak dikenal.");
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan setting Wellness. Jalankan sql/wellness_settings_v350.sql terlebih dahulu.", 500);
  }
}

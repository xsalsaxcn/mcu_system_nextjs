import { CAPASKA_STAGES, CORPORATE_STAGES, PROGRAM_CAPASKA, PROGRAM_CORPORATE, type ParameterSeed, type StageSeed } from "@/lib/shared/constants";

async function getByName(supabase: any, table: string, name: string) {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function insertAndReturnId(supabase: any, table: string, values: any) {
  const { data, error } = await supabase.from(table).insert(values).select("id").single();
  if (error) throw error;
  return data.id as number;
}

async function ensureCompany(supabase: any, name: string) {
  const existing = await getByName(supabase, "companies", name);

  if (existing) return existing.id as number;

  return insertAndReturnId(supabase, "companies", {
    name,
    address: "",
    pic_name: ""
  });
}

async function ensurePackage(supabase: any, name: string, programType: string, companyId: number) {
  const { data, error } = await supabase
    .from("packages")
    .select("id")
    .ilike("name", name)
    .eq("program_type", programType)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (data) return data.id as number;

  return insertAndReturnId(supabase, "packages", {
    name,
    description: `Default package ${name}`,
    company_id: companyId,
    is_active: 1,
    program_type: programType
  });
}

async function ensureAdmin(supabase: any) {
  let adminPost = await getByName(supabase, "posts", "Admin");

  if (!adminPost) {
    const adminPostId = await insertAndReturnId(supabase, "posts", {
      name: "Admin",
      description: "Post admin sistem",
      program_type: "all",
      is_active: 1
    });
    adminPost = { id: adminPostId };
  }

  const { data: adminUser, error } = await supabase
    .from("users")
    .select("id")
    .eq("username", "admin")
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (!adminUser) {
    const { error: insertError } = await supabase.from("users").insert({
      name: "Administrator",
      username: "admin",
      password: "admin123",
      role: "admin",
      post_id: adminPost.id,
      program_type: "all",
      is_active: 1
    });

    if (insertError) throw insertError;
  }
}

async function ensurePost(supabase: any, stage: StageSeed, programType: string) {
  let post = await getByName(supabase, "posts", stage.post_name);

  if (!post) {
    const postId = await insertAndReturnId(supabase, "posts", {
      name: stage.post_name,
      description: stage.description,
      program_type: programType,
      is_active: 1
    });

    post = { id: postId };
  } else {
    const { error } = await supabase
      .from("posts")
      .update({
        description: post.description || stage.description,
        program_type: programType,
        is_active: 1
      })
      .eq("id", post.id);

    if (error) throw error;
  }

  return post.id as number;
}

async function ensureOperator(supabase: any, stage: StageSeed, postId: number, programType: string) {
  const { data: existing, error } = await supabase
    .from("users")
    .select("id")
    .eq("username", stage.username)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (existing) {
    const { error: updateError } = await supabase
      .from("users")
      .update({
        name: stage.operator_name,
        role: "operator",
        post_id: postId,
        program_type: programType,
        is_active: 1
      })
      .eq("id", existing.id);

    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await supabase.from("users").insert({
      name: stage.operator_name,
      username: stage.username,
      password: stage.password,
      role: "operator",
      post_id: postId,
      program_type: programType,
      is_active: 1
    });

    if (insertError) throw insertError;
  }
}

async function ensureParameter(supabase: any, postId: number, programType: string, postName: string, param: ParameterSeed) {
  const { data: existing, error } = await supabase
    .from("parameters")
    .select("id")
    .eq("post_id", postId)
    .eq("program_type", programType)
    .ilike("name", param.name)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const payload = {
    name: param.name,
    category: param.category || postName,
    post_id: postId,
    unit: param.unit || "",
    input_type: param.input_type || "text",
    normal_value: param.normal_value || "",
    reference_text: param.reference_text || "",
    reference_image_path: "",
    config_json: JSON.stringify(param.config_json || []),
    is_required: param.is_required ?? 0,
    is_active: 1,
    sort_order: param.sort_order || 0,
    program_type: programType
  };

  if (existing) {
    const { error: updateError } = await supabase.from("parameters").update(payload).eq("id", existing.id);
    if (updateError) throw updateError;
    return existing.id as number;
  }

  return insertAndReturnId(supabase, "parameters", payload);
}

async function seedProgramStages(supabase: any, stages: StageSeed[], programType: string) {
  const parameterIds: number[] = [];

  for (const stage of stages) {
    const postId = await ensurePost(supabase, stage, programType);
    await ensureOperator(supabase, stage, postId, programType);

    for (const param of stage.parameters) {
      const parameterId = await ensureParameter(supabase, postId, programType, stage.post_name, param);
      parameterIds.push(parameterId);
    }
  }

  return parameterIds;
}

async function ensureReviewUsers(supabase: any) {
  let reviewPost = await getByName(supabase, "posts", "Review Dokter CAPASKA");

  if (!reviewPost) {
    const postId = await insertAndReturnId(supabase, "posts", {
      name: "Review Dokter CAPASKA",
      description: "Post khusus dokter/supervisor untuk review hasil CAPASKA",
      program_type: PROGRAM_CAPASKA,
      is_active: 1
    });
    reviewPost = { id: postId };
  }

  const reviewers = [
    { name: "Dokter Review CAPASKA", username: "dokter_review", password: "dokter123", role: "doctor" },
    { name: "Supervisor CAPASKA", username: "supervisor_capaska", password: "supervisor123", role: "supervisor" }
  ];

  for (const reviewer of reviewers) {
    const { data: existing, error } = await supabase
      .from("users")
      .select("id")
      .eq("username", reviewer.username)
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (existing) {
      const { error: updateError } = await supabase
        .from("users")
        .update({
          name: reviewer.name,
          role: reviewer.role,
          post_id: reviewPost.id,
          program_type: PROGRAM_CAPASKA,
          is_active: 1
        })
        .eq("id", existing.id);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase.from("users").insert({
        ...reviewer,
        post_id: reviewPost.id,
        program_type: PROGRAM_CAPASKA,
        is_active: 1
      });

      if (insertError) throw insertError;
    }
  }
}

export async function mapProgramPackages(supabase: any, programType: string) {
  const { data: packages, error: packagesError } = await supabase
    .from("packages")
    .select("id")
    .eq("program_type", programType)
    .eq("is_active", 1);

  if (packagesError) throw packagesError;

  const { data: parameters, error: parametersError } = await supabase
    .from("parameters")
    .select("id")
    .eq("program_type", programType)
    .eq("is_active", 1);

  if (parametersError) throw parametersError;

  for (const pkg of packages || []) {
    for (const param of parameters || []) {
      const { data: existing, error: existingError } = await supabase
        .from("package_parameters")
        .select("id")
        .eq("package_id", pkg.id)
        .eq("parameter_id", param.id)
        .limit(1)
        .maybeSingle();

      if (existingError) throw existingError;

      if (!existing) {
        const { error } = await supabase.from("package_parameters").insert({
          package_id: pkg.id,
          parameter_id: param.id,
          sort_order: 0
        });

        if (error) throw error;
      }
    }
  }
}

export async function mapAllCapaskaPackages(supabase: any) {
  return mapProgramPackages(supabase, PROGRAM_CAPASKA);
}

export async function seedDefaults(supabase: any) {
  await ensureAdmin(supabase);

  const capaskaCompanyId = await ensureCompany(supabase, "BPIP / CAPASKA");
  await ensurePackage(supabase, "CAPASKA 2025/2026", PROGRAM_CAPASKA, capaskaCompanyId);

  const corporateCompanyId = await ensureCompany(supabase, "Corporate Default");
  await ensurePackage(supabase, "MCU Corporate Basic", PROGRAM_CORPORATE, corporateCompanyId);

  const capaskaParameters = await seedProgramStages(supabase, CAPASKA_STAGES, PROGRAM_CAPASKA);
  const corporateParameters = await seedProgramStages(supabase, CORPORATE_STAGES, PROGRAM_CORPORATE);

  await ensureReviewUsers(supabase);

  await mapProgramPackages(supabase, PROGRAM_CAPASKA);
  await mapProgramPackages(supabase, PROGRAM_CORPORATE);

  return {
    capaska_parameters: capaskaParameters.length,
    corporate_parameters: corporateParameters.length,
    capaska_operators: CAPASKA_STAGES.length,
    corporate_operators: CORPORATE_STAGES.length,
    reviewers: 2
  };
}

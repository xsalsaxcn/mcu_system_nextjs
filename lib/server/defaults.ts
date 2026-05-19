import { CAPASKA_STAGES, PROGRAM_CAPASKA } from "@/lib/shared/constants";

async function getByName(supabase: any, table: string, name: string) {
  const { data, error } = await supabase.from(table).select("*").ilike("name", name).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function insertAndReturnId(supabase: any, table: string, values: any) {
  const { data, error } = await supabase.from(table).insert(values).select("id").single();
  if (error) throw error;
  return data.id as number;
}

export async function seedDefaults(supabase: any) {
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

  const { data: adminUser, error: adminError } = await supabase
    .from("users")
    .select("id")
    .eq("username", "admin")
    .limit(1)
    .maybeSingle();

  if (adminError) throw adminError;

  if (!adminUser) {
    const { error } = await supabase.from("users").insert({
      name: "Administrator",
      username: "admin",
      password: "admin123",
      role: "admin",
      post_id: adminPost.id,
      program_type: "all",
      is_active: 1
    });

    if (error) throw error;
  }

  const postIds: number[] = [];
  const parameterIds: number[] = [];

  for (const stage of CAPASKA_STAGES) {
    let post = await getByName(supabase, "posts", stage.post_name);

    if (!post) {
      const postId = await insertAndReturnId(supabase, "posts", {
        name: stage.post_name,
        description: stage.description,
        program_type: PROGRAM_CAPASKA,
        is_active: 1
      });
      post = { id: postId };
    } else {
      await supabase
        .from("posts")
        .update({
          description: post.description || stage.description,
          program_type: PROGRAM_CAPASKA,
          is_active: 1
        })
        .eq("id", post.id);
    }

    postIds.push(post.id);

    const { data: existingParameter, error: paramSelectError } = await supabase
      .from("parameters")
      .select("id")
      .eq("post_id", post.id)
      .eq("program_type", PROGRAM_CAPASKA)
      .eq("is_active", 1)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (paramSelectError) throw paramSelectError;

    let parameterId = existingParameter?.id as number | undefined;

    if (!parameterId) {
      parameterId = await insertAndReturnId(supabase, "parameters", {
        name: stage.parameter_name,
        category: stage.post_name,
        post_id: post.id,
        unit: "",
        input_type: "select",
        normal_value: "Done",
        reference_text: "Parameter minimal otomatis untuk menjaga progress stage dan hak akses operator.",
        reference_image_path: "",
        config_json: JSON.stringify(["", "Done", "Belum", "Normal", "Abnormal", "Perlu Review"]),
        is_required: 1,
        is_active: 1,
        sort_order: stage.sort_order,
        program_type: PROGRAM_CAPASKA
      });
    }

    parameterIds.push(parameterId);

    const { data: existingUser, error: userSelectError } = await supabase
      .from("users")
      .select("id")
      .eq("username", stage.username)
      .limit(1)
      .maybeSingle();

    if (userSelectError) throw userSelectError;

    if (existingUser) {
      const { error } = await supabase
        .from("users")
        .update({
          name: stage.operator_name,
          role: "operator",
          post_id: post.id,
          program_type: PROGRAM_CAPASKA,
          is_active: 1
        })
        .eq("id", existingUser.id);

      if (error) throw error;
    } else {
      const { error } = await supabase.from("users").insert({
        name: stage.operator_name,
        username: stage.username,
        password: stage.password,
        role: "operator",
        post_id: post.id,
        program_type: PROGRAM_CAPASKA,
        is_active: 1
      });

      if (error) throw error;
    }
  }

  const reviewPost = await getByName(supabase, "posts", "Review Dokter CAPASKA");
  let reviewPostId = reviewPost?.id;

  if (!reviewPostId) {
    reviewPostId = await insertAndReturnId(supabase, "posts", {
      name: "Review Dokter CAPASKA",
      description: "Post khusus dokter/supervisor untuk review hasil CAPASKA",
      program_type: PROGRAM_CAPASKA,
      is_active: 1
    });
  }

  const reviewers = [
    {
      name: "Dokter Review CAPASKA",
      username: "dokter_review",
      password: "dokter123",
      role: "doctor"
    },
    {
      name: "Supervisor CAPASKA",
      username: "supervisor_capaska",
      password: "supervisor123",
      role: "supervisor"
    }
  ];

  for (const reviewer of reviewers) {
    const { data: existing, error: selectError } = await supabase
      .from("users")
      .select("id")
      .eq("username", reviewer.username)
      .limit(1)
      .maybeSingle();

    if (selectError) throw selectError;

    if (existing) {
      const { error } = await supabase
        .from("users")
        .update({
          name: reviewer.name,
          role: reviewer.role,
          post_id: reviewPostId,
          program_type: PROGRAM_CAPASKA,
          is_active: 1
        })
        .eq("id", existing.id);

      if (error) throw error;
    } else {
      const { error } = await supabase.from("users").insert({
        ...reviewer,
        post_id: reviewPostId,
        program_type: PROGRAM_CAPASKA,
        is_active: 1
      });

      if (error) throw error;
    }
  }

  await mapAllCapaskaPackages(supabase);

  return {
    posts: postIds.length,
    parameters: parameterIds.length,
    operators: CAPASKA_STAGES.length,
    reviewers: reviewers.length
  };
}

export async function mapAllCapaskaPackages(supabase: any) {
  const { data: packages, error: packagesError } = await supabase
    .from("packages")
    .select("id")
    .eq("program_type", PROGRAM_CAPASKA)
    .eq("is_active", 1);

  if (packagesError) throw packagesError;

  const { data: parameters, error: parametersError } = await supabase
    .from("parameters")
    .select("id")
    .eq("program_type", PROGRAM_CAPASKA)
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

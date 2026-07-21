import { stageOrder } from "@/lib/shared/constants";
import type { StageProgress } from "@/lib/shared/types";

function isActive(value: any) {
  return value === 1 || value === true || value === "1" || value === null || value === undefined;
}

function shouldHideStage(postName: string) {
  const normalized = postName.toLowerCase().trim();

  // Registrasi awal CAPASKA bukan stage pemeriksaan, jadi tidak dihitung di progress dashboard.
  return normalized === "registrasi capaska" || normalized.startsWith("registrasi capaska");
}

function isScoreHelperParameter(parameterName: string) {
  const name = parameterName.toLowerCase().trim();

  return (
    name.startsWith("value ") ||
    name.startsWith("nilai ") ||
    name.startsWith("score ") ||
    name.startsWith("total score") ||
    name.includes("score total") ||
    name.includes("total skor")
  );
}
function capaskaProgressNormV153(value: any) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaProgressParamTextV153(param: any) {
  return capaskaProgressNormV153([
    param?.name,
    param?.label,
    param?.title,
    param?.parameter,
    param?.param_name,
    param?.question,
    param?.id,
  ].filter(Boolean).join(" "));
}

function canonicalCapaskaProgressParamsV153(params: any[]) {
  const list = Array.isArray(params) ? params : [];
  const cleaned: any[] = [];
  let seenRhinitisLividae = false;
  let seenHipospadiaHidrokel = false;

  for (const param of list) {
    const text = capaskaProgressParamTextV153(param);

    const isRhinitisLividae =
      /rhinitis|rinitis/.test(text) && /lividae|divide|dividae/.test(text);

    if (isRhinitisLividae) {
      if (seenRhinitisLividae) continue;
      seenRhinitisLividae = true;
      cleaned.push(param);
      continue;
    }

    const isHipospadia = /hipospadia/.test(text);
    const isStandaloneHidrokel = /hidrokel/.test(text) && !/hipospadia/.test(text);

    if (isHipospadia) {
      if (seenHipospadiaHidrokel) continue;
      seenHipospadiaHidrokel = true;
      cleaned.push(param);
      continue;
    }

    if (isStandaloneHidrokel) {
      continue;
    }

    cleaned.push(param);
  }

  return cleaned;
}


export function computeStagesForParticipant(
  participantId: number,
  packageId: number,
  packageParameters: any[],
  parameters: any[],
  posts: any[],
  results: any[]
): StageProgress[] {
  const paramsForPackage = packageParameters
    .filter((pp) => Number(pp.package_id) === Number(packageId))
    .map((pp) => Number(pp.parameter_id));

  const resultMap = new Map<number, string>();

  results
    .filter((r) => Number(r.participant_id) === Number(participantId))
    .forEach((r) => {
      const value = r.value ?? r.result_value ?? r.normal_value ?? "";
      resultMap.set(Number(r.parameter_id), String(value).trim());
    });

  const postMap = new Map<number, string>();
  posts.forEach((p) => postMap.set(Number(p.id), String(p.name || "")));

  const grouped = new Map<number, any[]>();

  parameters
    .filter((p) => paramsForPackage.includes(Number(p.id)))
    .filter((p) => isActive(p.is_active))
    .forEach((p) => {
      const postId = Number(p.post_id);
      const postName = postMap.get(postId) || "-";

      if (shouldHideStage(postName)) return;

      if (!grouped.has(postId)) grouped.set(postId, []);
      grouped.get(postId)!.push(p);
    });

  const stages: StageProgress[] = [];

  for (const [postId, params] of grouped.entries()) {
    const postName = postMap.get(postId) || "-";

    const inputParams = canonicalCapaskaProgressParamsV153(params.filter((p) => !isScoreHelperParameter(String(p.name || ""))));

    const countedParams = inputParams.length ? inputParams : params;
    const total = countedParams.length;
    const filled = countedParams.filter((p) => {
      const v = resultMap.get(Number(p.id));
      return v !== undefined && v !== "";
    }).length;

    // Registrasi Ulang tidak boleh otomatis Done.
    // Done hanya terjadi jika tim registrasi menekan Save dan API membuat marker hasil.
    const isDone = total > 0 && filled >= total;

    stages.push({
      post_id: postId,
      post_name: postName,
      total_parameters: total,
      filled_parameters: filled,
      is_done: isDone,
      status_text: isDone ? "Done" : "Belum",
      progress_text: isDone ? "Done" : `${filled}/${total}`,
      stage_order: stageOrder(postName)
    });
  }

  return stages.sort((a, b) => a.stage_order - b.stage_order || a.post_id - b.post_id);
}


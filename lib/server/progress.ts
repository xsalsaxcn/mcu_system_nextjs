import { stageOrder } from "@/lib/shared/constants";
import type { StageProgress } from "@/lib/shared/types";

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
    .forEach((r) => resultMap.set(Number(r.parameter_id), String(r.value || "").trim()));

  const postMap = new Map<number, string>();
  posts.forEach((p) => postMap.set(Number(p.id), String(p.name || "")));

  const grouped = new Map<number, any[]>();

  parameters
    .filter((p) => paramsForPackage.includes(Number(p.id)))
    .filter((p) => p.is_active === 1 || p.is_active === true)
    .forEach((p) => {
      const postId = Number(p.post_id);
      if (!grouped.has(postId)) grouped.set(postId, []);
      grouped.get(postId)!.push(p);
    });

  const stages: StageProgress[] = [];

  for (const [postId, params] of grouped.entries()) {
    const postName = postMap.get(postId) || "-";

    const inputParams = params.filter((p) => {
      const name = String(p.name || "").toLowerCase().trim();
      return !(
        name.startsWith("value ") ||
        name.startsWith("score ") ||
        name.startsWith("total score") ||
        name.includes("score total")
      );
    });

    const total = inputParams.length || params.length;
    const filled = (inputParams.length ? inputParams : params).filter((p) => {
      const v = resultMap.get(Number(p.id));
      return v !== undefined && v !== "";
    }).length;

    const isRegistration = postName.toLowerCase().includes("registrasi");
    const isDone = isRegistration ? true : total > 0 && filled >= total;

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

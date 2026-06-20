// CAPASKA_RULE_ENGINE_FOUNDATION_V325
// Foundation for active scoring/rule evaluation.
// This module is intentionally side-effect free: no database writes, no network calls.
// Future UI/backend integration should use these helpers so dashboard/export can recalculate
// from the currently active parameter option rules instead of guessing from labels/order.

export type CapaskaStatusLevel = "normal" | "dengan_catatan" | "tidak_direkomendasikan";

export type CapaskaRuleSource = "active_rule" | "legacy_snapshot" | "legacy_fallback" | "unknown";

export interface CapaskaPostRule {
  post_id: number;
  post_key: string;
  post_name: string;
  display_order?: number | null;
  is_active?: boolean | null;
}

export interface CapaskaParameterRule {
  parameter_id?: string | number | null;
  id?: string | number | null;
  post_id: number;
  parameter_key: string;
  label: string;
  field_type?: string | null;
  display_order?: number | null;
  is_active?: boolean | null;
}

export interface CapaskaOptionRule {
  option_id?: string | number | null;
  id?: string | number | null;
  parameter_id?: string | number | null;
  parameter_key?: string | null;
  option_key: string;
  label: string;
  score: number;
  status_level: CapaskaStatusLevel;
  is_normal?: boolean | null;
  is_note?: boolean | null;
  is_redflag?: boolean | null;
  display_order?: number | null;
  is_active?: boolean | null;
}

export interface CapaskaStoredResult {
  participant_id?: string | number | null;
  post_id?: string | number | null;
  parameter_id?: string | number | null;
  parameter_key?: string | null;
  option_id?: string | number | null;
  option_key?: string | null;
  value?: unknown;
  value_label?: string | null;
  score_snapshot?: number | string | null;
  status_level_snapshot?: CapaskaStatusLevel | string | null;
  is_normal_snapshot?: boolean | null;
  is_note_snapshot?: boolean | null;
  is_redflag_snapshot?: boolean | null;
}

export interface CapaskaRuleLookup {
  optionsById: Map<string, CapaskaOptionRule>;
  optionsByKey: Map<string, CapaskaOptionRule>;
  parametersById: Map<string, CapaskaParameterRule>;
  parametersByKey: Map<string, CapaskaParameterRule>;
  postsById: Map<number, CapaskaPostRule>;
  postsByKey: Map<string, CapaskaPostRule>;
}

export interface CapaskaResolvedResult {
  participant_id?: string | number | null;
  post_id?: number | null;
  post_key?: string | null;
  parameter_id?: string | number | null;
  parameter_key?: string | null;
  option_id?: string | number | null;
  option_key?: string | null;
  label: string;
  value_label: string;
  score: number;
  status_level: CapaskaStatusLevel;
  is_normal: boolean;
  is_note: boolean;
  is_redflag: boolean;
  source: CapaskaRuleSource;
}

export interface CapaskaParticipantSummary {
  total_score: number;
  status_level: CapaskaStatusLevel;
  notes: CapaskaResolvedResult[];
  red_flags: CapaskaResolvedResult[];
  results: CapaskaResolvedResult[];
}

export function normalizeCapaskaKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeCapaskaText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function numericCapaskaScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function statusLevelFromRule(option: CapaskaOptionRule): CapaskaStatusLevel {
  if (option.is_redflag || option.status_level === "tidak_direkomendasikan") return "tidak_direkomendasikan";
  if (option.is_note || option.status_level === "dengan_catatan") return "dengan_catatan";
  return "normal";
}

export function mergeStatusLevel(current: CapaskaStatusLevel, next: CapaskaStatusLevel): CapaskaStatusLevel {
  if (current === "tidak_direkomendasikan" || next === "tidak_direkomendasikan") return "tidak_direkomendasikan";
  if (current === "dengan_catatan" || next === "dengan_catatan") return "dengan_catatan";
  return "normal";
}

function mapKey(...parts: Array<string | number | null | undefined>): string {
  return parts.map((part) => String(part ?? "")).join("::");
}

function entityId(value: { id?: string | number | null; option_id?: string | number | null; parameter_id?: string | number | null } | null | undefined, preferred: "option" | "parameter") {
  if (!value) return "";
  if (preferred === "option") return String(value.option_id ?? value.id ?? "");
  return String(value.parameter_id ?? value.id ?? "");
}

export function buildCapaskaRuleLookup(args: {
  posts?: CapaskaPostRule[] | null;
  parameters?: CapaskaParameterRule[] | null;
  options?: CapaskaOptionRule[] | null;
}): CapaskaRuleLookup {
  const postsById = new Map<number, CapaskaPostRule>();
  const postsByKey = new Map<string, CapaskaPostRule>();
  const parametersById = new Map<string, CapaskaParameterRule>();
  const parametersByKey = new Map<string, CapaskaParameterRule>();
  const optionsById = new Map<string, CapaskaOptionRule>();
  const optionsByKey = new Map<string, CapaskaOptionRule>();

  for (const post of args.posts || []) {
    const postId = Number(post.post_id);
    if (Number.isFinite(postId)) postsById.set(postId, post);
    if (post.post_key) postsByKey.set(normalizeCapaskaKey(post.post_key), post);
  }

  for (const parameter of args.parameters || []) {
    const id = entityId(parameter, "parameter");
    const key = normalizeCapaskaKey(parameter.parameter_key || parameter.label);
    if (id) parametersById.set(id, parameter);
    if (key) parametersByKey.set(key, parameter);
  }

  for (const option of args.options || []) {
    const optionId = entityId(option, "option");
    const parameterId = String(option.parameter_id ?? "");
    const parameterKey = normalizeCapaskaKey(option.parameter_key || "");
    const optionKey = normalizeCapaskaKey(option.option_key || option.label);

    if (optionId) optionsById.set(optionId, option);
    if (parameterId && optionKey) optionsByKey.set(mapKey("parameter_id", parameterId, optionKey), option);
    if (parameterKey && optionKey) optionsByKey.set(mapKey("parameter_key", parameterKey, optionKey), option);
    if (optionKey) optionsByKey.set(mapKey("option_key", optionKey), option);
  }

  return { optionsById, optionsByKey, parametersById, parametersByKey, postsById, postsByKey };
}

export function findActiveCapaskaOption(result: CapaskaStoredResult, lookup: CapaskaRuleLookup): CapaskaOptionRule | null {
  const optionId = String(result.option_id ?? "");
  if (optionId && lookup.optionsById.has(optionId)) return lookup.optionsById.get(optionId) || null;

  const optionKey = normalizeCapaskaKey(result.option_key || result.value_label || result.value);
  const parameterId = String(result.parameter_id ?? "");
  const parameterKey = normalizeCapaskaKey(result.parameter_key || "");

  if (parameterId && optionKey) {
    const option = lookup.optionsByKey.get(mapKey("parameter_id", parameterId, optionKey));
    if (option) return option;
  }

  if (parameterKey && optionKey) {
    const option = lookup.optionsByKey.get(mapKey("parameter_key", parameterKey, optionKey));
    if (option) return option;
  }

  if (optionKey) {
    const option = lookup.optionsByKey.get(mapKey("option_key", optionKey));
    if (option) return option;
  }

  return null;
}

export function resolveCapaskaResult(result: CapaskaStoredResult, lookup: CapaskaRuleLookup): CapaskaResolvedResult {
  const option = findActiveCapaskaOption(result, lookup);
  const parameterId = String(result.parameter_id ?? option?.parameter_id ?? "");
  const parameterKey = normalizeCapaskaKey(result.parameter_key || option?.parameter_key || "");
  const parameter = parameterId ? lookup.parametersById.get(parameterId) : parameterKey ? lookup.parametersByKey.get(parameterKey) : undefined;
  const postId = Number(result.post_id ?? parameter?.post_id ?? null);
  const post = Number.isFinite(postId) ? lookup.postsById.get(postId) : undefined;

  if (option) {
    const status = statusLevelFromRule(option);
    return {
      participant_id: result.participant_id,
      post_id: Number.isFinite(postId) ? postId : null,
      post_key: post?.post_key || null,
      parameter_id: result.parameter_id ?? parameter?.parameter_id ?? parameter?.id ?? null,
      parameter_key: parameterKey || option.parameter_key || null,
      option_id: result.option_id ?? option.option_id ?? option.id ?? null,
      option_key: option.option_key,
      label: parameter?.label || String(result.parameter_key || ""),
      value_label: option.label,
      score: option.score,
      status_level: status,
      is_normal: status === "normal" || Boolean(option.is_normal),
      is_note: status === "dengan_catatan" || Boolean(option.is_note),
      is_redflag: status === "tidak_direkomendasikan" || Boolean(option.is_redflag),
      source: "active_rule",
    };
  }

  const score = numericCapaskaScore(result.score_snapshot) ?? 0;
  const snapshotStatus = result.status_level_snapshot;
  const status: CapaskaStatusLevel = snapshotStatus === "tidak_direkomendasikan" || result.is_redflag_snapshot
    ? "tidak_direkomendasikan"
    : snapshotStatus === "dengan_catatan" || result.is_note_snapshot
      ? "dengan_catatan"
      : "normal";

  return {
    participant_id: result.participant_id,
    post_id: Number.isFinite(postId) ? postId : null,
    post_key: post?.post_key || null,
    parameter_id: result.parameter_id ?? parameter?.parameter_id ?? parameter?.id ?? null,
    parameter_key: parameterKey || null,
    option_id: result.option_id ?? null,
    option_key: result.option_key ?? null,
    label: parameter?.label || String(result.parameter_key || ""),
    value_label: String(result.value_label ?? result.value ?? ""),
    score,
    status_level: status,
    is_normal: status === "normal",
    is_note: status === "dengan_catatan",
    is_redflag: status === "tidak_direkomendasikan",
    source: result.score_snapshot !== undefined || result.status_level_snapshot !== undefined ? "legacy_snapshot" : "unknown",
  };
}

export function summarizeCapaskaResults(results: CapaskaStoredResult[], lookup: CapaskaRuleLookup): CapaskaParticipantSummary {
  const resolved = results.map((result) => resolveCapaskaResult(result, lookup));
  let total = 0;
  let status: CapaskaStatusLevel = "normal";
  const notes: CapaskaResolvedResult[] = [];
  const redFlags: CapaskaResolvedResult[] = [];

  for (const item of resolved) {
    total += item.score;
    status = mergeStatusLevel(status, item.status_level);
    if (item.is_note || item.is_redflag) notes.push(item);
    if (item.is_redflag) redFlags.push(item);
  }

  return { total_score: total, status_level: status, notes, red_flags: redFlags, results: resolved };
}

// WELLNESS_EFFECTIVE_DATED_TARGETS_V126M44_1
// Canonical target timeline. Coach target revisions apply from session_date
// forward and never rewrite the meaning of earlier participant activity.

import {
  participantNutritionCalorieLimit,
  participantWorkoutCalorieTarget,
  pointNumber,
} from "@/lib/wellness/pointRules";

export type WellnessTargetValues = {
  nutrition: number;
  workout: number;
  steps: number;
  duration_minutes: number;
  weight_kg: number;
};

export type WellnessTargetRevision = {
  note_id: number | null;
  effective_from: string;
  effective_at: string;
  scope: "individual" | "group" | "other";
  source_topic: string;
  values: WellnessTargetValues;
};

export type WellnessTargetTimeline = {
  participant_id: number;
  fallback: WellnessTargetValues;
  revisions: WellnessTargetRevision[];
  current: WellnessTargetValues;
  current_revision: WellnessTargetRevision | null;
  has_history: boolean;
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function jakartaDate(value: any) {
  const text = clean(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(text) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) {
    return text.slice(0, 10);
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text.slice(0, 10);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function targetText(note: any) {
  return [note?.action_plan, note?.coach_note, note?.main_issue]
    .map(clean)
    .filter(Boolean)
    .join("\n");
}

function targetNumber(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match ? pointNumber(match[1]) : 0;
}

export function parseWellnessTargetNote(note: any) {
  const text = targetText(note);
  return {
    nutrition: targetNumber(text, /Target\s+Nutrisi\s*:\s*([0-9.,]+)/i),
    workout: targetNumber(
      text,
      /Target\s+(?:Kalori\s+)?Workout\s*:\s*([0-9.,]+)/i,
    ),
    steps: targetNumber(text, /Target\s+Langkah\s*:\s*([0-9.,]+)/i),
    duration_minutes: targetNumber(
      text,
      /Target\s+(?:Durasi\s+)?Latihan\s*:\s*([0-9.,]+)/i,
    ),
    weight_kg: targetNumber(
      text,
      /Target\s+(?:BB|Berat(?:\s+Badan)?)\s*:\s*([0-9.,]+)/i,
    ),
  } satisfies WellnessTargetValues;
}

function explicitEffectiveDate(note: any) {
  const match = targetText(note).match(
    /(?:Berlaku\s+Mulai|Effective\s+From)\s*:\s*(\d{4}-\d{2}-\d{2})/i,
  );
  return match?.[1] || "";
}

function noteEffectiveDate(note: any) {
  return (
    explicitEffectiveDate(note) ||
    jakartaDate(note?.session_date) ||
    jakartaDate(note?.created_at) ||
    jakartaDate(note?.updated_at)
  );
}

function noteTimestamp(note: any) {
  const value = clean(note?.created_at || note?.updated_at || note?.session_date);
  const parsed = new Date(value || "").getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function noteScope(note: any): WellnessTargetRevision["scope"] {
  const topic = clean(note?.topic).toLowerCase();
  if (topic.includes("target wellness") || topic.includes("individual")) {
    return "individual";
  }
  if (topic.includes("kelompok") || topic.includes("group")) return "group";
  return "other";
}

function scopePriority(scope: WellnessTargetRevision["scope"]) {
  if (scope === "individual") return 3;
  if (scope === "group") return 2;
  return 1;
}

function hasTargetValue(values: WellnessTargetValues) {
  return Object.values(values).some((value) => pointNumber(value) > 0);
}

function participantFallback(participant: any): WellnessTargetValues {
  return {
    nutrition: participantNutritionCalorieLimit(participant) || 0,
    workout: participantWorkoutCalorieTarget(participant) || 300,
    steps:
      pointNumber(participant?.daily_step_target || participant?.step_target) ||
      8000,
    duration_minutes: 0,
    weight_kg: pointNumber(
      participant?.target_weight_kg || participant?.weight_target_kg,
    ),
  };
}

function historicalBaseline(
  participant: any,
  parsedRows: Array<{ values: WellnessTargetValues }>,
) {
  const direct = participantFallback(participant);
  const fields = [
    "nutrition",
    "workout",
    "steps",
    "duration_minutes",
    "weight_kg",
  ] as const;

  const result: WellnessTargetValues = {
    nutrition: 0,
    workout: 300,
    steps: 8000,
    duration_minutes: 0,
    weight_kg: 0,
  };

  for (const field of fields) {
    const appearsInHistory = parsedRows.some(
      (item) => pointNumber(item.values[field]) > 0,
    );
    // A current participant column may already contain the newest target.
    // Do not leak that value backwards when a historical note exists.
    if (!appearsInHistory) result[field] = direct[field];
  }

  return result;
}

export function buildEffectiveTargetTimeline(params: {
  participant: any;
  notes?: any[];
}): WellnessTargetTimeline {
  const participantId = pointNumber(params.participant?.id);
  const parsedRows = (params.notes || [])
    .map((note: any) => ({
      note,
      values: parseWellnessTargetNote(note),
      effective_from: noteEffectiveDate(note),
      timestamp: noteTimestamp(note),
      scope: noteScope(note),
    }))
    .filter(
      (item) => Boolean(item.effective_from) && hasTargetValue(item.values),
    )
    .sort((a, b) => {
      const dateDifference = a.effective_from.localeCompare(b.effective_from);
      if (dateDifference !== 0) return dateDifference;
      const priorityDifference = scopePriority(a.scope) - scopePriority(b.scope);
      if (priorityDifference !== 0) return priorityDifference;
      const timeDifference = a.timestamp - b.timestamp;
      if (timeDifference !== 0) return timeDifference;
      return pointNumber(a.note?.id) - pointNumber(b.note?.id);
    });

  const fallback = historicalBaseline(params.participant, parsedRows);
  const groupState: Partial<WellnessTargetValues> = {};
  const individualState: Partial<WellnessTargetValues> = {};
  const otherState: Partial<WellnessTargetValues> = {};
  const revisions: WellnessTargetRevision[] = [];
  const fields = [
    "nutrition",
    "workout",
    "steps",
    "duration_minutes",
    "weight_kg",
  ] as const;

  const resolvedValues = () => {
    const values = { ...fallback };
    for (const field of fields) {
      const individual = pointNumber(individualState[field]);
      const group = pointNumber(groupState[field]);
      const other = pointNumber(otherState[field]);
      if (individual > 0) values[field] = individual;
      else if (group > 0) values[field] = group;
      else if (other > 0) values[field] = other;
    }
    return values;
  };

  let previousResolved = { ...fallback };
  for (const item of parsedRows) {
    const state =
      item.scope === "individual"
        ? individualState
        : item.scope === "group"
          ? groupState
          : otherState;

    for (const field of fields) {
      const next = pointNumber(item.values[field]);
      if (next > 0) state[field] = next;
    }

    const values = resolvedValues();
    const changed = fields.some(
      (field) => pointNumber(values[field]) !== pointNumber(previousResolved[field]),
    );
    if (!changed) continue;

    revisions.push({
      note_id: pointNumber(item.note?.id) || null,
      effective_from: item.effective_from,
      effective_at: clean(
        item.note?.created_at || item.note?.updated_at || item.note?.session_date,
      ),
      scope: item.scope,
      source_topic: clean(item.note?.topic),
      values: { ...values },
    });
    previousResolved = { ...values };
  }

  const currentRevision = revisions.at(-1) || null;
  const currentValues = currentRevision
    ? { ...currentRevision.values }
    : participantFallback(params.participant);

  return {
    participant_id: participantId,
    fallback,
    revisions,
    current: currentValues,
    current_revision: currentRevision,
    has_history: revisions.length > 0,
  };
}

export function effectiveTargetsForDate(
  timeline: WellnessTargetTimeline,
  date: any,
): WellnessTargetValues {
  const dateKey = jakartaDate(date);
  if (!dateKey || timeline.revisions.length === 0) {
    return { ...timeline.current };
  }

  let selected: WellnessTargetRevision | null = null;
  for (const revision of timeline.revisions) {
    if (revision.effective_from > dateKey) break;
    selected = revision;
  }

  return selected ? { ...selected.values } : { ...timeline.fallback };
}

export function effectiveTargetRevisionForDate(
  timeline: WellnessTargetTimeline,
  date: any,
) {
  const dateKey = jakartaDate(date);
  if (!dateKey) return timeline.current_revision;

  let selected: WellnessTargetRevision | null = null;
  for (const revision of timeline.revisions) {
    if (revision.effective_from > dateKey) break;
    selected = revision;
  }
  return selected;
}

export async function loadEffectiveTargetTimeline(params: {
  supabase: any;
  participant: any;
  notes?: any[];
  limit?: number;
}) {
  if (params.notes) {
    return buildEffectiveTargetTimeline({
      participant: params.participant,
      notes: params.notes,
    });
  }

  const participantId = pointNumber(params.participant?.id);
  if (!participantId) {
    return buildEffectiveTargetTimeline({ participant: params.participant });
  }

  const { data, error } = await params.supabase
    .from("wellness_coach_notes")
    .select("*")
    .eq("participant_id", participantId)
    .order("session_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(Math.max(100, params.limit || 2000));

  if (error) throw error;
  return buildEffectiveTargetTimeline({
    participant: params.participant,
    notes: data || [],
  });
}

export function targetTimelineSummary(timeline: WellnessTargetTimeline) {
  return {
    has_history: timeline.has_history,
    revision_count: timeline.revisions.length,
    current: timeline.current,
    current_revision: timeline.current_revision,
    first_effective_from: timeline.revisions[0]?.effective_from || null,
    last_effective_from: timeline.current_revision?.effective_from || null,
  };
}

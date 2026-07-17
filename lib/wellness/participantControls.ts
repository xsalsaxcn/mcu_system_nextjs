// WELLNESS_PARTICIPANT_CONTROLS_V79F
// Central source of truth for participant portal access and the single active
// fitness provider used by dashboards, ranking, and workout calculations.

export type FitnessSource = "health_connect" | "google_fit" | "none";

export type ParticipantControl = {
  participant_id: number;
  session_enabled: boolean;
  fitness_enabled: boolean;
  fitness_source: FitnessSource;
  connected_providers: FitnessSource[];
  active_providers: FitnessSource[];
  has_multiple_active_providers: boolean;
  source_connected: boolean;
  control_exists: boolean;
  updated_at?: string | null;
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function enabled(value: any, fallback = true) {
  if (value === null || value === undefined || value === "") return fallback;
  return ![false, 0, "0", "false", "inactive", "nonaktif", "off"].includes(
    typeof value === "string" ? value.toLowerCase() : value,
  );
}

export function normalizeFitnessSource(value: any): FitnessSource {
  const text = clean(value).toLowerCase().replace(/-/g, "_");
  if (text === "health_connect") return "health_connect";
  if (text === "google_fit") return "google_fit";
  return "none";
}

function parseRawPayload(value: any) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function activityFitnessProvider(row: any): FitnessSource {
  const raw = parseRawPayload(row?.raw_payload);
  return normalizeFitnessSource(
    row?.source ||
      row?.provider ||
      row?.input_source ||
      raw?.provider ||
      raw?.source,
  );
}

async function safeRows(query: any) {
  try {
    const result = await query;
    if (result?.error) return [];
    return result?.data || [];
  } catch {
    return [];
  }
}

export async function loadParticipantControlMap(
  supabase: any,
  participantIds: Array<number | string>,
): Promise<Map<number, ParticipantControl>> {
  const ids = [...new Set(participantIds.map(numberValue).filter(Boolean))];
  const result = new Map<number, ParticipantControl>();
  if (!ids.length) return result;

  const [controlRows, integrationRows] = await Promise.all([
    safeRows(
      supabase
        .from("wellness_participant_controls")
        .select("*")
        .in("participant_id", ids),
    ),
    safeRows(
      supabase
        .from("wellness_integrations")
        .select("participant_id,provider,is_active,connected_at,last_sync_at")
        .in("participant_id", ids)
        .in("provider", ["health_connect", "google_fit"]),
    ),
  ]);

  const controlById = new Map<number, any>(
    controlRows.map((row: any) => [numberValue(row.participant_id), row]),
  );
  const integrationsById = new Map<number, any[]>();

  for (const row of integrationRows) {
    const id = numberValue(row.participant_id);
    if (!id) continue;
    if (!integrationsById.has(id)) integrationsById.set(id, []);
    integrationsById.get(id)!.push(row);
  }

  for (const participantId of ids) {
    const row = controlById.get(participantId) || null;
    const integrations = integrationsById.get(participantId) || [];
    const connectedProviders = [
      ...new Set(
        integrations
          .map((item: any) => normalizeFitnessSource(item.provider))
          .filter((item: FitnessSource) => item !== "none"),
      ),
    ] as FitnessSource[];
    const activeProviders = [
      ...new Set(
        integrations
          .filter((item: any) => enabled(item.is_active, true))
          .map((item: any) => normalizeFitnessSource(item.provider))
          .filter((item: FitnessSource) => item !== "none"),
      ),
    ] as FitnessSource[];

    const derivedSource: FitnessSource = activeProviders.includes(
      "health_connect",
    )
      ? "health_connect"
      : activeProviders.includes("google_fit")
        ? "google_fit"
        : "none";
    const storedSource = normalizeFitnessSource(row?.fitness_source);
    const fitnessSource = row ? storedSource : derivedSource;
    const fitnessEnabled = row
      ? enabled(row.fitness_enabled, fitnessSource !== "none")
      : fitnessSource !== "none";

    result.set(participantId, {
      participant_id: participantId,
      session_enabled: row ? enabled(row.session_enabled, true) : true,
      fitness_enabled: fitnessEnabled,
      fitness_source: fitnessSource,
      connected_providers: connectedProviders,
      active_providers: activeProviders,
      has_multiple_active_providers: activeProviders.length > 1,
      source_connected:
        fitnessEnabled && connectedProviders.includes(fitnessSource),
      control_exists: Boolean(row),
      updated_at: row?.updated_at || null,
    });
  }

  return result;
}

export async function loadParticipantControl(
  supabase: any,
  participantId: number | string,
) {
  const id = numberValue(participantId);
  const map = await loadParticipantControlMap(supabase, id ? [id] : []);
  return (
    map.get(id) || {
      participant_id: id,
      session_enabled: true,
      fitness_enabled: false,
      fitness_source: "none" as FitnessSource,
      connected_providers: [],
      active_providers: [],
      has_multiple_active_providers: false,
      source_connected: false,
      control_exists: false,
      updated_at: null,
    }
  );
}

export function filterActivityRowsByFitnessSource(
  rows: any[] = [],
  controls: Map<number, ParticipantControl>,
) {
  return (rows || []).filter((row: any) => {
    const provider = activityFitnessProvider(row);
    if (provider === "none") return true;

    const participantId = numberValue(row?.participant_id);
    const control = controls.get(participantId);
    if (!control) return provider === "health_connect";
    if (!control.fitness_enabled) return false;
    return control.fitness_source === provider;
  });
}

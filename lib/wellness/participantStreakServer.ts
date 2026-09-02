// WELLNESS_PARTICIPANT_STREAK_SERVER_V126M26_1
// Shared server loader for the participant initial payload and streak refresh API.
// Read-only: no database writes, schema changes, or Google Fit sync changes.

import {
  filterActivityRowsByFitnessSource,
  loadParticipantControlMap,
} from "@/lib/wellness/participantControls";
import { loadCanonicalNutritionHistory } from "@/lib/wellness/nutritionHistory";
import {
  loadEffectiveTargetTimeline,
  targetTimelineSummary,
} from "@/lib/wellness/effectiveDatedTargets";
import { filterOperationalRowsForProgram } from "@/lib/wellness/programWindow";
import { buildWellnessStreakSummary } from "@/lib/wellness/streak";

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

// WELLNESS_STREAK_PROOF_POINT_PARITY_V126M119_7
// Audit-backed historical proof only. This is not a new Nutrition source and is
// used only inside streak computation for the 96 participant/date gaps proven by V119.6.
const HISTORICAL_STREAK_NUTRITION_POINT_IDS: Record<
  number,
  Record<string, number[]>
> = {
  "19": {
    "2026-08-05": [
      2291,
      2423,
      2469
    ]
  },
  "20": {
    "2026-08-05": [
      2262,
      2374,
      2375,
      2492
    ],
    "2026-08-06": [
      2596,
      2768,
      2769,
      2775
    ],
    "2026-08-07": [
      2873,
      2939,
      3002
    ]
  },
  "24": {
    "2026-08-05": [
      2300,
      2455,
      2457
    ],
    "2026-08-08": [
      3136,
      3264,
      3265
    ]
  },
  "26": {
    "2026-08-05": [
      2333,
      2476,
      2517
    ],
    "2026-08-06": [
      2627,
      2759,
      2763
    ],
    "2026-08-07": [
      2915,
      3101,
      3104
    ],
    "2026-08-08": [
      3134,
      3297,
      3298
    ]
  },
  "32": {
    "2026-08-03": [
      1959,
      1961,
      2084
    ]
  },
  "35": {
    "2026-08-01": [
      1423,
      1531,
      1532
    ],
    "2026-08-06": [
      2611,
      2687,
      2738
    ],
    "2026-08-07": [
      2861,
      2937,
      3004
    ]
  },
  "42": {
    "2026-07-31": [
      1112,
      1225,
      1294
    ],
    "2026-08-05": [
      2270,
      2372,
      2389,
      2453
    ],
    "2026-08-06": [
      2535,
      2681,
      2682,
      2736
    ],
    "2026-08-07": [
      2819,
      2921,
      2961,
      2983
    ]
  },
  "43": {
    "2026-07-31": [
      1194,
      1315,
      1316
    ],
    "2026-08-01": [
      1414,
      1472,
      1530
    ],
    "2026-08-02": [
      1663,
      1731,
      1747
    ],
    "2026-08-03": [
      1887,
      1984,
      1987
    ],
    "2026-08-06": [
      2588,
      2754,
      2756
    ],
    "2026-08-08": [
      3180,
      3272,
      3273
    ]
  },
  "45": {
    "2026-07-27": [
      129,
      243,
      290
    ],
    "2026-07-28": [
      311,
      418,
      519,
      543
    ],
    "2026-07-30": [
      877,
      969,
      1042,
      1043
    ],
    "2026-07-31": [
      1111,
      1121,
      1318
    ]
  },
  "46": {
    "2026-07-28": [
      379,
      383,
      390,
      497,
      530
    ],
    "2026-07-29": [
      668,
      722,
      728
    ],
    "2026-07-30": [
      1028,
      1030,
      1079,
      1091
    ],
    "2026-07-31": [
      1196,
      1231,
      1321
    ],
    "2026-08-01": [
      1405,
      1483,
      1529
    ],
    "2026-08-02": [
      1579,
      1611,
      1686,
      1733
    ],
    "2026-08-03": [
      1832,
      1963,
      1991
    ],
    "2026-08-04": [
      2103,
      2128,
      2154,
      2212
    ],
    "2026-08-05": [
      2355,
      2444,
      2449
    ],
    "2026-08-06": [
      2575,
      2702,
      2720,
      2776
    ],
    "2026-08-07": [
      2825,
      2917,
      2960,
      3013
    ],
    "2026-08-08": [
      3141,
      3208,
      3217
    ]
  },
  "51": {
    "2026-08-02": [
      1783,
      1785,
      1786,
      1787
    ]
  },
  "56": {
    "2026-07-28": [
      315,
      429,
      553
    ],
    "2026-08-08": [
      3177,
      3179,
      3206
    ]
  },
  "57": {
    "2026-07-30": [
      970,
      973,
      1086,
      1087
    ],
    "2026-07-31": [
      1265,
      1267,
      1326
    ],
    "2026-08-02": [
      1717,
      1719,
      1755,
      1757
    ],
    "2026-08-04": [
      2094,
      2211,
      2213,
      2485
    ],
    "2026-08-05": [
      2398,
      2402,
      2480,
      2484
    ],
    "2026-08-07": [
      2859,
      2941,
      3116,
      3127
    ],
    "2026-08-08": [
      3119,
      3270,
      3271
    ]
  },
  "59": {
    "2026-08-02": [
      1583,
      1725,
      1728
    ],
    "2026-08-04": [
      2075,
      2246,
      2247
    ]
  },
  "62": {
    "2026-07-29": [
      596,
      654,
      791
    ]
  },
  "68": {
    "2026-07-27": [
      125,
      172,
      282,
      305
    ],
    "2026-07-28": [
      355,
      366,
      436,
      561
    ],
    "2026-07-29": [
      626,
      675,
      846
    ],
    "2026-07-30": [
      928,
      975,
      1104
    ],
    "2026-08-05": [
      2406,
      2410,
      2509
    ],
    "2026-08-06": [
      2665,
      2699,
      2766
    ],
    "2026-08-08": [
      3299,
      3301,
      3302
    ]
  },
  "69": {
    "2026-07-27": [
      121,
      259,
      289,
      291
    ],
    "2026-07-28": [
      361,
      419,
      421,
      565
    ],
    "2026-07-29": [
      651,
      812,
      818,
      820,
      822,
      826,
      827,
      831,
      833
    ],
    "2026-08-01": [
      1410,
      1412,
      1595,
      1596,
      1598,
      1599,
      1600,
      1601
    ],
    "2026-08-02": [
      1602,
      1604,
      1616,
      1691,
      1817,
      1818
    ],
    "2026-08-05": [
      2386,
      2388,
      2391,
      2392,
      2504,
      2505,
      2725
    ]
  },
  "72": {
    "2026-07-28": [
      321,
      328,
      389,
      506
    ]
  },
  "74": {
    "2026-07-27": [
      127,
      184,
      272
    ],
    "2026-07-28": [
      369,
      447,
      557,
      559
    ],
    "2026-07-29": [
      588,
      688,
      844
    ]
  },
  "75": {
    "2026-07-31": [
      944,
      1242,
      1243
    ]
  },
  "76": {
    "2026-08-01": [
      1396,
      1451,
      1515,
      1562
    ],
    "2026-08-02": [
      1627,
      1706,
      1712
    ]
  },
  "79": {
    "2026-07-28": [
      323,
      413,
      522
    ]
  },
  "82": {
    "2026-08-01": [
      1372,
      1452,
      1526
    ]
  },
  "83": {
    "2026-07-27": [
      426,
      428,
      430
    ],
    "2026-07-29": [
      636,
      692,
      801
    ]
  },
  "84": {
    "2026-07-28": [
      441,
      445,
      526
    ],
    "2026-07-30": [
      986,
      988,
      1061
    ]
  },
  "87": {
    "2026-07-27": [
      139,
      160,
      288,
      309
    ],
    "2026-07-28": [
      461,
      520,
      545
    ]
  },
  "88": {
    "2026-08-07": [
      3015,
      3018,
      3019
    ],
    "2026-09-01": [
      9248,
      9250,
      9251
    ]
  },
  "89": {
    "2026-08-08": [
      3291,
      3293,
      3294,
      3295
    ]
  },
  "93": {
    "2026-07-28": [
      348,
      442,
      539
    ]
  },
  "94": {
    "2026-07-29": [
      583,
      676,
      725
    ],
    "2026-07-30": [
      957,
      959,
      1026,
      1040
    ],
    "2026-07-31": [
      1130,
      1259,
      1262
    ],
    "2026-08-01": [
      1350,
      1458,
      1508
    ],
    "2026-08-02": [
      1571,
      1708,
      1709,
      1743
    ],
    "2026-08-03": [
      1797,
      1835,
      1931,
      1934,
      1955,
      1957
    ],
    "2026-08-06": [
      2573,
      2586,
      2671,
      2672,
      2707,
      2715
    ],
    "2026-08-07": [
      2841,
      2846,
      2927,
      2964,
      2965
    ],
    "2026-08-08": [
      3163,
      3174,
      3175,
      3219,
      3223,
      3226
    ]
  },
  "95": {
    "2026-08-07": [
      2808,
      2913,
      2977
    ]
  },
  "100": {
    "2026-08-07": [
      3039,
      3041,
      3042
    ]
  }
};

function historicalProofPointText(row: any) {
  return [row?.source_type, row?.point_key, row?.description]
    .map(clean)
    .join(" ")
    .toLowerCase();
}

function historicalProofDate(row: any) {
  return clean(row?.log_date || row?.date || row?.created_at).slice(0, 10);
}

function isHistoricalNutritionInputPoint(row: any) {
  const text = historicalProofPointText(row);
  if (!/food|nutrition|nutrisi|meal/.test(text)) return false;
  if (/bonus/.test(text)) return false;
  return Math.abs(numberValue(row?.points) - 5) < 0.001;
}

function nutritionCountByDate(rows: any[]) {
  const counts = new Map<string, number>();
  for (const row of rows || []) {
    const date = historicalProofDate(row);
    if (!date) continue;
    counts.set(date, (counts.get(date) || 0) + 1);
  }
  return counts;
}

function fallbackControlMap(participant: any) {
  const participantId = numberValue(participant?.id);
  const map = new Map<number, any>();
  if (participantId > 0 && participant?.wellness_control) {
    map.set(participantId, participant.wellness_control);
  }
  return map;
}

export async function loadParticipantCanonicalStreak(params: {
  supabase: any;
  participant: any;
}) {
  const participantId = numberValue(params.participant?.id);
  const warnings: string[] = [];

  const activityPromise = params.supabase
    .from("wellness_activity_logs")
    .select("*")
    .eq("participant_id", participantId)
    .order("log_date", { ascending: true })
    .limit(2000)
    .then((result: any) => result)
    .catch((error: any) => ({ data: [], error }));


  const historicalProofByDate =
    HISTORICAL_STREAK_NUTRITION_POINT_IDS[participantId] || {};
  const historicalProofPointIds = [
    ...new Set(Object.values(historicalProofByDate).flat()),
  ];
  const historicalProofPromise =
    historicalProofPointIds.length > 0
      ? params.supabase
          .from("wellness_point_logs")
          .select(
            "id,participant_id,log_date,point_key,source_type,source_id,description,status,points",
          )
          .eq("participant_id", participantId)
          .in("id", historicalProofPointIds)
          .then((result: any) => result)
          .catch((error: any) => ({ data: [], error }))
      : Promise.resolve({ data: [], error: null });

  const controlPromise = loadParticipantControlMap(
    params.supabase,
    [participantId],
  ).catch((error: any) => {
    warnings.push(`fitness-control:${clean(error?.message || "unavailable")}`);
    return fallbackControlMap(params.participant);
  });

  const nutritionPromise = loadCanonicalNutritionHistory({
    supabase: params.supabase,
    participant: params.participant,
  }).catch((error: any) => {
    warnings.push(`nutrition:${clean(error?.message || "unavailable")}`);
    return {
      participant_id: participantId,
      logs: [],
      sources: {
        supabase_rows: 0,
        google_sheet_ok: false,
        google_sheet_message: clean(error?.message || "Nutrition source unavailable."),
        google_sheet_rows: 0,
        unmatched_google_sheet_rows: 0,
      },
    };
  });

  const targetPromise = loadEffectiveTargetTimeline({
    supabase: params.supabase,
    participant: params.participant,
  }).catch((error: any) => {
    warnings.push(`targets:${clean(error?.message || "unavailable")}`);
    return loadEffectiveTargetTimeline({
      supabase: params.supabase,
      participant: params.participant,
      notes: [],
    });
  });

  const [
    activityResult,
    controlMap,
    nutritionHistory,
    targets,
    historicalProofResult,
  ] = await Promise.all([
    activityPromise,
    controlPromise,
    nutritionPromise,
    targetPromise,
    historicalProofPromise,
  ]);

  if (activityResult?.error) {
    warnings.push(
      `activity:${clean(activityResult.error?.message || "unavailable")}`,
    );
  }

  if (historicalProofResult?.error) {
    warnings.push(
      `historical-streak-proof:${clean(
        historicalProofResult.error?.message || "unavailable",
      )}`,
    );
  }

  const activityRows = filterOperationalRowsForProgram(
    params.participant,
    filterActivityRowsByFitnessSource(
      activityResult?.error ? [] : activityResult?.data || [],
      controlMap,
    ),
    "",
    "",
    ["log_date", "started_at", "created_at"],
  );

  const nutritionRows = filterOperationalRowsForProgram(
    params.participant,
    nutritionHistory?.logs || [],
    "",
    "",
    ["log_date", "created_at"],
  );

  // Keep canonical Nutrition untouched. For the exact V119.6 audited gap dates only,
  // use still-existing historical +5 Nutrition point identities as count proof.
  // Synthetic rows never leave this streak calculation and carry zero calories.
  const canonicalNutritionCounts = nutritionCountByDate(nutritionRows);
  const liveProofRowsById = new Map<number, any>(
    (historicalProofResult?.error ? [] : historicalProofResult?.data || []).map(
      (row: any) => [numberValue(row?.id), row],
    ),
  );
  const historicalProofRows: any[] = [];
  let historicalProofDatesApplied = 0;

  for (const [date, expectedPointIds] of Object.entries(
    historicalProofByDate,
  )) {
    const exactLiveProofRows = (expectedPointIds || [])
      .map((pointId) => liveProofRowsById.get(numberValue(pointId)))
      .filter(
        (row: any) =>
          row &&
          historicalProofDate(row) === date &&
          isHistoricalNutritionInputPoint(row),
      );

    const distinctExactIds = new Set(
      exactLiveProofRows.map((row: any) => numberValue(row?.id)).filter(Boolean),
    );
    if (distinctExactIds.size < 3) continue;

    const canonicalCount = canonicalNutritionCounts.get(date) || 0;
    const missingCount = Math.max(0, 3 - canonicalCount);
    if (missingCount <= 0) continue;

    for (let index = 0; index < missingCount; index += 1) {
      historicalProofRows.push({
        log_date: date,
        total_calories: 0,
        calories: 0,
        source_type: "historical_streak_point_proof",
        point_key: `historical_streak_point_proof_${index + 1}`,
      });
    }
    historicalProofDatesApplied += 1;
  }

  const operationalHistoricalProofRows = filterOperationalRowsForProgram(
    params.participant,
    historicalProofRows,
    "",
    "",
    ["log_date"],
  );
  const streakNutritionRows = [
    ...nutritionRows,
    ...operationalHistoricalProofRows,
  ];

  const nutritionTarget = numberValue(targets?.current?.nutrition);
  const workoutTarget = numberValue(targets?.current?.workout) || 300;
  const streak = buildWellnessStreakSummary({
    nutritionRows: streakNutritionRows,
    activityRows,
    workoutTargetCalories: workoutTarget,
    targetTimeline: targets,
  });

  const control =
    controlMap.get(participantId) ||
    params.participant?.wellness_control ||
    {};

  return {
    participant_id: participantId,
    streak,
    targets: {
      nutrition_max_calories: nutritionTarget,
      workout_min_calories: workoutTarget,
      target_history: targetTimelineSummary(targets),
    },
    sources: {
      nutrition: nutritionHistory?.sources || null,
      nutrition_rows: nutritionRows.length,
      historical_streak_proof_rows: operationalHistoricalProofRows.length,
      historical_streak_proof_dates: historicalProofDatesApplied,
      activity_ok: !activityResult?.error,
      activity_rows: activityRows.length,
      fitness_source: clean(control?.fitness_source || "none"),
    },
    status: warnings.length > 0 ? "partial" : "ok",
    warnings,
  };
}

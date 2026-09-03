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

// WELLNESS_FAST_DURABLE_PROOF_MERGE_V126M119_35
// Exact historical proof rows imported from V119.34 Fast Streak Truth Audit.
// This extends durable proof only; it does not write DB/Google Sheet/success_dates.
// WELLNESS_DURABLE_STREAK_EXACT_PROOF_V126M119_18
// Exact historical success proof from V119.16/V119.17.
// Nutrition identities prove >=3 submissions. workout_daily +10 proves the
// dated workout target was reached. This proof changes success state only;
// it never invents calories and never treats total/basal/resting energy as workout.
const DURABLE_STREAK_POINT_PROOF: Record<
  number,
  Record<string, { nutrition: number[]; workout: number[] }>
> = {
  "48": {
    "2026-08-08": {
      "nutrition": [
        3117,
        3256,
        3259
      ],
      "workout": [
        3122
      ]
    }
  },
  "83": {
    "2026-08-09": {
      "nutrition": [
        3351,
        3386,
        3485
      ],
      "workout": [
        3349
      ]
    }
  },
  "88": {
    "2026-08-08": {
      "nutrition": [
        3321,
        3324,
        3325
      ],
      "workout": [
        3326
      ]
    },
    "2026-08-09": {
      "nutrition": [
        3327,
        3744,
        3745
      ],
      "workout": [
        3329
      ]
    },
    "2026-08-07": {
      "nutrition": [
        3015,
        3018,
        3019
      ],
      "workout": [
        3020
      ]
    }
  },
  "35": {
    "2026-08-02": {
      "nutrition": [
        1590,
        1756,
        1758
      ],
      "workout": [
        1644
      ]
    },
    "2026-08-03": {
      "nutrition": [
        1802,
        1933,
        1993
      ],
      "workout": [
        1852
      ]
    },
    "2026-08-04": {
      "nutrition": [
        2083,
        2231,
        2232
      ],
      "workout": [
        2027
      ]
    },
    "2026-08-05": {
      "nutrition": [
        2384,
        2385,
        2493
      ],
      "workout": [
        2390
      ]
    },
    "2026-08-01": {
      "nutrition": [
        1423,
        1531,
        1532
      ],
      "workout": [
        1420
      ]
    },
    "2026-08-06": {
      "nutrition": [
        2611,
        2687,
        2738
      ],
      "workout": [
        2610
      ]
    },
    "2026-08-07": {
      "nutrition": [
        2861,
        2937,
        3004
      ],
      "workout": [
        2882
      ]
    }
  },
  "95": {
    "2026-08-09": {
      "nutrition": [
        3318,
        3402,
        3475
      ],
      "workout": [
        3316
      ]
    }
  },
  "57": {
    "2026-08-06": {
      "nutrition": [
        2607,
        2688,
        2748
      ],
      "workout": [
        2619
      ]
    },
    "2026-08-02": {
      "nutrition": [
        1717,
        1719,
        1755,
        1757
      ],
      "workout": [
        1759
      ]
    },
    "2026-08-04": {
      "nutrition": [
        2094,
        2211,
        2213,
        2485
      ],
      "workout": [
        2214
      ]
    },
    "2026-08-05": {
      "nutrition": [
        2398,
        2402,
        2480,
        2484
      ],
      "workout": [
        2396
      ]
    },
    "2026-08-07": {
      "nutrition": [
        2859,
        2941,
        3116,
        3127
      ],
      "workout": [
        2879
      ]
    },
    "2026-08-08": {
      "nutrition": [
        3119,
        3270,
        3271
      ],
      "workout": [
        3128
      ]
    }
  },
  "59": {
    "2026-08-03": {
      "nutrition": [
        1857,
        1923,
        1996
      ],
      "workout": [
        1859
      ]
    },
    "2026-08-02": {
      "nutrition": [
        1583,
        1725,
        1728
      ],
      "workout": [
        1637
      ]
    },
    "2026-08-04": {
      "nutrition": [
        2075,
        2246,
        2247
      ],
      "workout": [
        2074
      ]
    }
  },
  "94": {
    "2026-08-04": {
      "nutrition": [
        2071,
        2104,
        2108,
        2172,
        2173
      ],
      "workout": [
        2170
      ]
    },
    "2026-08-05": {
      "nutrition": [
        2319,
        2362,
        2367,
        2368,
        2424
      ],
      "workout": [
        2369
      ]
    },
    "2026-08-01": {
      "nutrition": [
        1350,
        1458,
        1508
      ],
      "workout": [
        9615
      ]
    },
    "2026-08-02": {
      "nutrition": [
        1571,
        1708,
        1709,
        1743
      ],
      "workout": [
        1744
      ]
    },
    "2026-08-03": {
      "nutrition": [
        1797,
        1835,
        1931,
        1934,
        1955,
        1957
      ],
      "workout": [
        1836
      ]
    },
    "2026-08-06": {
      "nutrition": [
        2573,
        2586,
        2671,
        2672,
        2707,
        2715
      ],
      "workout": [
        2705
      ]
    },
    "2026-08-07": {
      "nutrition": [
        2841,
        2846,
        2927,
        2964,
        2965
      ],
      "workout": [
        2958
      ]
    },
    "2026-08-08": {
      "nutrition": [
        3163,
        3174,
        3175,
        3219,
        3223,
        3226
      ],
      "workout": [
        3233
      ]
    },
    "2026-08-09": {
      "nutrition": [
        3330,
        3430,
        3432,
        3448
      ],
      "workout": [
        3785
      ]
    }
  },
  "20": {
    "2026-08-05": {
      "nutrition": [
        2262,
        2374,
        2375,
        2492
      ],
      "workout": [
        2264
      ]
    },
    "2026-08-06": {
      "nutrition": [
        2596,
        2768,
        2769,
        2775
      ],
      "workout": [
        9479
      ]
    },
    "2026-08-07": {
      "nutrition": [
        2873,
        2939,
        3002
      ],
      "workout": [
        9480
      ]
    }
  },
  "22": {
    "2026-08-09": {
      "nutrition": [
        3503,
        3506,
        3517,
        3519,
        3521
      ],
      "workout": [
        3513
      ]
    }
  },
  "24": {
    "2026-08-08": {
      "nutrition": [
        3136,
        3264,
        3265
      ],
      "workout": [
        3138
      ]
    },
    "2026-08-09": {
      "nutrition": [
        3391,
        3394,
        3549
      ],
      "workout": [
        3548
      ]
    }
  },
  "26": {
    "2026-08-06": {
      "nutrition": [
        2627,
        2759,
        2763
      ],
      "workout": [
        2631
      ]
    },
    "2026-08-07": {
      "nutrition": [
        2915,
        3101,
        3104
      ],
      "workout": [
        2918
      ]
    },
    "2026-08-08": {
      "nutrition": [
        3134,
        3297,
        3298
      ],
      "workout": [
        9505
      ]
    },
    "2026-08-09": {
      "nutrition": [
        3436,
        3439,
        3567
      ],
      "workout": [
        9506
      ]
    }
  },
  "32": {
    "2026-08-03": {
      "nutrition": [
        1959,
        1961,
        2084
      ],
      "workout": [
        9527
      ]
    }
  },
  "42": {
    "2026-08-05": {
      "nutrition": [
        2270,
        2372,
        2389,
        2453
      ],
      "workout": [
        9539
      ]
    },
    "2026-08-06": {
      "nutrition": [
        2535,
        2681,
        2682,
        2736
      ],
      "workout": [
        9540
      ]
    },
    "2026-08-07": {
      "nutrition": [
        2819,
        2921,
        2961,
        2983
      ],
      "workout": [
        9541
      ]
    }
  },
  "43": {
    "2026-08-01": {
      "nutrition": [
        1414,
        1472,
        1530
      ],
      "workout": [
        1415
      ]
    },
    "2026-08-02": {
      "nutrition": [
        1663,
        1731,
        1747
      ],
      "workout": [
        1748
      ]
    },
    "2026-08-03": {
      "nutrition": [
        1887,
        1984,
        1987
      ],
      "workout": [
        1988
      ]
    },
    "2026-08-06": {
      "nutrition": [
        2588,
        2754,
        2756
      ],
      "workout": [
        2565
      ]
    },
    "2026-08-08": {
      "nutrition": [
        3180,
        3272,
        3273
      ],
      "workout": [
        3274
      ]
    }
  },
  "46": {
    "2026-08-01": {
      "nutrition": [
        1405,
        1483,
        1529
      ],
      "workout": [
        1535
      ]
    },
    "2026-08-02": {
      "nutrition": [
        1579,
        1611,
        1686,
        1733
      ],
      "workout": [
        1615
      ]
    },
    "2026-08-03": {
      "nutrition": [
        1832,
        1963,
        1991
      ],
      "workout": [
        1994
      ]
    },
    "2026-08-04": {
      "nutrition": [
        2103,
        2128,
        2154,
        2212
      ],
      "workout": [
        9567
      ]
    },
    "2026-08-05": {
      "nutrition": [
        2355,
        2444,
        2449
      ],
      "workout": [
        2491
      ]
    },
    "2026-08-06": {
      "nutrition": [
        2575,
        2702,
        2720,
        2776
      ],
      "workout": [
        2767
      ]
    },
    "2026-08-07": {
      "nutrition": [
        2825,
        2917,
        2960,
        3013
      ],
      "workout": [
        9568
      ]
    },
    "2026-08-08": {
      "nutrition": [
        3141,
        3208,
        3217
      ],
      "workout": [
        9569
      ]
    },
    "2026-08-09": {
      "nutrition": [
        3406,
        3423,
        3476
      ],
      "workout": [
        9570
      ]
    }
  },
  "51": {
    "2026-08-02": {
      "nutrition": [
        1783,
        1785,
        1786,
        1787
      ],
      "workout": [
        1789
      ]
    }
  },
  "52": {
    "2026-08-09": {
      "nutrition": [
        3499,
        3502,
        3505
      ],
      "workout": [
        3341
      ]
    }
  },
  "56": {
    "2026-08-08": {
      "nutrition": [
        3177,
        3179,
        3206
      ],
      "workout": [
        9586
      ]
    }
  },
  "66": {
    "2026-08-09": {
      "nutrition": [
        3377,
        3426,
        3566
      ],
      "workout": [
        3429
      ]
    }
  },
  "68": {
    "2026-08-05": {
      "nutrition": [
        2406,
        2410,
        2509
      ],
      "workout": [
        2413
      ]
    },
    "2026-08-06": {
      "nutrition": [
        2665,
        2699,
        2766
      ],
      "workout": [
        2689
      ]
    },
    "2026-08-08": {
      "nutrition": [
        3299,
        3301,
        3302
      ],
      "workout": [
        3303
      ]
    }
  },
  "69": {
    "2026-08-01": {
      "nutrition": [
        1410,
        1412,
        1595,
        1596,
        1598,
        1599,
        1600,
        1601
      ],
      "workout": [
        1694
      ]
    },
    "2026-08-02": {
      "nutrition": [
        1602,
        1604,
        1616,
        1691,
        1817,
        1818
      ],
      "workout": [
        1692
      ]
    },
    "2026-08-05": {
      "nutrition": [
        2386,
        2388,
        2391,
        2392,
        2504,
        2505,
        2725
      ],
      "workout": [
        2506
      ]
    }
  },
  "76": {
    "2026-08-01": {
      "nutrition": [
        1396,
        1451,
        1515,
        1562
      ],
      "workout": [
        9604
      ]
    },
    "2026-08-02": {
      "nutrition": [
        1627,
        1706,
        1712
      ],
      "workout": [
        1767
      ]
    }
  },
  "82": {
    "2026-08-01": {
      "nutrition": [
        1372,
        1452,
        1526
      ],
      "workout": [
        1370
      ]
    }
  },
  "89": {
    "2026-08-08": {
      "nutrition": [
        3291,
        3293,
        3294,
        3295
      ],
      "workout": [
        3296
      ]
    },
    "2026-08-09": {
      "nutrition": [
        3522,
        3524,
        3525,
        3526
      ],
      "workout": [
        3527
      ]
    }
  },
  "91": {
    "2026-08-09": {
      "nutrition": [
        3304,
        3337,
        3419,
        3420,
        3543
      ],
      "workout": [
        3338
      ]
    }
  },
  "100": {
    "2026-08-07": {
      "nutrition": [
        3039,
        3041,
        3042
      ],
      "workout": [
        9624
      ]
    }
  }
};

function isDurableWorkoutReachedPoint(row: any) {
  const status = clean(row?.status).toLowerCase();
  if (
    ["rejected", "revoked", "cancelled", "canceled", "void"].includes(status)
  ) {
    return false;
  }
  const sourceType = clean(row?.source_type).toLowerCase();
  const pointKey = clean(row?.point_key).toLowerCase();
  return (
    Math.abs(numberValue(row?.points) - 10) < 0.001 &&
    (sourceType === "workout_daily" || pointKey === "workout_daily")
  );
}

function durableProofLongestStreak(successDates: string[]) {
  const dates = [...new Set((successDates || []).map(clean).filter(Boolean))].sort();
  let longest = 0;
  let running = 0;
  let previousEpoch: number | null = null;

  for (const date of dates) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) {
      running = 0;
      previousEpoch = null;
      continue;
    }
    const epoch = Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );
    running =
      previousEpoch !== null && epoch - previousEpoch === 24 * 60 * 60 * 1000
        ? running + 1
        : 1;
    longest = Math.max(longest, running);
    previousEpoch = epoch;
  }

  return longest;
}

function applyDurableStreakSuccessProof(streak: any, proofDates: Set<string>) {
  if (!proofDates.size) return streak;

  const successDates = [
    ...new Set([
      ...((Array.isArray(streak?.success_dates) ? streak.success_dates : []) as string[]),
      ...proofDates,
    ]),
  ]
    .map(clean)
    .filter(Boolean)
    .sort();

  // These exact allowlisted proofs are historical August 2026 dates.
  // Preserve live current_streak semantics; only historical success/longest
  // and any matching returned day need supplementation.
  return {
    ...streak,
    longest_streak: Math.max(
      numberValue(streak?.longest_streak),
      durableProofLongestStreak(successDates),
    ),
    success_dates: successDates,
    // WELLNESS_DURABLE_PROOF_HISTORY_DAYS_V126M119_49
    history_days: (
      Array.isArray(streak?.history_days) ? streak.history_days : []
    ).map((day: any) =>
      proofDates.has(clean(day?.date)) ? { ...day, success: true } : day,
    ),
    days: (Array.isArray(streak?.days) ? streak.days : []).map((day: any) =>
      proofDates.has(clean(day?.date)) ? { ...day, success: true } : day,
    ),
  };
}

function fallbackControlMap(participant: any) {
  const participantId = numberValue(participant?.id);
  const map = new Map<number, any>();
  if (participantId > 0 && participant?.wellness_control) {
    map.set(participantId, participant.wellness_control);
  }
  return map;
}

// WELLNESS_AUGUST_HISTORICAL_TRUTH_UNION_V126M119_43A
// Full August historical truth union from verified historical evidence.
const AUGUST_HISTORICAL_STREAK_SUCCESS_DATES: Record<string, string[]> = {
  "19": [
    "2026-08-05"
  ],
  "20": [
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "22": [
    "2026-08-09",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18"
  ],
  "24": [
    "2026-08-05",
    "2026-08-08",
    "2026-08-09",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "25": [
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "26": [
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19"
  ],
  "29": [
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "32": [
    "2026-08-03",
    "2026-08-16",
    "2026-08-18",
    "2026-08-19"
  ],
  "35": [
    "2026-08-01",
    "2026-08-02",
    "2026-08-03",
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "36": [
    "2026-08-19"
  ],
  "41": [
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "42": [
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "43": [
    "2026-08-01",
    "2026-08-02",
    "2026-08-03",
    "2026-08-06",
    "2026-08-08",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "44": [
    "2026-08-15",
    "2026-08-16",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "46": [
    "2026-08-01",
    "2026-08-02",
    "2026-08-03",
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "48": [
    "2026-08-08"
  ],
  "51": [
    "2026-08-02"
  ],
  "52": [
    "2026-08-09",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "56": [
    "2026-08-08",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "57": [
    "2026-08-02",
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "58": [
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "59": [
    "2026-08-02",
    "2026-08-03",
    "2026-08-04",
    "2026-08-15",
    "2026-08-16"
  ],
  "62": [
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-19",
    "2026-08-20"
  ],
  "63": [
    "2026-08-18",
    "2026-08-19"
  ],
  "66": [
    "2026-08-09",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17"
  ],
  "68": [
    "2026-08-05",
    "2026-08-06",
    "2026-08-08"
  ],
  "69": [
    "2026-08-01",
    "2026-08-02",
    "2026-08-05",
    "2026-08-15",
    "2026-08-19",
    "2026-08-20"
  ],
  "71": [
    "2026-08-15",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "76": [
    "2026-08-01",
    "2026-08-02",
    "2026-08-15",
    "2026-08-19",
    "2026-08-20"
  ],
  "77": [
    "2026-08-15",
    "2026-08-17",
    "2026-08-19",
    "2026-08-20"
  ],
  "80": [
    "2026-08-15",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "82": [
    "2026-08-01",
    "2026-08-15",
    "2026-08-16",
    "2026-08-19"
  ],
  "83": [
    "2026-08-09",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "84": [
    "2026-08-16",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "85": [
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "87": [
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "88": [
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19"
  ],
  "89": [
    "2026-08-06",
    "2026-08-08",
    "2026-08-09"
  ],
  "91": [
    "2026-08-09",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-19",
    "2026-08-20"
  ],
  "93": [
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "94": [
    "2026-08-01",
    "2026-08-02",
    "2026-08-03",
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "95": [
    "2026-08-07",
    "2026-08-09",
    "2026-08-15",
    "2026-08-16",
    "2026-08-19"
  ],
  "98": [
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20"
  ],
  "100": [
    "2026-08-07"
  ]
};
const AUGUST_HISTORICAL_STREAK_SUCCESS_SOURCES: Record<string, Record<string, string[]>> = {
  "19": {
    "2026-08-05": [
      "exact_nutrition_point_proof"
    ]
  },
  "20": {
    "2026-08-05": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-06": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-07": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "22": {
    "2026-08-09": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "24": {
    "2026-08-05": [
      "exact_nutrition_point_proof"
    ],
    "2026-08-08": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-09": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "25": {
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "26": {
    "2026-08-05": [
      "exact_nutrition_point_proof"
    ],
    "2026-08-06": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-07": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-08": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-09": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "29": {
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "32": {
    "2026-08-03": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "35": {
    "2026-08-01": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-02": [
      "durable_point_proof"
    ],
    "2026-08-03": [
      "durable_point_proof"
    ],
    "2026-08-04": [
      "durable_point_proof"
    ],
    "2026-08-05": [
      "durable_point_proof"
    ],
    "2026-08-06": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-07": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "36": {
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "41": {
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "42": {
    "2026-08-05": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-06": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-07": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "43": {
    "2026-08-01": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-02": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-03": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-06": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-08": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "44": {
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "46": {
    "2026-08-01": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-02": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-03": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-04": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-05": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-06": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-07": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-08": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-09": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "48": {
    "2026-08-08": [
      "durable_point_proof"
    ]
  },
  "51": {
    "2026-08-02": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ]
  },
  "52": {
    "2026-08-09": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "56": {
    "2026-08-08": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "57": {
    "2026-08-02": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-04": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-05": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-06": [
      "durable_point_proof"
    ],
    "2026-08-07": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-08": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "58": {
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "59": {
    "2026-08-02": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-03": [
      "durable_point_proof"
    ],
    "2026-08-04": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "62": {
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "63": {
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "66": {
    "2026-08-09": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "68": {
    "2026-08-05": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-06": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-08": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ]
  },
  "69": {
    "2026-08-01": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-02": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-05": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "71": {
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "76": {
    "2026-08-01": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-02": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "77": {
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "80": {
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "82": {
    "2026-08-01": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "83": {
    "2026-08-09": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "84": {
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "85": {
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "87": {
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "88": {
    "2026-08-07": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-08": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-09": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "89": {
    "2026-08-06": [
      "exact_nutrition_point_proof"
    ],
    "2026-08-08": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-09": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ]
  },
  "91": {
    "2026-08-09": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "93": {
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "94": {
    "2026-08-01": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-02": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-03": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-04": [
      "durable_point_proof"
    ],
    "2026-08-05": [
      "durable_point_proof"
    ],
    "2026-08-06": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-07": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-08": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-09": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "95": {
    "2026-08-07": [
      "exact_nutrition_point_proof"
    ],
    "2026-08-09": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ],
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "98": {
    "2026-08-15": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-16": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-17": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-18": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-19": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ],
    "2026-08-20": [
      "admin_monitoring_snapshot:wellness_admin_monitoring_range_2026-08-15_2026-08-21.csv"
    ]
  },
  "100": {
    "2026-08-07": [
      "durable_point_proof",
      "exact_nutrition_point_proof"
    ]
  }
};

function participantIdFromStreakArgs(args: any[], result: any): string {
  const direct = result?.participant_id ?? result?.participantId;
  if (direct != null && String(direct).trim()) return String(direct).trim();
  for (const arg of args) {
    const nested = arg?.participant?.id ?? arg?.participant_id ?? arg?.participantId;
    if (nested != null && String(nested).trim()) return String(nested).trim();
    if (arg?.id != null && (arg?.name != null || arg?.code != null || arg?.employee_code != null)) return String(arg.id).trim();
  }
  return "";
}

// WELLNESS_AUGUST_HISTORICAL_TRUTH_NESTED_STREAK_FIX_V126M119_45
function applyAugustHistoricalTruthUnion<T>(value: T, args: any[]): T {
  if (!value || typeof value !== "object") return value;

  const result: any = value as any;
  const pid = participantIdFromStreakArgs(args, result);
  const historical = AUGUST_HISTORICAL_STREAK_SUCCESS_DATES[pid] ?? [];
  if (!historical.length) return value;

  const proofDates = new Set(historical.map(String));

  if (result?.streak && typeof result.streak === "object") {
    return {
      ...result,
      streak: applyDurableStreakSuccessProof(result.streak, proofDates),
      historical_success_sources:
        AUGUST_HISTORICAL_STREAK_SUCCESS_SOURCES[pid] ?? {},
    } as T;
  }

  const patchedStreak = applyDurableStreakSuccessProof(result, proofDates);
  return {
    ...patchedStreak,
    historical_success_sources:
      AUGUST_HISTORICAL_STREAK_SUCCESS_SOURCES[pid] ?? {},
  } as T;
}

// WELLNESS_ADMIN_DIAGNOSTIC_CANONICAL_TRUTH_EXPORT_V126M119_49
// Pure helper for Admin diagnostic parity. No source/data reads are performed.
export function applyParticipantCanonicalHistoricalSuccessProof(
  streak: any,
  participantIdValue: any,
) {
  const participantId = String(Number(participantIdValue || 0) || "").trim();
  if (!participantId) return streak;

  const historical =
    AUGUST_HISTORICAL_STREAK_SUCCESS_DATES[participantId] ?? [];
  if (!historical.length) return streak;

  return applyDurableStreakSuccessProof(
    streak,
    new Set(historical.map(String)),
  );
}

async function loadParticipantCanonicalStreakBase(params: {
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
  const durableProofByDate = DURABLE_STREAK_POINT_PROOF[participantId] || {};
  const durableProofPointIds = Object.values(durableProofByDate).flatMap(
    (proof) => [...(proof?.nutrition || []), ...(proof?.workout || [])],
  );
  const historicalProofPointIds = [
    ...new Set([
      ...Object.values(historicalProofByDate).flat(),
      ...durableProofPointIds,
    ]),
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

  // V119.18: validate every durable success date again from exact live point IDs.
  // No row-number-only or description-only mapping is accepted.
  const validatedDurableProofDateRows: any[] = [];
  for (const [date, proof] of Object.entries(durableProofByDate)) {
    const exactNutritionRows = (proof?.nutrition || [])
      .map((pointId) => liveProofRowsById.get(numberValue(pointId)))
      .filter(
        (row: any) =>
          row &&
          historicalProofDate(row) === date &&
          isHistoricalNutritionInputPoint(row),
      );
    const exactWorkoutRows = (proof?.workout || [])
      .map((pointId) => liveProofRowsById.get(numberValue(pointId)))
      .filter(
        (row: any) =>
          row &&
          historicalProofDate(row) === date &&
          isDurableWorkoutReachedPoint(row),
      );

    const nutritionIds = new Set(
      exactNutritionRows.map((row: any) => numberValue(row?.id)).filter(Boolean),
    );
    const workoutIds = new Set(
      exactWorkoutRows.map((row: any) => numberValue(row?.id)).filter(Boolean),
    );
    if (nutritionIds.size < 3 || workoutIds.size < 1) continue;

    validatedDurableProofDateRows.push({
      log_date: date,
      source_type: "durable_streak_success_point_proof",
    });
  }

  const operationalDurableProofDateRows = filterOperationalRowsForProgram(
    params.participant,
    validatedDurableProofDateRows,
    "",
    "",
    ["log_date"],
  );
  const durableProofDatesApplied = new Set(
    operationalDurableProofDateRows
      .map((row: any) => historicalProofDate(row))
      .filter(Boolean),
  );

  // Supplement Nutrition count only when canonical + V119.7 proof still has <3.
  // Zero-calorie synthetic rows exist only inside streak computation.
  const existingStreakNutritionCounts = nutritionCountByDate(streakNutritionRows);
  const durableNutritionProofRows: any[] = [];
  for (const date of durableProofDatesApplied) {
    const currentCount = existingStreakNutritionCounts.get(date) || 0;
    const missingCount = Math.max(0, 3 - currentCount);
    for (let index = 0; index < missingCount; index += 1) {
      durableNutritionProofRows.push({
        log_date: date,
        total_calories: 0,
        calories: 0,
        source_type: "durable_streak_nutrition_point_proof",
        point_key: `durable_streak_nutrition_point_proof_${index + 1}`,
      });
    }
  }

  const operationalDurableNutritionProofRows = filterOperationalRowsForProgram(
    params.participant,
    durableNutritionProofRows,
    "",
    "",
    ["log_date"],
  );
  const finalStreakNutritionRows = [
    ...streakNutritionRows,
    ...operationalDurableNutritionProofRows,
  ];

  const nutritionTarget = numberValue(targets?.current?.nutrition);
  const workoutTarget = numberValue(targets?.current?.workout) || 300;
  const baseStreak = buildWellnessStreakSummary({
    nutritionRows: finalStreakNutritionRows,
    activityRows,
    workoutTargetCalories: workoutTarget,
    targetTimeline: targets,
  });
  const streak = applyDurableStreakSuccessProof(
    baseStreak,
    durableProofDatesApplied,
  );

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
      durable_streak_proof_dates: durableProofDatesApplied.size,
      durable_streak_nutrition_rows:
        operationalDurableNutritionProofRows.length,
      activity_ok: !activityResult?.error,
      activity_rows: activityRows.length,
      fitness_source: clean(control?.fitness_source || "none"),
    },
    status: warnings.length > 0 ? "partial" : "ok",
    warnings,
  };
}
export async function loadParticipantCanonicalStreak(
  ...args: Parameters<typeof loadParticipantCanonicalStreakBase>
): Promise<Awaited<ReturnType<typeof loadParticipantCanonicalStreakBase>>> {
  const result = await loadParticipantCanonicalStreakBase(...args);
  return applyAugustHistoricalTruthUnion(result, args) as Awaited<ReturnType<typeof loadParticipantCanonicalStreakBase>>;
}


import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { isoDateSchema } from '../../shared/schema/date.js';
import { locationInput } from '../../shared/schema/location.js';

export const getReadingExplanationInputSchema = z.object({
  ...locationInput.shape,
  date: isoDateSchema.optional(),
  // Tool-local addition, same pattern as get_station_baseline's station_id param — not part of
  // locationInput itself, since that shape is shared with every other place/bbox-only tool.
  station_id: z.string().min(1).optional(),
});

export type GetReadingExplanationInput = z.infer<typeof getReadingExplanationInputSchema>;

export interface ScientificContextStation {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

export interface ScientificContextDayAverage {
  readonly date: string;
  readonly value: number;
  readonly category: string;
}

export interface ScientificContextWindDay {
  readonly date: string;
  readonly directionLabel: string;
  readonly speedKmh: number;
}

export interface ScientificContextWeatherDay {
  readonly date: string;
  readonly precipitationMm: number;
  readonly humidity: number | null;
  readonly highHumidityWarning: boolean;
}

export interface ScientificContextWeather {
  readonly days: readonly ScientificContextWeatherDay[];
  readonly totalPrecipitationMm: number;
  readonly trajectoryPrecipitationMm: number;
  readonly availableDayCount: number;
}

// Matches `FixtureUpwindSource` (fahsai's packages/backend/src/scripts/eval/types.ts, fetched
// 2026-08-07) — shared by persistentWind.sourcesBeyondWindow and upwindSources.tier1/tier2.
// `type` is a closed 5-value enum at the source (city/coal_plant/gas_plant/oil_plant/industrial)
// but kept loose here, same reasoning as explainCase below: an externally-owned taxonomy that
// could grow without this package being updated in lockstep, and a strict enum would turn that
// into a hard schema-validation failure instead of just an under-typed field. `population` is
// for `type: 'city'` entries, `capacityMw` for power-plant entries — both optional since only one
// applies per entry (unconfirmed live; not yet observed populated).
export interface ScientificContextUpwindSource {
  readonly name: string;
  readonly country: string;
  readonly distanceKm: number;
  readonly type: string;
  readonly population?: number;
  readonly capacityMw?: number;
  readonly currentlyUpwind: boolean;
}

export interface ScientificContextPersistentWind {
  readonly label: string;
  readonly dayCount: number;
  readonly sourcesBeyondWindow: readonly ScientificContextUpwindSource[];
}

export interface ScientificContextTrajectoryOrigin {
  readonly lat: number;
  readonly lng: number;
  readonly region: string;
  readonly date: string;
}

export interface ScientificContextTrajectoryWaypoint {
  readonly lat: number;
  readonly lng: number;
  readonly region: string;
}

export interface ScientificContextTrajectory {
  readonly hoursTraced: number;
  readonly origin: ScientificContextTrajectoryOrigin;
  readonly corridorWidthKm: number;
  readonly meanWindSpeedKmh: number;
  readonly waypoints: readonly ScientificContextTrajectoryWaypoint[];
  readonly originIsWater: boolean;
}

export interface ScientificContextCamsSample {
  readonly lat: number;
  readonly lng: number;
  readonly date: string;
  readonly pm25: number;
  readonly category: string;
}

export interface ScientificContextCams {
  readonly samples: readonly ScientificContextCamsSample[];
  readonly maxPm25: number | null;
  readonly suppressionActive: boolean;
  readonly stationExceedsCamsMax: boolean;
}

export interface ScientificContextFireRecencyBucket {
  readonly count: number;
  readonly totalFrpMw: number;
}

export interface ScientificContextFire {
  readonly pathScore: number;
  readonly pathFireCount: number;
  readonly recency: {
    readonly last24h: ScientificContextFireRecencyBucket;
    readonly last48h: ScientificContextFireRecencyBucket;
    readonly last72h: ScientificContextFireRecencyBucket;
  } | null;
  readonly nearestFireDistKm: number | null;
  readonly areaScore: number;
  readonly areaFireCount: number | null;
  readonly areaTotalFrpMw: number | null;
  readonly firesAreLocal: boolean;
  readonly areaFireRadiusKm: number;
}

// null for OUTLIER_HIGH/OUTLIER_LOW — verified live 2026-08-07 (station 3597974) and confirmed
// against source (`!isStrongOutlier` gate in buildScientificContext.ts).
export interface ScientificContextTransport {
  readonly trajectory: ScientificContextTrajectory;
  readonly cams: ScientificContextCams;
  readonly fire: ScientificContextFire;
}

// tier1 confirmed live 2026-08-07 (station 225569) to share ScientificContextUpwindSource's
// shape; tier2 assumed the same by source (`computeSourceTiers` in buildScientificContext.ts
// pushes the same `TierSource` shape onto both arrays) — still empty in every live sample so far.
export interface ScientificContextUpwindSources {
  readonly tier1: readonly ScientificContextUpwindSource[];
  readonly tier2: readonly ScientificContextUpwindSource[];
}

export interface ScientificContextAreaFirePressure {
  readonly score: number;
  readonly fireCount: number | null;
  readonly totalFrpMw: number | null;
}

export interface ScientificContextTrend {
  readonly direction: string;
  readonly isSignificant: boolean;
}

export interface ScientificContextPeerStation {
  readonly name: string;
  readonly value: number;
  readonly distanceKm: number;
}

export interface ScientificContextPeers {
  readonly stationCount: number;
  readonly weightedMean: number;
  readonly unweightedMedian: number;
  readonly range: { readonly min: number; readonly max: number } | null;
  // A human-readable category breakdown, e.g. "17 Moderate, 1 Unhealthy for sensitive groups" —
  // verified live 2026-08-07 (station 225569). Null in every other sample observed.
  readonly distribution: string | null;
  readonly stations: readonly ScientificContextPeerStation[];
}

// `Exclude<BaselineCategory, 'normal'>` (fahsai's packages/types/src/baseline.ts, fetched
// 2026-08-07) — a fixed, IQR-derived statistical classification (`classifyReading`), not a
// growing case taxonomy, so unlike explainCase/upwindSource.type this is safe to enum strictly.
export const stationBaselineCategorySchema = z.enum(['wellAbove', 'above', 'below', 'wellBelow']);
export type StationBaselineCategory = z.infer<typeof stationBaselineCategorySchema>;

export interface ScientificContextStationBaseline {
  readonly category: StationBaselineCategory;
  readonly typicalLow: number;
  readonly typicalHigh: number;
  readonly periodLabel: string;
}

// `type: 'LOW'` has no `peerTier` at the source (packages/backend/src/lib/buildScientificContext.ts)
// — only `type: 'HIGH'` carries one, since peerTier only makes sense relative to how far above
// peers the reading sits.
export interface ScientificContextOutlierHigh {
  readonly type: 'HIGH';
  readonly ratio: number;
  readonly peerTier: 1 | 2 | 3;
}

export interface ScientificContextOutlierLow {
  readonly type: 'LOW';
  readonly ratio: number;
}

export type ScientificContextOutlier = ScientificContextOutlierHigh | ScientificContextOutlierLow;

// Mirrors `fahsai`'s ScientificContext 1:1 — cross-checked 2026-08-07 (JOO-47) both live against
// GET /api/explain/context (stations 5554536, 2843771, 3597974, 3524548, 225569) and directly
// against source (github.com/JoostKiens/fahsai, packages/backend/src/lib/buildScientificContext.ts).
// Nullability below matches buildScientificContext's return statement exactly: persistentWind,
// transport, areaFirePressure, trend, peers, outlier, and stationBaseline are the only top-level
// fields that can be null — everything else is always present on a successful response.
export interface ScientificContext {
  readonly station: ScientificContextStation;
  readonly currentPm25: number;
  readonly aqiCategory: string;
  // `ExplainCase` (packages/backend/src/routes/explain.ts): OUTLIER_HIGH | OUTLIER_LOW |
  // PLAUSIBLE_FIRE_TRANSPORT | PLAUSIBLE_URBAN_INDUSTRIAL | PLAUSIBLE_CLEAN |
  // PLAUSIBLE_REGIONAL_BACKGROUND | PLAUSIBLE_UNCLEAR. Kept as a loose string rather than a
  // strict enum — an externally-owned, separately-versioned value; a strict enum would make the
  // schema reject a real future response the moment fahsai adds an 8th case.
  readonly explainCase: string;
  readonly date: string;
  readonly sevenDayAverages: readonly ScientificContextDayAverage[];
  readonly wind: { readonly days: readonly ScientificContextWindDay[] };
  readonly weatherContext: ScientificContextWeather;
  readonly persistentWind: ScientificContextPersistentWind | null;
  readonly transport: ScientificContextTransport | null;
  readonly upwindSources: ScientificContextUpwindSources;
  readonly areaFirePressure: ScientificContextAreaFirePressure | null;
  readonly trend: ScientificContextTrend | null;
  readonly peers: ScientificContextPeers | null;
  readonly outlier: ScientificContextOutlier | null;
  readonly seasonContext: string;
  readonly stationBaseline: ScientificContextStationBaseline | null;
}

// Shared by persistentWind.sourcesBeyondWindow and upwindSources.tier1/tier2.
const upwindSourceSchema = z.object({
  name: z.string(),
  country: z.string(),
  distanceKm: z.number(),
  type: z.string(),
  population: z.number().optional(),
  capacityMw: z.number().optional(),
  currentlyUpwind: z.boolean(),
});

const fireRecencyBucketSchema = z.object({ count: z.number(), totalFrpMw: z.number() });

// All top-level fields optional: present together on success, absent (with `note` explaining
// why) on the no-nearby-station / no-reading-that-day paths — same convention as
// get_station_baseline, since most ScientificContext fields have no natural empty value to fall
// back to. Nullability of individual fields (once present) mirrors buildScientificContext.ts
// exactly — see the ScientificContext interface above for the source cross-check.
export const readingExplanationOutputSchema = z.object({
  station: z.object({ name: z.string(), lat: z.number(), lng: z.number() }).optional(),
  currentPm25: z.number().optional(),
  aqiCategory: z.string().optional(),
  explainCase: z.string().optional(),
  date: z.string().optional(),
  sevenDayAverages: z
    .array(z.object({ date: z.string(), value: z.number(), category: z.string() }))
    .optional(),
  wind: z
    .object({
      days: z.array(
        z.object({ date: z.string(), directionLabel: z.string(), speedKmh: z.number() }),
      ),
    })
    .optional(),
  weatherContext: z
    .object({
      days: z.array(
        z.object({
          date: z.string(),
          precipitationMm: z.number(),
          humidity: z.number().nullable(),
          highHumidityWarning: z.boolean(),
        }),
      ),
      totalPrecipitationMm: z.number(),
      trajectoryPrecipitationMm: z.number(),
      availableDayCount: z.number(),
    })
    .optional(),
  persistentWind: z
    .object({
      label: z.string(),
      dayCount: z.number(),
      sourcesBeyondWindow: z.array(upwindSourceSchema),
    })
    .nullable()
    .optional(),
  transport: z
    .object({
      trajectory: z.object({
        hoursTraced: z.number(),
        origin: z.object({
          lat: z.number(),
          lng: z.number(),
          region: z.string(),
          date: z.string(),
        }),
        corridorWidthKm: z.number(),
        meanWindSpeedKmh: z.number(),
        waypoints: z.array(z.object({ lat: z.number(), lng: z.number(), region: z.string() })),
        originIsWater: z.boolean(),
      }),
      cams: z.object({
        samples: z.array(
          z.object({
            lat: z.number(),
            lng: z.number(),
            date: z.string(),
            pm25: z.number(),
            category: z.string(),
          }),
        ),
        maxPm25: z.number().nullable(),
        suppressionActive: z.boolean(),
        stationExceedsCamsMax: z.boolean(),
      }),
      fire: z.object({
        pathScore: z.number(),
        pathFireCount: z.number(),
        recency: z
          .object({
            last24h: fireRecencyBucketSchema,
            last48h: fireRecencyBucketSchema,
            last72h: fireRecencyBucketSchema,
          })
          .nullable(),
        nearestFireDistKm: z.number().nullable(),
        areaScore: z.number(),
        areaFireCount: z.number().nullable(),
        areaTotalFrpMw: z.number().nullable(),
        firesAreLocal: z.boolean(),
        areaFireRadiusKm: z.number(),
      }),
    })
    .nullable()
    .optional(),
  upwindSources: z
    .object({
      tier1: z.array(upwindSourceSchema),
      tier2: z.array(upwindSourceSchema),
    })
    .optional(),
  areaFirePressure: z
    .object({
      score: z.number(),
      fireCount: z.number().nullable(),
      totalFrpMw: z.number().nullable(),
    })
    .nullable()
    .optional(),
  trend: z.object({ direction: z.string(), isSignificant: z.boolean() }).nullable().optional(),
  peers: z
    .object({
      stationCount: z.number(),
      weightedMean: z.number(),
      unweightedMedian: z.number(),
      range: z.object({ min: z.number(), max: z.number() }).nullable(),
      distribution: z.string().nullable(),
      stations: z.array(z.object({ name: z.string(), value: z.number(), distanceKm: z.number() })),
    })
    .nullable()
    .optional(),
  outlier: z
    .union([
      z.object({
        type: z.literal('HIGH'),
        ratio: z.number(),
        peerTier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      }),
      z.object({ type: z.literal('LOW'), ratio: z.number() }),
    ])
    .nullable()
    .optional(),
  seasonContext: z.string().optional(),
  stationBaseline: z
    .object({
      category: stationBaselineCategorySchema,
      typicalLow: z.number(),
      typicalHigh: z.number(),
      periodLabel: z.string(),
    })
    .nullable()
    .optional(),
  note: z.string().optional(),
});

export type ReadingExplanationToolResult = CallToolResult;

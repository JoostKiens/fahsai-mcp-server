import type { ScientificContext } from './schema.js';

// Grounded in a real GET /api/explain/context response — station 5554536 (Chalermprakiat Rama IX
// Park), 2026-08-05, verified live 2026-08-07 (JOO-47). Trimmed to one entry per array for
// readability; the full arrays' shapes are exercised by the live test instead.
export function fakeScientificContext(overrides: Partial<ScientificContext> = {}): ScientificContext {
  return {
    station: { name: 'Chalermprakiat Rama IX Park', lat: 15.173475, lng: 100.132105 },
    currentPm25: 21.3,
    aqiCategory: 'Moderate',
    explainCase: 'PLAUSIBLE_CLEAN',
    date: '2026-08-05',
    sevenDayAverages: [{ date: '2026-08-05', value: 21.3, category: 'Moderate' }],
    wind: { days: [{ date: '2026-08-05', directionLabel: 'WSW', speedKmh: 13.8 }] },
    weatherContext: {
      days: [{ date: '2026-08-05', precipitationMm: 5, humidity: 44, highHumidityWarning: false }],
      totalPrecipitationMm: 32.8,
      trajectoryPrecipitationMm: 58,
      availableDayCount: 5,
    },
    persistentWind: { label: 'WSW', dayCount: 5, sourcesBeyondWindow: [] },
    transport: {
      trajectory: {
        hoursTraced: 66,
        origin: { lat: 10.262774546047254, lng: 96.84235861830243, region: 'Andaman Sea', date: '2026-08-03' },
        corridorWidthKm: 185.37925636007785,
        meanWindSpeedKmh: 15.44827136333982,
        waypoints: [{ lat: 15.173475, lng: 100.132105, region: 'Thailand' }],
        originIsWater: true,
      },
      cams: {
        samples: [{ lat: 14.495014483921112, lng: 98.03535608399437, date: '2026-08-05', pm25: 2.6, category: 'Good' }],
        maxPm25: 12.9,
        suppressionActive: false,
        stationExceedsCamsMax: false,
      },
      fire: {
        pathScore: 4,
        pathFireCount: 18,
        recency: {
          last24h: { count: 3, totalFrpMw: 42.63 },
          last48h: { count: 0, totalFrpMw: 0 },
          last72h: { count: 15, totalFrpMw: 78.31 },
        },
        nearestFireDistKm: 11.444771287872179,
        areaScore: 0.15,
        areaFireCount: 11,
        areaTotalFrpMw: 55.84,
        firesAreLocal: false,
        areaFireRadiusKm: 75,
      },
    },
    upwindSources: { tier1: [], tier2: [] },
    areaFirePressure: { score: 0.15, fireCount: 11, totalFrpMw: 55.84 },
    trend: { direction: 'rising', isSignificant: true },
    peers: {
      stationCount: 9,
      weightedMean: 13.418710887474557,
      unweightedMedian: 8.8,
      range: { min: 4.86, max: 14.5 },
      distribution: null,
      stations: [{ name: 'โรงเรียนราชประชานุเคราะห์ 46', value: 14.5, distanceKm: 1.5009898874061505 }],
    },
    outlier: null,
    seasonContext:
      'Monsoon season in mainland Southeast Asia (May–Sep). Fire activity is low; elevated PM2.5 is more likely from urban/industrial sources or stagnant air pockets.',
    stationBaseline: null,
    ...overrides,
  };
}

// Real OUTLIER_HIGH response — station 3597974, 2026-06-05, verified live 2026-08-07: transport
// is null, outlier is populated with the HIGH/peerTier shape, persistentWind.sourcesBeyondWindow
// carries real upwind power-plant sources.
export function fakeOutlierHighScientificContext(
  overrides: Partial<ScientificContext> = {},
): ScientificContext {
  return fakeScientificContext({
    currentPm25: 40.6,
    aqiCategory: 'Unhealthy for sensitive groups',
    explainCase: 'OUTLIER_HIGH',
    date: '2026-06-05',
    persistentWind: {
      label: 'WSW',
      dayCount: 5,
      sourcesBeyondWindow: [
        {
          name: 'Hongsa',
          country: 'LA',
          distanceKm: 224.26806360353322,
          type: 'coal_plant',
          capacityMw: 1878,
          currentlyUpwind: true,
        },
      ],
    },
    transport: null,
    outlier: { type: 'HIGH', ratio: 5.445463385958721, peerTier: 1 },
    stationBaseline: null,
    ...overrides,
  });
}

// Adapted (not live-captured) from fahsai's golden eval fixture
// packages/backend/src/scripts/eval/fixtures/02-plausible-fire-transport-wiang-nuea-01-04-2026.ts
// ("the canonical cross-border fire transport case", per its own description), fetched 2026-08-13.
// Values below are hand-run through buildScientificContext.ts's transform (compassFromDeg,
// computeSourceTiers, pm25Cat, computeTrend) against that fixture's raw input — see JOO-48.
export function fakeFireTransportScientificContext(
  overrides: Partial<ScientificContext> = {},
): ScientificContext {
  return {
    station: { name: 'Wiang Nuea: Mon Far Pai Cottages', lat: 19.37, lng: 98.45 },
    currentPm25: 286.0,
    aqiCategory: 'Hazardous',
    explainCase: 'PLAUSIBLE_FIRE_TRANSPORT',
    date: '2026-04-01',
    sevenDayAverages: [{ date: '2026-04-01', value: 286.0, category: 'Hazardous' }],
    wind: { days: [{ date: '2026-04-01', directionLabel: 'WSW', speedKmh: 7.1 }] },
    weatherContext: {
      days: [{ date: '2026-04-01', precipitationMm: 0, humidity: 33, highHumidityWarning: false }],
      totalPrecipitationMm: 0,
      trajectoryPrecipitationMm: 0.7,
      availableDayCount: 5,
    },
    persistentWind: {
      label: 'WSW',
      dayCount: 5,
      sourcesBeyondWindow: [
        {
          name: 'Yangon',
          country: 'MM',
          distanceKm: 366,
          type: 'city',
          population: 7_400_000,
          currentlyUpwind: true,
        },
      ],
    },
    transport: {
      trajectory: {
        hoursTraced: 66,
        origin: { lat: 17.6, lng: 95.13, region: 'Myanmar', date: '2026-03-30' },
        corridorWidthKm: 130,
        meanWindSpeedKmh: 10.9,
        waypoints: [{ lat: 19.4, lng: 98.4, region: 'Thailand' }],
        originIsWater: false,
      },
      cams: {
        samples: [{ lat: 18.7, lng: 97.3, date: '2026-04-01', pm25: 62.4, category: 'Unhealthy' }],
        maxPm25: 87.6,
        suppressionActive: false,
        stationExceedsCamsMax: true,
      },
      fire: {
        pathScore: 97,
        pathFireCount: 12334,
        recency: {
          last24h: { count: 6754, totalFrpMw: 45801 },
          last48h: { count: 3796, totalFrpMw: 49814 },
          last72h: { count: 1784, totalFrpMw: 3711 },
        },
        nearestFireDistKm: 1.0,
        areaScore: 100,
        areaFireCount: 614,
        areaTotalFrpMw: 1909,
        firesAreLocal: true,
        areaFireRadiusKm: 75,
      },
    },
    upwindSources: {
      tier1: [
        {
          name: 'Chiang Mai',
          country: 'TH',
          distanceKm: 86,
          type: 'city',
          population: 1_200_000,
          currentlyUpwind: true,
        },
      ],
      tier2: [],
    },
    areaFirePressure: { score: 100, fireCount: 614, totalFrpMw: 1909 },
    trend: { direction: 'stable', isSignificant: false },
    peers: {
      stationCount: 41,
      weightedMean: 306.5,
      unweightedMedian: 249.0,
      range: { min: 142.0, max: 440.0 },
      distribution: '1 Moderate, 2 Unhealthy, 18 Very unhealthy, 20 Hazardous',
      stations: [],
    },
    outlier: null,
    seasonContext:
      'Peak dry season and agricultural burning season in mainland Southeast Asia (Feb–Apr). Smoke can transport hundreds of kilometres under stable, low-wind conditions.',
    stationBaseline: null,
    ...overrides,
  };
}

// Adapted (not live-captured) from fahsai's golden eval fixture
// packages/backend/src/scripts/eval/fixtures/15-plausible-regional-background-lopburi-baseline-14-07-2026.ts,
// fetched 2026-08-13. `stationBaseline` derived via classifyReading(18.4, {p25:5, p75:9, n:140})
// from packages/types/src/baseline.ts: n=140 >= BASELINE_DISPLAY_GATE(30), iqr=4, 18.4 > p75+iqr(13)
// => 'wellAbove'; periodLabel from dateToPeriodKey(14) => 'periodMid' => 'mid-July'. Matches the
// golden fixture's own description ("well above ... mid-July baseline (typically 5-9 µg/m³)").
// See JOO-48. `fire.nearestFireDistKm` corrected in code review (JOO-49) to a non-null value
// consistent with `areaFireCount: 1` — every other fixture in this file pairs a positive
// areaFireCount with a real distance, and a null here would wrongly suggest that pairing is
// invalid; not independently re-verified against the golden fixture's raw input.
export function fakeStationBaselineScientificContext(
  overrides: Partial<ScientificContext> = {},
): ScientificContext {
  return {
    station: { name: 'Lopburi City Hall', lat: 14.799, lng: 100.654 },
    currentPm25: 18.4,
    aqiCategory: 'Moderate',
    explainCase: 'PLAUSIBLE_REGIONAL_BACKGROUND',
    date: '2026-07-14',
    sevenDayAverages: [{ date: '2026-07-14', value: 18.4, category: 'Moderate' }],
    wind: { days: [{ date: '2026-07-14', directionLabel: 'SSW', speedKmh: 8.4 }] },
    weatherContext: {
      days: [{ date: '2026-07-14', precipitationMm: 0.6, humidity: 78, highHumidityWarning: false }],
      totalPrecipitationMm: 11.4,
      trajectoryPrecipitationMm: 9.8,
      availableDayCount: 5,
    },
    persistentWind: null,
    transport: {
      trajectory: {
        hoursTraced: 66,
        origin: { lat: 18.9, lng: 102.6, region: 'Laos', date: '2026-07-12' },
        corridorWidthKm: 130,
        meanWindSpeedKmh: 9.5,
        waypoints: [{ lat: 14.8, lng: 100.65, region: 'Thailand' }],
        originIsWater: false,
      },
      cams: {
        samples: [{ lat: 16.5, lng: 101.5, date: '2026-07-14', pm25: 16.2, category: 'Moderate' }],
        maxPm25: 16.2,
        suppressionActive: false,
        stationExceedsCamsMax: false,
      },
      fire: {
        pathScore: 3,
        pathFireCount: 2,
        recency: {
          last24h: { count: 1, totalFrpMw: 4 },
          last48h: { count: 1, totalFrpMw: 3 },
          last72h: { count: 0, totalFrpMw: 0 },
        },
        nearestFireDistKm: 58.7,
        areaScore: 1,
        areaFireCount: 1,
        areaTotalFrpMw: 3,
        firesAreLocal: false,
        areaFireRadiusKm: 75,
      },
    },
    upwindSources: { tier1: [], tier2: [] },
    areaFirePressure: { score: 1, fireCount: 1, totalFrpMw: 3 },
    trend: { direction: 'stable', isSignificant: false },
    peers: {
      stationCount: 4,
      weightedMean: 17.6,
      unweightedMedian: 17.55,
      range: { min: 14.0, max: 21.3 },
      distribution: null,
      stations: [{ name: 'Ban Mi District Office', value: 21.3, distanceKm: 22 }],
    },
    outlier: null,
    seasonContext:
      'Monsoon season in mainland Southeast Asia (May–Sep). Fire activity is low; elevated PM2.5 is more likely from urban/industrial sources or stagnant air pockets.',
    stationBaseline: { category: 'wellAbove', typicalLow: 5, typicalHigh: 9, periodLabel: 'mid-July' },
    ...overrides,
  };
}

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

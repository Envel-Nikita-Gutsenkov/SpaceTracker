// Artificial satellites orbiting bodies other than Earth (Mars, Jupiter, Venus, Mercury).
//
// Orbital data (periapsis/apoapsis altitudes above the surface, period, inclination,
// eccentricity) are the real published mission values — NASA/JPL, ESA, JAXA, CNSA and
// MBRSC mission fact sheets / Wikipedia infoboxes. `raanDeg` and `phaseOffset` are
// *illustrative* spread values only: they keep the distinct orbiters on visibly
// different planes and phases so they never overlap into one indistinguishable ring.
//
// Each object is a synthetic (string id) fleet member, rendered by PlanetFleet.js in
// the parent planet's local frame, exactly like the Moon's own orbiter fleet.
//
// CONVENTIONS (enforced by tests/verify_planetary_fleet.js):
//   * `periapsisKm` and `apoapsisKm` are BOTH altitudes above the parent body's mean
//     radius (km) — never a distance from the planet centre, and never mixed.
//   * `periodMin` is the orbital period in minutes.
//   * (periapsis, apoapsis, period) must satisfy Kepler's third law with the parent's
//     standard gravitational parameter μ = G·M — otherwise the orbiter would visibly
//     drift off its own orbit trace. When a mission changes orbit, update all three.

export const PLANETARY_ORBITERS = [
  // ─────────────────────────── MARS ───────────────────────────
  {
    id: 'mars-odyssey',
    name: '2001 Mars Odyssey',
    intlDesignator: '2001-013A',
    noradId: 26855,
    agency: 'NASA / JPL',
    country: 'US',
    launchDate: '2001-04-07',
    objectType: 'PAYLOAD',
    parentPlanetId: 'mars',
    isPlanetary: true,
    category: 'science',
    periapsisKm: 400,
    apoapsisKm: 400,
    periodMin: 118,
    incDeg: 93.064,
    raanDeg: 30.0,
    phaseOffset: 0.10,
    color: 0xf59e0b,
    desc: "The longest-serving Mars orbiter: maps the planet's minerals and subsurface ice and relays most rover data back to Earth.",
    descRu: 'Самый долгоживущий аппарат на орбите Марса: картографирует минералы и подповерхностный лёд, а также ретранслирует данные марсоходов на Землю.',
    wikiUrl: 'https://science.nasa.gov/mission/odyssey/',
    keywords: 'odyssey mars 2001 mars odyssey nasa orbiter mars orbital одessей марс',
  },
  {
    id: 'mars-express',
    name: 'Mars Express',
    intlDesignator: '2003-022A',
    noradId: 27816,
    agency: 'ESA',
    country: 'EU',
    launchDate: '2003-06-02',
    objectType: 'PAYLOAD',
    parentPlanetId: 'mars',
    isPlanetary: true,
    category: 'science',
    periapsisKm: 298,
    apoapsisKm: 10107,
    periodMin: 402, // ~6.7 h (Kepler with a & mu(Mars)); source "6.7 h" ≈ 402 min
    incDeg: 86.3,
    raanDeg: 120.0,
    phaseOffset: 0.42,
    color: 0x38bdf8,
    desc: "Europe's first Mars mission: radar-sounded the subsurface, detected methane, and delivered the Beagle 2 lander.",
    descRu: 'Первая европейская миссия к Марсу: радиолокационное зондирование недр, обнаружение метана и доставка спускаемого аппарата Beagle 2.',
    wikiUrl: 'https://exploration.esa.int/mars',
    keywords: 'mars express esa mars orbiter express марс экспресс европейское агентство',
  },
  {
    id: 'mro',
    name: 'Mars Reconnaissance Orbiter',
    intlDesignator: '2005-031A',
    noradId: 29601,
    agency: 'NASA / JPL',
    country: 'US',
    launchDate: '2005-08-12',
    objectType: 'PAYLOAD',
    parentPlanetId: 'mars',
    isPlanetary: true,
    category: 'science',
    periapsisKm: 255,
    apoapsisKm: 316,
    periodMin: 112,
    incDeg: 93.0,
    raanDeg: 210.0,
    phaseOffset: 0.66,
    color: 0xa855f7,
    desc: 'Carries the most powerful camera ever sent to another planet (HiRISE) and a ground-penetrating radar (SHARAD).',
    descRu: 'Несёт самую мощную камеру, когда-либо отправленную к другой планете (HiRISE), и радар подповерхностного зондирования (SHARAD).',
    wikiUrl: 'https://mars.nasa.gov/mro/',
    keywords: 'mro mars reconnaissance orbiter hirise nasa mars orbital мро марс',
  },
  {
    id: 'maven',
    name: 'MAVEN',
    intlDesignator: '2013-063A',
    noradId: 40144,
    agency: 'NASA',
    country: 'US',
    launchDate: '2013-11-18',
    objectType: 'PAYLOAD',
    parentPlanetId: 'mars',
    isPlanetary: true,
    category: 'science',
    periapsisKm: 180,
    apoapsisKm: 4500,
    periodMin: 216,
    incDeg: 75.0,
    raanDeg: 300.0,
    phaseOffset: 0.24,
    color: 0x22c55e,
    desc: "Measures how Mars lost its atmosphere to space. Contact was lost in Dec 2025 after over a decade of operation.",
    descRu: 'Изучает потерю атмосферы Марса в космосе. Связь была потеряна в декабре 2025 года после более чем десяти лет работы.',
    wikiUrl: 'https://science.nasa.gov/mission/maven/',
    keywords: 'maven mars atmosphere volatile evolution nasa mars orbital мавен марс',
  },
  {
    id: 'tgo',
    name: 'ExoMars Trace Gas Orbiter',
    intlDesignator: '2016-017A',
    noradId: 41388,
    agency: 'ESA / Roscosmos',
    country: 'EU',
    launchDate: '2016-03-14',
    objectType: 'PAYLOAD',
    parentPlanetId: 'mars',
    isPlanetary: true,
    category: 'science',
    periapsisKm: 400,
    apoapsisKm: 400,
    periodMin: 120,
    incDeg: 74.0,
    raanDeg: 60.0,
    phaseOffset: 0.80,
    color: 0xec4899,
    desc: 'ExoMars/TGO is sniffing the Martian atmosphere for trace gases such as methane and acts as a relay for surface rovers.',
    descRu: 'Аппарат ExoMars/TGO исследует следовые газы атмосферы Марса (например, метан) и служит ретранслятором для марсоходов.',
    wikiUrl: 'https://exploration.esa.int/mars',
    keywords: 'exomars tgo trace gas orbiter esa roscosmos mars экомарс марс',
  },
  {
    id: 'emm-hope',
    name: 'Emirates Mars Mission (Hope)',
    intlDesignator: '2020-047A',
    agency: 'MBRSC (UAE)',
    country: 'AE',
    launchDate: '2020-07-19',
    objectType: 'PAYLOAD',
    parentPlanetId: 'mars',
    isPlanetary: true,
    category: 'science',
    periapsisKm: 20000,
    apoapsisKm: 43000,
    periodMin: 3300, // ~55 h
    incDeg: 25.0,
    raanDeg: 150.0,
    phaseOffset: 0.50,
    color: 0x14b8a6,
    desc: "The Arab world's first interplanetary mission: a wide-ellipse orbiter studying the daily and seasonal weather of the whole planet.",
    descRu: 'Первая межпланетная миссия арабского мира: аппарат на широкой эллиптической орбите изучает суточную и сезонную погоду всей планеты.',
    wikiUrl: 'https://www.mbrsc.ae/',
    keywords: 'hope emirates mars mission emm mbrsc uae mars надежда эмираты марс',
  },
  {
    id: 'tianwen-1',
    name: 'Tianwen-1 Orbiter',
    intlDesignator: '2020-049A',
    agency: 'CNSA',
    country: 'CN',
    launchDate: '2020-07-23',
    objectType: 'PAYLOAD',
    parentPlanetId: 'mars',
    isPlanetary: true,
    category: 'science',
    periapsisKm: 275,
    apoapsisKm: 10749,
    periodMin: 424.8, // ~7.08 h
    incDeg: 86.3,
    raanDeg: 240.0,
    phaseOffset: 0.92,
    color: 0xef4444,
    desc: "China's first Mars orbiter, which mapped the planet and relayed data from the Zhurong rover.",
    descRu: 'Первый китайский орбитальный аппарат у Марса: картографировал планету и ретранслировал данные марсохода «Чжужун».',
    wikiUrl: 'https://en.wikipedia.org/wiki/Tianwen-1',
    keywords: 'tianwen tianwen-1 cnsa china mars zhurong марс тяньвэнь',
  },

  // ─────────────────────────── JUPITER ───────────────────────────
  {
    id: 'juno',
    name: 'Juno',
    intlDesignator: '2011-040A',
    noradId: 37773,
    agency: 'NASA / JPL',
    country: 'US',
    launchDate: '2011-08-05',
    objectType: 'PAYLOAD',
    parentPlanetId: 'jupiter',
    isPlanetary: true,
    category: 'science',
    periapsisKm: 4200, // perijove altitude above the cloud tops (NASA)
    // Apjove altitude for the CURRENT orbit. Juno's polar orbit was shortened from the
    // original 53.5-day capture orbit (perijove 4,200 km, apojove 8.1e6 km from centre)
    // to 43 -> 38 -> 33 days via the 2021-2024 Ganymede/Europa/Io flybys. This value is
    // derived from the verified 4,200 km perijove + 33-day period with Jupiter's μ
    // (Kepler's third law), giving ~5.86e6 km from the planet centre.
    apoapsisKm: 5787660, // apojove altitude above the cloud tops
    periodMin: 47520, // 33 days (current polar science orbit, since Feb 2024)
    incDeg: 90.0,
    raanDeg: 20.0,
    phaseOffset: 0.35,
    color: 0xfacc15,
    desc: "A solar-powered polar orbiter measuring Jupiter's gravity, magnetic field, deep atmosphere and auroras.",
    descRu: 'Солнечный полярный орбитальный аппарат, измеряющий гравитацию, магнитное поле, глубокую атмосферу и полярные сияния Юпитера.',
    wikiUrl: 'https://science.nasa.gov/mission/juno/',
    keywords: 'juno jupiter polar orbiter nasa juno юнона юпитер',
  },

  // ─────────────────────────── VENUS ───────────────────────────
  {
    id: 'akatsuki',
    name: 'Akatsuki (PLANET-C)',
    intlDesignator: '2010-020D',
    agency: 'JAXA',
    country: 'JP',
    launchDate: '2010-05-20',
    objectType: 'PAYLOAD',
    parentPlanetId: 'venus',
    isPlanetary: true,
    category: 'science',
    periapsisKm: 1000, // periapsis varies ~1000–10000 km over the mission
    apoapsisKm: 370000,
    periodMin: 15552, // ~10.8 days
    incDeg: 3.0,
    raanDeg: 0.0,
    phaseOffset: 0.60,
    color: 0xfb923c,
    desc: "Japan's Venus climate orbiter: a highly elliptical orbit studying the planet's super-rotating atmosphere and sulphuric-acid clouds.",
    descRu: 'Японский климатический орбитальный аппарат у Венеры: высокоэллиптическая орбита для изучения сверхвращения атмосферы и облаков серной кислоты.',
    wikiUrl: 'https://global.jaxa.jp/projects/sas/planet_c/',
    keywords: 'akatsuki planet-c jaxa venus climate orbiter акацуки венера',
  },

  // ─────────────────────────── MERCURY ───────────────────────────
  {
    id: 'bepicolombo',
    name: 'BepiColombo (MPO)',
    intlDesignator: '2018-080A',
    agency: 'ESA / JAXA',
    country: 'EU',
    launchDate: '2018-10-20',
    objectType: 'PAYLOAD',
    parentPlanetId: 'mercury',
    isPlanetary: true,
    isPlanned: true, // orbit insertion is planned for late 2026 — orbit shown is the planned MPO orbit
    category: 'science',
    periapsisKm: 480,
    apoapsisKm: 1500,
    periodMin: 140, // ~2.3 h planned MPO orbit
    incDeg: 90.0,
    raanDeg: 45.0,
    phaseOffset: 0.20,
    color: 0x94a3b8,
    desc: 'A joint ESA/JAXA mission to Mercury. Orbit insertion is planned for late 2026; the shown orbit is the planned MPO science orbit.',
    descRu: 'Совместная миссия ESA/JAXA к Меркурию. Выход на орбиту запланирован на конец 2026 года; показана планируемая научная орбита MPO.',
    wikiUrl: 'https://www.science.esa.int/bepicolombo',
    keywords: 'bepi colombo bepicolombo esa jaxa mercury mpo bepi-colombo меркурий',
  },
];

// Fast lookup + grouping helpers used by the renderer and the UI.
export const PLANETARY_ORBITERS_BY_PARENT = PLANETARY_ORBITERS.reduce((acc, sat) => {
  (acc[sat.parentPlanetId] ||= []).push(sat);
  return acc;
}, {});

export const PLANETARY_ORBITER_COUNTS = Object.fromEntries(
  Object.entries(PLANETARY_ORBITERS_BY_PARENT).map(([k, v]) => [k, v.length]),
);

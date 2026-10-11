// Verified data for the dwarf planets of the Solar System.
//
// Orbital elements are OSCULATING heliocentric elements referred to the J2000 ecliptic,
// as published by the NASA/JPL Small-Body Database (SBDB):
//   https://ssd-api.jpl.nasa.gov/sbdb.api  (per-object API URL, plus the SBDB epoch)
// Physical parameters (radius, mass, rotation, axial tilt): NASA Science solar-system
// pages, IAU, and the cited references below. Every entry records its source.
//
// `elements` field meanings (consumed by src/utils/conicPropagation.js):
//   e           eccentricity
//   aAU         semi-major axis, AU
//   iDeg        inclination to the J2000 ecliptic, deg
//   nodeDeg     longitude of the ascending node (Omega), deg
//   argPeriDeg  argument of perihelion (omega), deg
//   Tp          Julian Date (TDB) of perihelion passage
//   nDegPerDay  mean motion, deg/day
//   epochJD     SBDB epoch (Julian Date, TDB)
//
// All nine SBDB solutions below use epoch JD 2461200.5 (TDB), frame J2000, equinox J2000.

export const DWARF_PLANETS = {
  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=ceres&phys-par=1&full-prec=1
  // Physical: NASA Science (science.nasa.gov/dwarf-planets/ceres); mean radius = 939.4 km
  // diameter / 2; mass, rotation and 4 deg axial tilt from the Dawn mission
  // (Park et al. 2016, Nature 537, 515).
  ceres: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 469.7,
    massKg: 9.3839e20,
    rotPeriodHours: 9.074,
    axialTiltDeg: 4.0,
    colorHex: 0x9c9c94,
    orbitColor: '#a8a29e',
    glowColor: '#d6d3d1',
    hasRings: false,
    atmosphere: false,
    nameEn: 'Ceres',
    nameRu: 'Церера',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'The largest object in the asteroid belt and the only dwarf planet in the inner Solar System; a water-ice-rich world with bright carbonate salt deposits.',
    descRu: 'Крупнейшее тело пояса астероидов и единственная карликовая планета во внутренней Солнечной системе; богата водяным льдом и яркими солевыми отложениями.',
    elements: { e: 0.07969229514816586, aAU: 2.765552595034094, iDeg: 10.58802780183462, nodeDeg: 80.24862682043221, argPeriDeg: 73.29421453021587, Tp: 2461599.841466614066, nDegPerDay: 0.21430445064843, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=ceres, epoch 2461200.5) + NASA Science (Ceres) + Wikipedia (Ceres; Dawn / Park et al. 2016)',
  },

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=orcus&phys-par=1&full-prec=1
  // Physical (Wikipedia, Orcus): mean diameter 910 km (ALMA 2016) -> radius 455 km.
  // Mass: Orcus-Vanth system = 6.348e20 kg; Vanth holds ~13.7%, so Orcus ~5.48e20 kg.
  // Rotation 13.188 h (SBDB / LCDB). Axial tilt is unmeasured: no published value, so 0
  // is used here as an explicit placeholder (orientation only known to be ~pole-on).
  orcus: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 455,
    massKg: 5.48e20,
    rotPeriodHours: 13.188,
    axialTiltDeg: 0.0,
    colorHex: 0x99a0a8,
    orbitColor: '#94a3b8',
    glowColor: '#cbd5e1',
    hasRings: false,
    atmosphere: false,
    nameEn: 'Orcus',
    nameRu: 'Орк',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'A plutino in 2:3 resonance with Neptune, the "anti-Pluto", with a bright water-ice surface and one large moon, Vanth.',
    descRu: 'Плутино в резонансе 2:3 с Нептуном, «анти-Плутон», с яркой поверхностью из водяного льда и крупным спутником Вант.',
    elements: { e: 0.2205240628250881, aAU: 39.37686537914865, iDeg: 20.55681019612, nodeDeg: 268.4053519455824, argPeriDeg: 73.56848606705262, Tp: 2504046.134962433665, nDegPerDay: 0.003988800931399829, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=orcus, epoch 2461200.5) + Wikipedia (Orcus)',
  },

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=haumea&phys-par=1&full-prec=1
  // Physical (Wikipedia, Haumea): strongly elongated Jacobi ellipsoid; use the MEAN radius
  // from the 2019 shape solution 2100 x 1680 x 1074 km -> volume-equivalent radius ~780 km
  // (long/short axes differ greatly; a single radius is an approximation).
  // Mass 3.95244e21 kg: Proudfoot et al. (2024) PSJ 5:69, Table 2, HST-only non-Keplerian
  // orbit fit (3952.44 x 10^18 kg) -- the SAME fit that supplies Hi'iaka/Namaka elements, so
  // mass and moon orbits are mutually consistent. (The older 4.006e21 kg of Ragozzine & Brown
  // 2009 is superseded by this dynamical determination.)
  // Rotation 3.9155 h (fastest large body in the Solar System). Axial tilt ~78.9-81.2 deg to
  // the ecliptic (Kondratyev & Kornoukhov 2018), i.e. its spin axis lies close to the
  // ecliptic; value below uses the 81.2 deg solution. Haumea has a ring (2017).
  haumea: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 780,
    massKg: 3.95244e21,
    rotPeriodHours: 3.9155,
    axialTiltDeg: 81.2,
    colorHex: 0xf4f4ef,
    orbitColor: '#e7e5e4',
    glowColor: '#ffffff',
    hasRings: true,
    atmosphere: false,
    nameEn: 'Haumea',
    nameRu: 'Хаумеа',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'A rapidly spinning, strongly elongated dwarf planet with a ring and two moons, coated in bright crystalline water ice.',
    descRu: 'Быстро вращающаяся сильно вытянутая карликовая планета с кольцом и двумя спутниками, покрытая ярким кристаллическим водяным льдом.',
    elements: { e: 0.1944430148898797, aAU: 43.06029023650952, iDeg: 28.20847393040364, nodeDeg: 121.7860561329425, argPeriDeg: 240.6905472508661, Tp: 2500416.599615282750, nDegPerDay: 0.003488097731816818, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=haumea, epoch 2461200.5) + Proudfoot et al. (2024) PSJ 5:69 (mass 3952.44e18 kg, HST-only fit) + NASA Science (Haumea) + Wikipedia (Haumea)',
  },

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=quaoar&phys-par=1&full-prec=1
  // Physical (Wikipedia, Quaoar): triaxial ellipsoid 1166.6 x 1110.6 x 1020.0 km ->
  // volume-equivalent diameter 1098 km, so mean radius ~549 km. Mass 1.212e21 kg;
  // rotation 8.84 h (SBDB / LCDB). Axial tilt ~12.6 deg to the ecliptic, inferred from its
  // coplanar rings (Proudfoot et al. 2025); obliquity to its own orbit is not separately
  // measured. Quaoar has two rings outside its Roche limit.
  quaoar: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 549,
    massKg: 1.212e21,
    rotPeriodHours: 8.84,
    axialTiltDeg: 12.6,
    colorHex: 0x9c6b52,
    orbitColor: '#b45309',
    glowColor: '#fed7aa',
    hasRings: true,
    atmosphere: false,
    nameEn: 'Quaoar',
    nameRu: 'Квавар',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'A classical Kuiper Belt object with a reddish, crystalline-ice surface, two rings beyond its Roche limit and the moon Weywot.',
    descRu: 'Классический объект пояса Койпера с красноватой поверхностью из кристаллического льда, двумя кольцами за пределом Роша и спутником Вейвот.',
    elements: { e: 0.03520023677935285, aAU: 43.15617648834794, iDeg: 7.991575801906905, nodeDeg: 188.9191248447958, argPeriDeg: 163.2090510089555, Tp: 2480516.376493195825, nDegPerDay: 0.003476479182765016, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=quaoar, epoch 2461200.5) + Wikipedia (Quaoar)',
  },

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=makemake&phys-par=1&full-prec=1
  // Physical (NASA Science / Wikipedia, Makemake): mean radius ~715 km (diameter 1430 km);
  // mass 2.69e21 kg; rotation 22.8266 h (SBDB / LCDB; literature also allows 11.4 h).
  // Axial tilt is unmeasured: best estimate ~62 deg to its orbit (published range 46-78 deg;
  // Parker et al. 2016), value below is the midpoint of that range.
  makemake: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 715,
    massKg: 2.69e21,
    rotPeriodHours: 22.8266,
    axialTiltDeg: 62.0,
    colorHex: 0xb06a4a,
    orbitColor: '#c2410c',
    glowColor: '#fdba74',
    hasRings: false,
    atmosphere: false,
    nameEn: 'Makemake',
    nameRu: 'Макемаке',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'A bright, methane-frosted dwarf planet in the classical Kuiper Belt, orbited by the small dark moon MK 2.',
    descRu: 'Яркая карликовая планета в классическом поясе Койпера с метановым инеем и небольшим тёмным спутником MK 2.',
    elements: { e: 0.1588889953992523, aAU: 45.57093317300052, iDeg: 29.02785603743067, nodeDeg: 79.2948338209406, argPeriDeg: 297.0922733397207, Tp: 2408158.694098616288, nDegPerDay: 0.003203850120050116, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=makemake, epoch 2461200.5) + NASA Science (Makemake) + Wikipedia (Makemake)',
  },

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=225088%20Gonggong&phys-par=1&full-prec=1
  // (also retrievable as sstr=2007 OR10). Physical (Wikipedia, Gonggong): mean diameter
  // 1230 +/- 50 km -> radius 615 km; mass 1.75e21 kg; rotation 22.4 h (SBDB / K2, Pál et al.
  // 2016). Axial tilt is unmeasured: no published value, so 0 is used as an explicit
  // placeholder (the pole-on light curve implies the axis currently points near Earth).
  gonggong: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 615,
    massKg: 1.75e21,
    rotPeriodHours: 22.4,
    axialTiltDeg: 0.0,
    colorHex: 0xa83f2a,
    orbitColor: '#b91c1c',
    glowColor: '#fca5a5',
    hasRings: false,
    atmosphere: false,
    nameEn: 'Gonggong',
    nameRu: 'Гунгун',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'A highly red scattered-disc dwarf planet bearing water ice and methane frost, orbited by the moon Xiangliu.',
    descRu: 'Очень красная карликовая планета рассеянного диска с водяным льдом и метановым инеем, со спутником Сянлю.',
    elements: { e: 0.5042510000302973, aAU: 66.86666567773766, iDeg: 30.89906721170288, nodeDeg: 336.8383156185827, argPeriDeg: 206.6232839773693, Tp: 2399252.724653532496, nDegPerDay: 0.001802559348482343, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=225088 Gonggong / 2007 OR10, epoch 2461200.5) + Wikipedia (Gonggong)',
  },

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=eris&phys-par=1&full-prec=1
  // Physical (Wikipedia, Eris): mean diameter 2326 +/- 12 km (2010 stellar occultation) ->
  // radius 1163 km; mass 1.638e22 kg (Eris ALONE, = system 1.6466e22 minus Dysnomia).
  // Rotation: Eris is tidally locked to Dysnomia (2023, Szakáts et al.), so its sidereal
  // rotation equals Dysnomia's 15.78-day orbit = 378.72 h. (NASA Science and SBDB still list
  // the older, superseded 25.9 h spin.) Axial tilt is unmeasured: best estimate ~78.3 deg,
  // assumed equal to Dysnomia's orbital inclination (Holler et al. 2021).
  eris: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 1163,
    massKg: 1.638e22,
    rotPeriodHours: 378.72,
    axialTiltDeg: 78.29,
    colorHex: 0xf2f2f2,
    orbitColor: '#e2e8f0',
    glowColor: '#ffffff',
    hasRings: false,
    atmosphere: false,
    nameEn: 'Eris',
    nameRu: 'Эрида',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'The most massive known dwarf planet, a bright methane-covered world beyond the Kuiper Belt with one moon, Dysnomia.',
    descRu: 'Самая массивная известная карликовая планета — яркий мир, покрытый метановым льдом, за поясом Койпера, со спутником Дисномия.',
    elements: { e: 0.4382385347971672, aAU: 67.93394687853566, iDeg: 43.9258279471791, nodeDeg: 36.00477044417249, argPeriDeg: 150.7949235840312, Tp: 2545407.716847013144, nDegPerDay: 0.001760247770619088, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=eris, epoch 2461200.5) + Wikipedia (Eris; occultation 2011, Szakáts et al. 2023)',
  },

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=sedna&phys-par=1&full-prec=1
  // Physical (Wikipedia, Sedna): mean diameter ~995 +/- 80 km (Herschel 2012) -> radius
  // ~498 km. Sedna has no known moon, so its mass is unmeasured; the value below is the
  // published UPPER-LIMIT estimate ~2e21 kg (Wikipedia) and should be treated as uncertain.
  // Rotation 10.273 h (SBDB / LCDB; ~10 h in the literature). Axial tilt is unmeasured:
  // no published value, so 0 is used as an explicit placeholder.
  sedna: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 498,
    massKg: 2.0e21,
    rotPeriodHours: 10.273,
    axialTiltDeg: 0.0,
    colorHex: 0x9e3b2c,
    orbitColor: '#7f1d1d',
    glowColor: '#f87171',
    hasRings: false,
    atmosphere: false,
    nameEn: 'Sedna',
    nameRu: 'Седна',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'The reddest large body in the Solar System, a distant sednoid on an extremely eccentric orbit lasting about 11,400 years.',
    descRu: 'Самое красное крупное тело Солнечной системы — далёкий седноид на чрезвычайно вытянутой орбите с периодом около 11 400 лет.',
    elements: { e: 0.8598824585187618, aAU: 543.7195289104732, iDeg: 11.92527582847476, nodeDeg: 144.5061662673739, argPeriDeg: 311.0987725939751, Tp: 2479264.750687138669, nDegPerDay: 0.00007773948799642578, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=sedna, epoch 2461200.5) + Wikipedia (Sedna)',
  },

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=salacia&phys-par=1&full-prec=1
  // Physical (Wikipedia, Salacia): mean diameter 838 +/- 44 km (ALMA/NEATM 2025) -> radius
  // 419 km. Mass: Salacia-Actaea system = 4.861e20 kg; Actaea is ~4.4% of that, so Salacia
  // ~4.66e20 kg. Rotation: mutually tidally locked with Actaea, sidereal period = Actaea's
  // 5.49389-day orbit = 131.85 h (Collyer et al. 2025). (SBDB still lists the older 6.09 h
  // value, now shown to be an observational-aliasing artefact.) Axial tilt is unmeasured:
  // no published value, so 0 is used as an explicit placeholder.
  salacia: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 419,
    massKg: 4.66e20,
    rotPeriodHours: 131.85,
    axialTiltDeg: 0.0,
    colorHex: 0x5b6068,
    orbitColor: '#64748b',
    glowColor: '#94a3b8',
    hasRings: false,
    atmosphere: false,
    nameEn: 'Salacia',
    nameRu: 'Салация',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'A dark, nearly spherical classical Kuiper Belt object forming a mutually tidally locked binary with its moon Actaea.',
    descRu: 'Тёмный, почти сферический объект классического пояса Койпера, образующий взаимно синхронную приливную пару со спутником Актея.',
    elements: { e: 0.1046039838127425, aAU: 42.05521225409177, iDeg: 23.92719899399624, nodeDeg: 280.254342318715, argPeriDeg: 308.9773054038262, Tp: 2423933.698631460196, nDegPerDay: 0.00361388501348273, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=salacia, epoch 2461200.5) + Wikipedia (120347 Salacia)',
  },
};

export const ORDERED_DWARF_KEYS = ['ceres','orcus','haumea','quaoar','makemake','gonggong','eris','sedna','salacia'];

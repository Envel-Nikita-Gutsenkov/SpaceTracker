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
// All SBDB solutions below use epoch JD 2461200.5 (TDB), frame J2000, equinox J2000.
//
// `recognition` records the IAU classification status of each body:
//   'official'  – formally designated a dwarf planet by the IAU (2006): Ceres, Eris, Haumea,
//                 Makemake (Pluto, the fifth, is carried by PLANETARY_ELEMENTS_J2000 as a planet).
//   'candidate' – a probable dwarf planet that meets the physical criteria (hydrostatic
//                 equilibrium, orbits the Sun, has not cleared its neighbourhood) but has not
//                 been formally classified by the IAU.

export const DWARF_PLANETS = {
  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=ceres&phys-par=1&full-prec=1
  // Physical: NASA Science (science.nasa.gov/dwarf-planets/ceres); mean radius = 939.4 km
  // diameter / 2; mass, rotation and 4 deg axial tilt from the Dawn mission
  // (Park et al. 2016, Nature 537, 515).
  ceres: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 469.7,
    // Mildly triaxial: extents 964.4 x 964.2 x 891.8 km (JPL SBDB `extent`) -> semi-axes below.
    shape: { aKm: 482.2, bKm: 482.1, cKm: 445.9 },
    massKg: 9.3839e20,
    rotPeriodHours: 9.074,
    axialTiltDeg: 4.0,
    colorHex: 0x9c9c94,
    orbitColor: '#a8a29e',
    glowColor: '#d6d3d1',
    hasRings: false,
    atmosphere: false,
    recognition: 'official',
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
    recognition: 'candidate',
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
  // Physical (Wikipedia, Haumea): strongly elongated Jacobi ellipsoid. Semi-axes a x b x c =
  // 1061 x 844 x 514 km, the best-fit triaxial shape from the 2017 occultation reanalysis of
  // Proudfoot et al. (2026) PSJ (arXiv:2605.28636), which yields density 2050 kg/m^3 -- so the
  // shape is self-consistent with the mass below. `radiusKm` is the volume-equivalent (mean)
  // radius cbrt(1061*844*514) ~ 772 km; a single radius would badly misrepresent this body,
  // hence the explicit `shape` (long/short axis ratio ~2.1).
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
    radiusKm: 772,
    shape: { aKm: 1061, bKm: 844, cKm: 514 },
    massKg: 3.95244e21,
    rotPeriodHours: 3.9155,
    axialTiltDeg: 81.2,
    colorHex: 0xf4f4ef,
    orbitColor: '#e7e5e4',
    glowColor: '#ffffff',
    hasRings: true,
    atmosphere: false,
    recognition: 'official',
    nameEn: 'Haumea',
    nameRu: 'Хаумеа',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'A rapidly spinning, strongly elongated dwarf planet with a ring and two moons, coated in bright crystalline water ice.',
    descRu: 'Быстро вращающаяся сильно вытянутая карликовая планета с кольцом и двумя спутниками, покрытая ярким кристаллическим водяным льдом.',
    elements: { e: 0.1944430148898797, aAU: 43.06029023650952, iDeg: 28.20847393040364, nodeDeg: 121.7860561329425, argPeriDeg: 240.6905472508661, Tp: 2500416.599615282750, nDegPerDay: 0.003488097731816818, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=haumea, epoch 2461200.5) + Proudfoot et al. (2024) PSJ 5:69 (mass 3952.44e18 kg, HST-only fit) + Proudfoot et al. (2026) PSJ, arXiv:2605.28636 (triaxial shape 1061x844x514 km) + NASA Science (Haumea) + Wikipedia (Haumea)',
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
    // Triaxial ellipsoid 1166.6 x 1110.6 x 1020.0 km (Wikipedia) -> semi-axes below.
    shape: { aKm: 583.3, bKm: 555.3, cKm: 510.0 },
    massKg: 1.212e21,
    rotPeriodHours: 8.84,
    axialTiltDeg: 12.6,
    colorHex: 0x9c6b52,
    orbitColor: '#b45309',
    glowColor: '#fed7aa',
    hasRings: true,
    atmosphere: false,
    recognition: 'candidate',
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
    recognition: 'official',
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
    recognition: 'candidate',
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
    recognition: 'official',
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
    recognition: 'candidate',
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
    recognition: 'candidate',
    nameEn: 'Salacia',
    nameRu: 'Салация',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'A dark, nearly spherical classical Kuiper Belt object forming a mutually tidally locked binary with its moon Actaea.',
    descRu: 'Тёмный, почти сферический объект классического пояса Койпера, образующий взаимно синхронную приливную пару со спутником Актея.',
    elements: { e: 0.1046039838127425, aAU: 42.05521225409177, iDeg: 23.92719899399624, nodeDeg: 280.254342318715, argPeriDeg: 308.9773054038262, Tp: 2423933.698631460196, nDegPerDay: 0.00361388501348273, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=salacia, epoch 2461200.5) + Wikipedia (120347 Salacia)',
  },

  // ---------------------------------------------------------------------------
  // Additional probable dwarf planets (all reach hydrostatic equilibrium within
  // their uncertainties). Orbital elements are the same JPL SBDB osculating
  // solution (epoch JD 2461200.5); physical data from the cited references.
  // ---------------------------------------------------------------------------

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=varda&phys-par=1&full-prec=1
  // Physical (Wikipedia, 174567 Varda): mean diameter 648 km (2026 occultation
  // reanalysis, Proudfoot et al.) -> radius 324 km. Binary system mass 2.675e20 kg;
  // Varda itself holds ~86-90%, so ~2.35e20 kg is used here. Rotation 5.750824 d
  // (= 138.02 h) - Varda is likely mutually tidally locked to its moon Ilmare.
  // Axial tilt is unmeasured: 0 is used as an explicit placeholder.
  varda: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 324,
    massKg: 2.35e20,
    rotPeriodHours: 138.02,
    axialTiltDeg: 0.0,
    colorHex: 0x9c8b7a,
    orbitColor: '#a8a29e',
    glowColor: '#d6d3d1',
    hasRings: false,
    atmosphere: false,
    recognition: 'candidate',
    nameEn: 'Varda',
    nameRu: 'Варда',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'A large, moderately reddish classical Kuiper Belt object, formally designated 174567 Varda, forming a binary with its moon Ilmare.',
    descRu: 'Крупный красноватый объект классического пояса Койпера (174567 Варда), образующий двойную систему со спутником Ильмаре.',
    elements: { e: 0.1422792008234468, aAU: 45.553792965197, iDeg: 21.51272002644964, nodeDeg: 184.0761905128264, argPeriDeg: 184.8433524049403, Tp: 2487001.267037738442, nDegPerDay: 0.003205658525624677, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=varda, epoch 2461200.5) + Wikipedia (174567 Varda; Proudfoot et al. 2026)',
  },

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=ixion&phys-par=1&full-prec=1
  // Physical (Wikipedia, 28978 Ixion): mean diameter 696.78 km (2026 stellar
  // occultation, Kilic et al.) -> radius 348.4 km. Rotation 12.4 +/- 0.3 h. No mass
  // has been published (no moon), so mass is an explicit estimate from the radius
  // assuming a bulk density of 1.0 g/cm3 (a common KBO value). Axial tilt unmeasured: 0.
  ixion: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 348.4,
    massKg: 1.77e20,
    rotPeriodHours: 12.4,
    axialTiltDeg: 0.0,
    colorHex: 0xa5674a,
    orbitColor: '#b45309',
    glowColor: '#fdba74',
    hasRings: false,
    atmosphere: false,
    recognition: 'candidate',
    nameEn: 'Ixion',
    nameRu: 'Иксион',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'A large plutino (28978 Ixion) in 2:3 resonance with Neptune, with a reddish surface rich in tholins.',
    descRu: 'Крупный плутино (28978 Иксион) в резонансе 2:3 с Нептуном с красноватой поверхностью, богатой толинами.',
    elements: { e: 0.2435609285514542, aAU: 39.34646480522989, iDeg: 19.66251532313573, nodeDeg: 71.0808264000478, argPeriDeg: 300.6223377684572, Tp: 2477485.360758701057, nDegPerDay: 0.003993424672999863, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=ixion, epoch 2461200.5) + Wikipedia (28978 Ixion; Kilic et al. 2026) [mass estimated at 1.0 g/cm3]',
  },

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=307261&phys-par=1&full-prec=1
  // (307261 Mani, formerly 2002 MS4.) Physical (Wikipedia, 307261 Mani): mean
  // diameter 796 +/- 24 km (2023) -> radius 398 km. Rotation 14.251 h. Mass is an
  // explicit estimate from the radius at 1.0 g/cm3 (unmeasured). Axial tilt unknown: 0.
  mani: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 398,
    massKg: 2.64e20,
    rotPeriodHours: 14.251,
    axialTiltDeg: 0.0,
    colorHex: 0x8f8577,
    orbitColor: '#78716c',
    glowColor: '#d6d3d1',
    hasRings: false,
    atmosphere: false,
    recognition: 'candidate',
    nameEn: 'Mani',
    nameRu: 'Мани',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'A large classical Kuiper Belt object, formally designated 307261 Mani (2002 MS4), with a neutral-coloured surface.',
    descRu: 'Крупный объект классического пояса Койпера, официально 307261 Мани (2002 MS4), с нейтральной по цвету поверхностью.',
    elements: { e: 0.1482654554299753, aAU: 41.58863664738092, iDeg: 17.69991360489779, nodeDeg: 216.1403186984926, argPeriDeg: 215.4842690316302, Tp: 2496493.847360775530, nDegPerDay: 0.003674870576376502, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=307261, epoch 2461200.5) + Wikipedia (307261 Mani; Rommel et al. 2023) [mass estimated at 1.0 g/cm3]',
  },

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=55565&phys-par=1&full-prec=1
  // (55565 Aya, formerly 2002 AW197.) Physical (Wikipedia, 55565 Aya): mean
  // diameter 768 +/- 39 km (Vilenius et al. 2014) -> radius 384 km. Rotation 8.86 h.
  // Mass is an explicit estimate from the radius at 1.0 g/cm3 (unmeasured). Tilt unknown: 0.
  aya: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 384,
    massKg: 2.37e20,
    rotPeriodHours: 8.86,
    axialTiltDeg: 0.0,
    colorHex: 0xa98976,
    orbitColor: '#b45309',
    glowColor: '#fed7aa',
    hasRings: false,
    atmosphere: false,
    recognition: 'candidate',
    nameEn: 'Aya',
    nameRu: 'Ая',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'A sizable classical Kuiper Belt object, formally designated 55565 Aya (2002 AW197).',
    descRu: 'Значительный объект классического пояса Койпера, официально 55565 Ая (2002 AW197).',
    elements: { e: 0.1286825927917718, aAU: 47.36875987690542, iDeg: 24.34033767915258, nodeDeg: 297.3697786526271, argPeriDeg: 294.1459414012872, Tp: 2479622.214741846361, nDegPerDay: 0.00302319423990938, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=55565, epoch 2461200.5) + Wikipedia (55565 Aya; Vilenius et al. 2014) [mass estimated at 1.0 g/cm3]',
  },

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=208996&phys-par=1&full-prec=1
  // (208996 Achlys, formerly 2003 AZ84.) Physical (Wikipedia, 208996 Achlys):
  // dimensions 940 x 766 x 490 km (Dias-Oliveira et al. 2017) -> volume-equivalent
  // radius ~353 km. Rotation 13.42 h. Achlys has one small moon (S/2005 (208996) 1,
  // not modelled here). Mass is an explicit 1.0 g/cm3 estimate. Tilt unknown: 0.
  achlys: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 353,
    // Elongated: dimensions 940 x 766 x 490 km (Dias-Oliveira et al. 2017) -> semi-axes below.
    shape: { aKm: 470, bKm: 383, cKm: 245 },
    massKg: 1.84e20,
    rotPeriodHours: 13.42,
    axialTiltDeg: 0.0,
    colorHex: 0x9a7f6b,
    orbitColor: '#a16207',
    glowColor: '#fde68a',
    hasRings: false,
    atmosphere: false,
    recognition: 'candidate',
    nameEn: 'Achlys',
    nameRu: 'Ахлис',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'A large plutino, formally designated 208996 Achlys (2003 AZ84), with an elongated shape and one known small moon.',
    descRu: 'Крупный плутино, официально 208996 Ахлис (2003 AZ84), с вытянутой формой и одним небольшим спутником.',
    elements: { e: 0.1749643183262652, aAU: 39.65674190908469, iDeg: 13.54857109263982, nodeDeg: 251.8991700940268, argPeriDeg: 14.06755482579046, Tp: 2490594.475971509903, nDegPerDay: 0.003946649217918202, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=208996, epoch 2461200.5) + Wikipedia (208996 Achlys; Dias-Oliveira et al. 2017) [mass estimated at 1.0 g/cm3]',
  },

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=55637&phys-par=1&full-prec=1
  // (55637 Uni, formerly 2002 UX25.) Physical (Wikipedia, 55637 Uni): mean
  // diameter ~610 km (Rommel et al. 2026) -> radius 305 km; mass 1.25e20 kg
  // (Brown 2013). Rotation 14.382 h. Uni has one small moon (S/2007 (55637) 1,
  // not modelled here). Axial tilt unmeasured: 0.
  uni: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 305,
    massKg: 1.25e20,
    rotPeriodHours: 14.382,
    axialTiltDeg: 0.0,
    colorHex: 0x8a7d70,
    orbitColor: '#78716c',
    glowColor: '#e7e5e4',
    hasRings: false,
    atmosphere: false,
    recognition: 'candidate',
    nameEn: 'Uni',
    nameRu: 'Уни',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'A mid-sized classical Kuiper Belt object, formally designated 55637 Uni (2002 UX25), notably under-dense for its size.',
    descRu: 'Средний по размеру объект классического пояса Койпера, официально 55637 Уни (2002 UX25), примечательно низкой плотности.',
    elements: { e: 0.1462441869199175, aAU: 42.92456947386417, iDeg: 19.42327844654774, nodeDeg: 204.6157936874821, argPeriDeg: 276.0993480674751, Tp: 2475423.233840569568, nDegPerDay: 0.003504654029402282, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=55637, epoch 2461200.5) + Wikipedia (55637 Uni; Rommel et al. 2026, Brown 2013)',
  },

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=hygiea&phys-par=1&full-prec=1
  // Physical (Wikipedia, 10 Hygiea): mean diameter 433 +/- 8 km (Vernazza et al. 2021)
  // -> radius 216.5 km. Mass 8.236e19 kg (Fuentes-Munoz 2025). Rotation 13.82559 h.
  // Axial tilt 120 deg to the ecliptic (Vernazza et al. 2021). Hygiea is the fourth-
  // largest asteroid-belt body and a strong candidate dwarf planet, but its IAU status
  // is not yet formalised - it is grouped here for completeness.
  hygiea: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 216.5,
    massKg: 8.236e19,
    rotPeriodHours: 13.82559,
    axialTiltDeg: 120.0,
    colorHex: 0x6b6a66,
    orbitColor: '#57534e',
    glowColor: '#a8a29e',
    hasRings: false,
    atmosphere: false,
    recognition: 'candidate',
    nameEn: 'Hygiea',
    nameRu: 'Гигея',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'The fourth-largest body in the asteroid belt and a likely dwarf planet (10 Hygiea), with a nearly spherical shape and a giant impact basin.',
    descRu: 'Четвёртое по величине тело пояса астероидов и вероятная карликовая планета (10 Гигея) с почти сферической формой и гигантским ударным бассейном.',
    elements: { e: 0.1067092741240963, aAU: 3.150974033963701, iDeg: 3.829529946447122, nodeDeg: 283.1198927508594, argPeriDeg: 312.4242387344704, Tp: 2461813.200828681790, nDegPerDay: 0.1762125505792448, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=hygiea, epoch 2461200.5) + Wikipedia (10 Hygiea; Vernazza et al. 2021, Fuentes-Munoz 2025)',
  },

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=varuna&phys-par=1&full-prec=1
  // Physical (Wikipedia, 20000 Varuna): mean diameter 678 km (2013 and 2014 stellar
  // occultations) -> radius 339 km. Fast rotator, 6.3436 h. No published mass (no confirmed
  // moon), so mass is an explicit estimate from the radius assuming a bulk density of
  // 0.992 g/cm3 (from the light-curve shape solution). Axial tilt unmeasured: 0.
  varuna: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 339,
    massKg: 1.6e20,
    rotPeriodHours: 6.3436,
    axialTiltDeg: 0.0,
    colorHex: 0x8f5a44,
    orbitColor: '#7c2d12',
    glowColor: '#e8a87c',
    hasRings: false,
    atmosphere: false,
    recognition: 'candidate',
    nameEn: 'Varuna',
    nameRu: 'Варуна',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'A large, fast-rotating classical Kuiper Belt object (20000 Varuna), moderately red and probably strongly elongated.',
    descRu: 'Крупный быстро вращающийся объект классического пояса Койпера (20000 Варуна), умеренно красный и, вероятно, сильно вытянутый.',
    elements: { e: 0.05161543734827757, aAU: 43.2000227503935, iDeg: 17.14054429876356, nodeDeg: 97.21583412147274, argPeriDeg: 273.3589746671601, Tp: 2427878.215564044025, nDegPerDay: 0.00347118779898972, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=varuna, epoch 2461200.5) + Wikipedia (20000 Varuna; 2013/2014 occultations) [mass estimated at 0.992 g/cm3]',
  },

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=229762&phys-par=1&full-prec=1
  // (229762 G!kun||'homdima, formerly 2007 UK126.) Physical (Wikipedia, 229762
  // G!kun||'homdima): effective (equivalent-sphere) diameter 600-670 km -> radius ~317.5 km;
  // the body is distinctly non-spherical. System mass (1.36 +/- 0.03)e20 kg (Grundy et al.
  // 2019); the moon holds ~1%, so ~1.35e20 kg is used for the primary. Rotation: the
  // light-curve amplitude is tiny and the shape irregular, so the period is uncertain;
  // 11.05 h is the published simplest solution (true value somewhere between ~11 and 41 h).
  // Axial tilt unmeasured: 0.
  gkunhomdima: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 317.5,
    massKg: 1.35e20,
    rotPeriodHours: 11.05,
    axialTiltDeg: 0.0,
    colorHex: 0x8a6a55,
    orbitColor: '#7a4a35',
    glowColor: '#cfa98f',
    hasRings: false,
    atmosphere: false,
    recognition: 'candidate',
    nameEn: 'Gǃkúnǁʼhòmdímà',
    nameRu: 'Гкунхомдима',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'A mid-sized red scattered-disc object (229762 Gǃkúnǁʼhòmdímà) with a moon and an unusually low density, its surface rich in water and carbon-dioxide ice.',
    descRu: 'Средний по размеру красный объект рассеянного диска (229762 Гкунхомдима) со спутником и необычно низкой плотностью; поверхность богата водяным льдом и льдом углекислого газа.',
    elements: { e: 0.4957816282699332, aAU: 74.50819049288985, iDeg: 23.32953536634301, nodeDeg: 131.2505901829532, argPeriDeg: 346.0576265153255, Tp: 2468378.860810121314, nDegPerDay: 0.001532491412344953, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=229762, epoch 2461200.5) + Wikipedia (229762 G!kun||\'homdima; Grundy et al. 2019) [system mass 1.36e20 kg, moon ~1%]',
  },

  // SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=interamnia&phys-par=1&full-prec=1
  // Physical (Wikipedia, 704 Interamnia): mean diameter ~332 km (VLT/SPHERE, Hanus et al.
  // 2020) -> radius 166 km; roughly ellipsoidal but near-spherical (c/a ~0.86), so no
  // explicit `shape`. Mass ~3.8e19 kg (metastatistical estimate, Hanus et al. 2019).
  // Rotation 8.727 h. Axial tilt unmeasured: 0.
  interamnia: {
    bodyClass: 'dwarf',
    parentId: null,
    radiusKm: 166,
    massKg: 3.8e19,
    rotPeriodHours: 8.727,
    axialTiltDeg: 0.0,
    colorHex: 0x4c4a46,
    orbitColor: '#3f3d3a',
    glowColor: '#8c8a85',
    hasRings: false,
    atmosphere: false,
    recognition: 'candidate',
    nameEn: 'Interamnia',
    nameRu: 'Интерамния',
    typeEn: 'Dwarf Planet',
    typeRu: 'Карликовая планета',
    descEn: 'The fifth-largest asteroid in the belt (704 Interamnia), a dark, carbon-rich F-type body and a probable dwarf planet.',
    descRu: 'Пятый по величине астероид пояса (704 Интерамния) — тёмное, богатое углеродом тело F-типа и вероятная карликовая планета.',
    elements: { e: 0.1550586536072489, aAU: 3.056811711282865, iDeg: 17.31528178196839, nodeDeg: 280.1672242333686, argPeriDeg: 94.06172596616008, Tp: 2461953.441016414886, nDegPerDay: 0.1844170374508765, epochJD: 2461200.5 },
    source: 'JPL SBDB (sstr=interamnia, epoch 2461200.5) + Wikipedia (704 Interamnia; Hanus et al. 2020, 2019)',
  },
};

export const ORDERED_DWARF_KEYS = ['ceres','orcus','haumea','quaoar','makemake','gonggong','eris','sedna','salacia','varda','ixion','mani','aya','achlys','uni','hygiea','varuna','gkunhomdima','interamnia'];

// The four IAU-designated dwarf planets carried by this registry (Pluto, the fifth, lives in
// PLANETARY_ELEMENTS_J2000). Everything else in ORDERED_DWARF_KEYS is a probable/candidate body.
export const OFFICIAL_DWARF_KEYS = ['ceres', 'haumea', 'makemake', 'eris'];

// True when the given dwarf-planet key is a formally IAU-designated dwarf planet.
export function isOfficialDwarf(id) {
  return OFFICIAL_DWARF_KEYS.includes(id);
}

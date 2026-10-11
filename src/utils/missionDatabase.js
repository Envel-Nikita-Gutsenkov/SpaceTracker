// Mission and agency URL lookup dictionary & matching algorithm
// Prioritizes official agency pages: NASA, ESA, ISRO, Roscosmos, JAXA, KARI, followed by Wikipedia

export const MISSION_DATABASE = {
  // NASA Lunar & Planetary Missions
  35491: {
    officialUrl: 'https://science.nasa.gov/mission/lro/',
    sourceName: 'NASA Science',
    agency: 'NASA',
    wikiTitle: 'Lunar Reconnaissance Orbiter',
    wikiTitleRu: 'Lunar Reconnaissance Orbiter',
    defaultDescRu: 'Lunar Reconnaissance Orbiter (LRO) — автоматическая межпланетная станция NASA на полярной орбите Луны, создавшая детальные 3D-карты лунной поверхности и исследующая потенциальные ресурсы.',
    defaultDescEn: 'The Lunar Reconnaissance Orbiter (LRO) is a NASA robotic spacecraft in an eccentric polar mapping orbit around the Moon, providing 3D mapping and resource identification.'
  },
  44441: {
    officialUrl: 'https://www.isro.gov.in/Chandrayaan2.html',
    sourceName: 'ISRO Official',
    agency: 'ISRO',
    wikiTitle: 'Chandrayaan-2',
    wikiTitleRu: 'Чандраян-2',
    defaultDescRu: '«Чандраян-2» — автоматическая межпланетная станция Индийской организации космических исследований (ISRO), исследующая состав реголита и полярные кратеры Луны с круговой 100-км орбиты.',
    defaultDescEn: 'Chandrayaan-2 is an Indian lunar exploration mission developed by ISRO, operating a high-resolution orbiter in lunar orbit.'
  },
  53323: {
    officialUrl: 'https://www.kari.re.kr/eng/sub03_07_01.do',
    sourceName: 'KARI Official',
    agency: 'KARI',
    wikiTitle: 'Danuri',
    wikiTitleRu: 'Данури',
    defaultDescRu: 'Danuri (KPLO) — первый южнокорейский лунный орбитальный аппарат Корейского института аэрокосмических исследований (KARI), исследующий лунный магнетизм и топографию.',
    defaultDescEn: 'Danuri (Korea Pathfinder Lunar Orbiter) is South Korea\'s first lunar orbiter, operated by KARI to investigate lunar resources and topography.'
  },
  52914: {
    officialUrl: 'https://www.nasa.gov/smallspacecraft/capstone/',
    sourceName: 'NASA CAPSTONE',
    agency: 'NASA / Advanced Space',
    wikiTitle: 'CAPSTONE',
    wikiTitleRu: 'CAPSTONE',
    defaultDescRu: 'CAPSTONE — окололунный спутник NASA формата CubeSat, проводящий навигационные эксперименты на почти прямолинейной гало-орбите (NRHO) будущей станции Gateway.',
    defaultDescEn: 'CAPSTONE is a NASA 12U CubeSat designed to test and verify the calculated Near Rectilinear Halo Orbit (NRHO) for the Lunar Gateway station.'
  },

  // Heliophysics Fleet & Solar Probes
  43600: {
    officialUrl: 'https://science.nasa.gov/mission/parker-solar-probe/',
    sourceName: 'NASA Parker Solar Probe',
    agency: 'NASA',
    wikiTitle: 'Parker Solar Probe',
    wikiTitleRu: 'Паркер (космический аппарат)',
    defaultDescRu: 'Parker Solar Probe — автоматический зонд NASA для исследования внешней короны Солнца. Стал самым быстрым объектом, созданным человеком (до 635 км/с), приближаясь к Солнцу на рекордные 6.9 млн км.',
    defaultDescEn: 'Parker Solar Probe is a NASA robotic spacecraft flying through the Sun\'s outer corona at up to 635 km/s, reaching within 9.86 solar radii of the solar surface.'
  },
  45187: {
    officialUrl: 'https://www.esa.int/Science_Exploration/Space_Science/Solar_Orbiter',
    sourceName: 'ESA Solar Orbiter',
    agency: 'ESA / NASA',
    wikiTitle: 'Solar Orbiter',
    wikiTitleRu: 'Solar Orbiter',
    defaultDescRu: 'Solar Orbiter (SolO) — космическая обсерватория Европейского космического агентства (ESA) при участии NASA для детального изучения Солнца и получения первых в истории снимков его полярных областей.',
    defaultDescEn: 'Solar Orbiter is a Sun-observing mission developed by ESA with NASA participation, designed to capture the first-ever high-resolution images of the solar poles.'
  },
  23726: {
    officialUrl: 'https://soho.nascom.nasa.gov/',
    sourceName: 'NASA/ESA SOHO',
    agency: 'ESA / NASA',
    wikiTitle: 'Solar and Heliospheric Observatory',
    wikiTitleRu: 'SOHO',
    defaultDescRu: 'SOHO — совместный космический аппарат ESA и NASA в точке Лагранжа L1, непрерывно исследующий глубинную структуру Солнца, его корону и солнечный ветер.',
    defaultDescEn: 'The Solar and Heliospheric Observatory (SOHO) is an ESA/NASA spacecraft situated at the Sun-Earth L1 Lagrangian point studying the Sun from core to corona.'
  },
  29510: {
    officialUrl: 'https://stereo.gsfc.nasa.gov/',
    sourceName: 'NASA STEREO',
    agency: 'NASA',
    wikiTitle: 'STEREO',
    wikiTitleRu: 'STEREO',
    defaultDescRu: 'STEREO-A — космический аппарат NASA на гелиоцентрической орбите для стереоскопического 3D-наблюдения солнечных выбросов массы и вспышек.',
    defaultDescEn: 'STEREO-A is a NASA heliocentric solar observation spacecraft capturing stereoscopic 3D images of solar eruptions.'
  },
  57790: {
    officialUrl: 'https://www.isro.gov.in/Aditya_L1.html',
    sourceName: 'ISRO Aditya-L1',
    agency: 'ISRO',
    wikiTitle: 'Aditya-L1',
    wikiTitleRu: 'Адитья-L1',
    defaultDescRu: 'Aditya-L1 — первая индийская солнечная космическая обсерватория ISRO в точке Лагранжа L1 для изучения хромосферы, короны и солнечного ветра.',
    defaultDescEn: 'Aditya-L1 is India\'s first solar space observatory positioned around the Sun-Earth L1 Lagrange point to study solar coronal heating and CME physics.'
  },

  // Space Stations & Habitat Modules
  25544: {
    officialUrl: 'https://www.nasa.gov/international-space-station/',
    sourceName: 'NASA ISS',
    agency: 'NASA / International',
    wikiTitle: 'International Space Station',
    wikiTitleRu: 'Международная космическая станция',
    defaultDescRu: 'Международная космическая станция (МКС) — пилотируемая орбитальная станция на низкой околоземной орбите, совместный международный проект 14 стран.',
    defaultDescEn: 'The International Space Station (ISS) is a modular space station in low Earth orbit, operated as a multinational collaborative project.'
  },
  48274: {
    officialUrl: 'http://www.cmse.gov.cn/',
    sourceName: 'CMSA Official',
    agency: 'CMSA',
    wikiTitle: 'Tiangong space station',
    wikiTitleRu: 'Тяньгун (космическая станция)',
    defaultDescRu: '«Тяньгун» — многомодульная национальная орбитальная станция Китайского пилотируемого космического агентства (CMSA).',
    defaultDescEn: 'Tiangong is a permanently crewed modular space station operated by China Manned Space Agency in low Earth orbit.'
  },

  // Flagship Science Observatories
  20580: {
    officialUrl: 'https://science.nasa.gov/mission/hubble/',
    sourceName: 'NASA Hubble',
    agency: 'NASA / ESA',
    wikiTitle: 'Hubble Space Telescope',
    wikiTitleRu: 'Хаббл (телескоп)',
    defaultDescRu: 'Космический телескоп «Хаббл» — автоматическая обсерватория на орбите Земли, совместный проект NASA и ESA.',
    defaultDescEn: 'The Hubble Space Telescope is a space telescope that was launched into low Earth orbit in 1990 and remains in operation.'
  },
  25867: {
    officialUrl: 'https://chandra.harvard.edu/',
    sourceName: 'NASA Chandra',
    agency: 'NASA',
    wikiTitle: 'Chandra X-ray Observatory',
    wikiTitleRu: 'Чандра (телескоп)',
    defaultDescRu: 'Космическая обсерватория «Чандра» (CXO) — флагманский рентгеновский телескоп NASA для исследования чёрных дыр и скоплений галактик.',
    defaultDescEn: 'The Chandra X-ray Observatory is a Flagship-class NASA space telescope observing the universe in the X-ray spectrum.'
  },
  43435: {
    officialUrl: 'https://tess.mit.edu/',
    sourceName: 'NASA TESS',
    agency: 'NASA / MIT',
    wikiTitle: 'Transiting Exoplanet Survey Satellite',
    wikiTitleRu: 'TESS',
    defaultDescRu: 'TESS — космический телескоп NASA, предназначенный для поиска экзопланет методом транзитной фотометрии на уникальной резонансной орбите.',
    defaultDescEn: 'The Transiting Exoplanet Survey Satellite (TESS) is a NASA space telescope designed to discover transiting exoplanets around bright nearby stars.'
  },
  28485: {
    officialUrl: 'https://swift.gsfc.nasa.gov/',
    sourceName: 'NASA Swift',
    agency: 'NASA',
    wikiTitle: 'Neil Gehrels Swift Observatory',
    wikiTitleRu: 'Свифт (телескоп)',
    defaultDescRu: 'Neil Gehrels Swift Observatory — космическая обсерватория NASA для регистрации и изучения гамма-всплесков во Вселенной.',
    defaultDescEn: 'The Neil Gehrels Swift Observatory is a NASA multi-wavelength space observatory dedicated to studying gamma-ray bursts.'
  },
  25989: {
    officialUrl: 'https://terra.nasa.gov/',
    sourceName: 'NASA Terra',
    agency: 'NASA',
    wikiTitle: 'Terra (satellite)',
    wikiTitleRu: 'Терра (спутник)',
    defaultDescRu: '«Терра» (EOS AM-1) — флагманский научно-исследовательский спутник NASA по глобальному мониторингу климата и атмосферы Земли.',
    defaultDescEn: 'Terra (EOS AM-1) is a NASA multi-national scientific research satellite in sun-synchronous orbit mapping the Earth\'s climate.'
  },
  27424: {
    officialUrl: 'https://aqua.nasa.gov/',
    sourceName: 'NASA Aqua',
    agency: 'NASA',
    wikiTitle: 'Aqua (satellite)',
    wikiTitleRu: 'Аква (спутник)',
    defaultDescRu: '«Аква» (EOS PM-1) — спутник NASA для наблюдения за круговоротом воды в атмосфере и океанах Земли.',
    defaultDescEn: 'Aqua is a NASA Earth science satellite mission studying precipitation, ocean evaporation, and water cycles.'
  },
};

// Heuristic matcher for constellation / spacecraft patterns
export function resolveSatelliteInfo(sat) {
  if (!sat) return null;

  const id = Number(sat.id || sat.noradId);
  if (MISSION_DATABASE[id]) {
    return { ...MISSION_DATABASE[id], id };
  }

  // Curated fleet objects (solar probes, lunar orbiters, other-planet orbiters and
  // the interstellar probes) ship a verified bilingual description and an official
  // agency URL, so surface those directly instead of guessing from the name.
  if (sat.isSolar || sat.isLunar || sat.isPlanetary || sat.isDeepSpace) {
    return {
      officialUrl: sat.wikiUrl || null,
      sourceName: sat.agency || null,
      agency: sat.agency || null,
      wikiTitle: sat.name,
      wikiTitleRu: sat.name,
      defaultDescRu: sat.descRu || null,
      defaultDescEn: sat.desc || null,
    };
  }

  const nameUpper = (sat.name || '').toUpperCase().trim();
  const category = sat.category;

  // Starlink
  if (nameUpper.includes('STARLINK')) {
    return {
      officialUrl: 'https://www.starlink.com/',
      sourceName: 'SpaceX Starlink',
      agency: 'SpaceX',
      wikiTitle: 'Starlink',
      wikiTitleRu: 'Starlink',
      defaultDescRu: 'Starlink — глобальная низкоорбитальная спутниковая система компании SpaceX для обеспечения высокоскоростным широкополосным спутниковым интернетом.',
      defaultDescEn: 'Starlink is a satellite internet constellation operated by SpaceX providing global broadband internet coverage.'
    };
  }

  // OneWeb
  if (nameUpper.includes('ONEWEB')) {
    return {
      officialUrl: 'https://oneweb.net/',
      sourceName: 'Eutelsat OneWeb',
      agency: 'OneWeb / Eutelsat',
      wikiTitle: 'Eutelsat OneWeb',
      wikiTitleRu: 'OneWeb',
      defaultDescRu: 'OneWeb — глобальная система спутниковой связи, предназначенная для предоставления широкополосного доступа в интернет по всему миру.',
      defaultDescEn: 'OneWeb is a global communications network powered by a constellation of low Earth orbit satellites.'
    };
  }

  // GPS / Navstar
  if (nameUpper.startsWith('NAVSTAR') || nameUpper.includes('GPS') || category === 'gps') {
    return {
      officialUrl: 'https://www.gps.gov/',
      sourceName: 'GPS.gov (US Space Force)',
      agency: 'US Space Force',
      wikiTitle: 'Global Positioning System',
      wikiTitleRu: 'GPS',
      defaultDescRu: 'Navstar GPS — спутниковая система навигации, обеспечивающая измерение расстояния, времени и определение географических координат во всемирной системе WGS 84.',
      defaultDescEn: 'The Global Positioning System (GPS) is a satellite-based radionavigation system owned by the United States government.'
    };
  }

  // GLONASS
  if (category === 'glonass' || nameUpper.includes('GLONASS')) {
    return {
      officialUrl: 'https://glonass-iac.ru/',
      sourceName: 'ИАС ГЛОНАСС (Роскосмос)',
      agency: 'Роскосмос',
      wikiTitle: 'GLONASS',
      wikiTitleRu: 'ГЛОНАСС',
      defaultDescRu: 'ГЛОНАСС — российская глобальная навигационная спутниковая система, транслирующая гражданские и специализированные навигационные сигналы.',
      defaultDescEn: 'GLONASS is a Russian satellite navigation system providing real-time positioning and velocity determination.'
    };
  }

  // Galileo
  if (category === 'galileo' || nameUpper.startsWith('GSAT')) {
    return {
      officialUrl: 'https://www.euspa.europa.eu/european-space/galileo',
      sourceName: 'ESA / EUSPA Galileo',
      agency: 'ESA / European Union',
      wikiTitle: 'Galileo (satellite navigation)',
      wikiTitleRu: 'Галилео (навигационная система)',
      defaultDescRu: 'Galileo — европейская спутниковая система навигации, управляемая Европейским космическим агентством (ESA) и агентством EUSPA.',
      defaultDescEn: 'Galileo is the European global navigation satellite system created by the European Union through ESA.'
    };
  }

  // BeiDou
  if (category === 'beidou' || nameUpper.startsWith('BEIDOU')) {
    return {
      officialUrl: 'http://en.beidou.gov.cn/',
      sourceName: 'BeiDou Official (CSNO)',
      agency: 'CSNO (China)',
      wikiTitle: 'BeiDou',
      wikiTitleRu: 'Бэйдоу',
      defaultDescRu: '«Бэйдоу» — китайская спутниковая система навигации, обеспечивающая глобальное геопозиционирование третьего поколения (BDS-3).',
      defaultDescEn: 'The BeiDou Navigation Satellite System is a Chinese satellite navigation system providing global coverage.'
    };
  }

  // Iridium NEXT
  if (nameUpper.includes('IRIDIUM')) {
    return {
      officialUrl: 'https://www.iridium.com/',
      sourceName: 'Iridium Official',
      agency: 'Iridium Communications',
      wikiTitle: 'Iridium satellite constellation',
      wikiTitleRu: 'Иридиум',
      defaultDescRu: 'Iridium NEXT — всемирная спутниковая группировка сотовой спутниковой связи с полным глобальным покрытием поверхности Земли и межспутниковой лазерной связью.',
      defaultDescEn: 'The Iridium satellite constellation is a system of 66 active satellites which provide global coverage for voice and data communication.'
    };
  }

  // Dragon / Cargo
  if (nameUpper.includes('DRAGON')) {
    return {
      officialUrl: 'https://www.spacex.com/vehicles/dragon/',
      sourceName: 'SpaceX Dragon',
      agency: 'SpaceX / NASA',
      wikiTitle: 'SpaceX Dragon',
      wikiTitleRu: 'SpaceX Dragon',
      defaultDescRu: 'SpaceX Dragon — серия многоразовых пилотируемых и грузовых космических кораблей компании SpaceX, доставляющих экипаж и грузы на МКС.',
      defaultDescEn: 'SpaceX Dragon is a reusable spacecraft developed by SpaceX to deliver crew and cargo to the International Space Station.'
    };
  }

  // Progress
  if (nameUpper.includes('PROGRESS')) {
    return {
      officialUrl: 'https://www.roscosmos.ru/',
      sourceName: 'Роскосмос Прогресс',
      agency: 'Роскосмос / РКК Энергия',
      wikiTitle: 'Progress (spacecraft)',
      wikiTitleRu: 'Прогресс (космический корабль)',
      defaultDescRu: '«Прогресс» — серия автоматических транспортных грузовых космических кораблей для снабжения Международной космической станции.',
      defaultDescEn: 'Progress is a Russian automated expendable cargo spacecraft used for supplying the International Space Station.'
    };
  }

  // Soyuz
  if (nameUpper.includes('SOYUZ')) {
    return {
      officialUrl: 'https://www.roscosmos.ru/',
      sourceName: 'Роскосмос Союз',
      agency: 'Роскосмос',
      wikiTitle: 'Soyuz (spacecraft)',
      wikiTitleRu: 'Союз (космический корабль)',
      defaultDescRu: '«Союз» — серия советских и российских многоместных пилотируемых космических кораблей для доставки космонавтов на орбитальные станции.',
      defaultDescEn: 'Soyuz is a series of spacecraft designed for the Soviet space programme and now used by Roscosmos for human spaceflight.'
  };
  }

  // Cygnus
  if (nameUpper.includes('CYGNUS')) {
    return {
      officialUrl: 'https://www.northropgrumman.com/space/cygnus-spacecraft',
      sourceName: 'Northrop Grumman Cygnus',
      agency: 'Northrop Grumman / NASA',
      wikiTitle: 'Cygnus (spacecraft)',
      wikiTitleRu: 'Сигнус (космический корабль)',
      defaultDescRu: 'Cygnus — американский автоматический грузовой космический корабль снабжения МКС, разработанный Northrop Grumman по программе NASA CRS.',
      defaultDescEn: 'Cygnus is an American expendable cargo spacecraft developed by Northrop Grumman to deliver supplies to the ISS.'
    };
  }

  // Weather satellites: NOAA / GOES
  if (nameUpper.includes('NOAA') || nameUpper.includes('GOES')) {
    return {
      officialUrl: 'https://www.nesdis.noaa.gov/',
      sourceName: 'NOAA NESDIS',
      agency: 'NOAA / NASA',
      wikiTitle: 'Geostationary Operational Environmental Satellite',
      wikiTitleRu: 'GOES',
      defaultDescRu: 'GOES / NOAA — серия метеорологических спутников Национального управления океанических и атмосферных исследований США для мониторинга погоды и космоса.',
      defaultDescEn: 'Geostationary Operational Environmental Satellite (GOES) is a constellation of weather satellites operated by NOAA.'
    };
  }

  // Fallback: clean search terms without guaranteed official page. `uncurated`
  // tells the Wikipedia layer this title is a guess from the object name, so it
  // must clear the relevance check before being shown (avoids junk launch lists).
  const clean = nameUpper.replace(/\s*\([^)]*\)/g, '').replace(/[-_]/g, ' ').trim();
  return {
    officialUrl: null,
    sourceName: null,
    agency: sat.agency || sat.country || null,
    wikiTitle: clean,
    wikiTitleRu: clean,
    defaultDescRu: null,
    defaultDescEn: null,
    uncurated: true
  };
}

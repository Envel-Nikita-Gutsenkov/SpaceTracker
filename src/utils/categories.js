export const CATEGORIES = [
  { id: 'iss',         name: 'ISS (Space Station)',color: '#00ffaa', group: 'stations',    dotSize: 6, priority: 13 },
  { id: 'cargo',       name: 'ISS Resupply / Cargo',color: '#fca311', group: 'stations',    dotSize: 4.5, priority: 12 },
  { id: 'stations',    name: 'Tiangong & Modules', color: '#ff70a6', group: 'stations',    dotSize: 5, priority: 11 },
  { id: 'science',     name: 'Science & Hubble',   color: '#00e5ff', group: 'science',     dotSize: 3.5, priority: 10 },
  { id: 'gps',         name: 'GPS (USA)',          color: '#ffcc00', group: 'gps-ops',     dotSize: 3, priority: 8 },
  { id: 'glonass',     name: 'GLONASS (RU)',       color: '#ff6600', group: 'glo-ops',     dotSize: 3, priority: 8 },
  { id: 'galileo',     name: 'Galileo (EU)',       color: '#aa44ff', group: 'galileo',     dotSize: 3, priority: 8 },
  { id: 'beidou',      name: 'BeiDou (CN)',        color: '#ff4488', group: 'beidou',      dotSize: 3, priority: 8 },
  { id: 'weather',     name: 'Weather & NOAA',     color: '#44ddff', group: 'weather',     dotSize: 2, priority: 7 },
  { id: 'geo',         name: 'Geostationary Comm', color: '#ffaa00', group: 'geo',         dotSize: 2, priority: 6 },
  { id: 'iridium',     name: 'Iridium NEXT',       color: '#00b4d8', group: 'iridium-NEXT',dotSize: 2, priority: 6 },
  { id: 'oneweb',      name: 'OneWeb Mega-Const.', color: '#7209b7', group: 'oneweb',      dotSize: 2, priority: 5 },
  { id: 'planet',      name: 'Earth Imaging',      color: '#48cae4', group: 'planet',      dotSize: 2, priority: 5 },
  { id: 'cubesat',     name: 'CubeSats / Nano',    color: '#f72585', group: 'cubesat',     dotSize: 2, priority: 4 },
  { id: 'satnogs',     name: 'SatNOGS Open Net',   color: '#06d6a0', group: 'satnogs',     dotSize: 2, priority: 3 },
  { id: 'iot',         name: 'IoT & Messaging',    color: '#118ab2', group: 'globalstar',  dotSize: 2, priority: 3 },
  { id: 'radar',       name: 'SAR Radar Imaging',  color: '#ffd166', group: 'radar',       dotSize: 2, priority: 3 },
  { id: 'starlink',    name: 'Starlink (SpaceX)',  color: '#4488ff', group: 'starlink',    dotSize: 2, priority: 2 },
  { id: 'megaconst',   name: 'Emerging Mega-Const.',color: '#2dd4bf', group: 'kuiper',     dotSize: 2, priority: 2 },
  { id: 'military',    name: 'Military & Recon',   color: '#ff5c5c', group: 'military',    dotSize: 2, priority: 4 },
  { id: 'amateur',     name: 'Amateur Radio',      color: '#9ef01a', group: 'amateur',     dotSize: 1.5, priority: 2 },
  { id: 'other',       name: 'Other Satellites',   color: '#778da9', group: 'active',      dotSize: 1, priority: 1 },
];

const BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

export function getCategoryById(id) {
  return BY_ID[id] || BY_ID['other'];
}

export function getCategoryColor(id) {
  return getCategoryById(id).color;
}

export function getCategoryColorRGB(id) {
  const hex = getCategoryColor(id).replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return { r, g, b };
}

export function detectCategory(group, name = '') {
  const upper = (name || '').toUpperCase();

  // 1. Group-specific overrides (e.g. glo-ops satellites are named COSMOS xxx, so check group first!)
  if (group === 'glo-ops') return 'glonass';
  if (group === 'gps-ops') return 'gps';
  if (group === 'galileo') return 'galileo';
  if (group === 'beidou') return 'beidou';
  // The `gnss` superset carries GLONASS as plain "COSMOS NNNN (slot)" (no "GLONASS" in the
  // name), which would otherwise be mislabelled military by the COSMOS rule below.
  if (group === 'gnss' && upper.includes('COSMOS')) return 'glonass';

  // 1b. Navigation satellites also ride in other CelesTrak groups — the `sarsat` MEOSAR
  // list carries the entire Galileo constellation. Groups are fetched in parallel and
  // CelesTrak rate-limits, so when the authoritative `galileo` request fails it returns
  // nothing and dedup (first-seen-wins) falls through to `sarsat`, leaving every Galileo
  // satellite labelled `other` (and that snapshot lodges in the IndexedDB cache). Recognise
  // the constellation by name so a miss on one group never costs the whole constellation.
  if (upper.includes('GALILEO')) return 'galileo';
  if (upper.includes('GLONASS')) return 'glonass';
  if (upper.includes('BEIDOU')) return 'beidou';
  // GPS-ops objects are named "GPS BIIR-2  (PRN 13)" / "NAVSTAR 43 (USA 132)".
  if (upper.includes('NAVSTAR') || upper.startsWith('GPS ')) return 'gps';

  // 2. ISS exact space station identification (strictly the main orbiting outpost)
  if (upper.includes('ISS (ZARYA)') || upper === 'ISS') {
    return 'iss';
  }

  // 3. ISS / orbital cargo resupply and crew ferry spacecraft
  if (
    upper.includes('PROGRESS') ||
    upper.includes('CYGNUS') ||
    upper.includes('DRAGON') ||
    upper.includes('CARGO DRAGON') ||
    upper.includes('CREW DRAGON') ||
    upper.includes('STARLINER') ||
    upper.includes('SOYUZ') ||
    upper.includes('HTV') ||
    upper.includes('KOUROUTORI') ||
    upper.includes('TIANZHOU')
  ) {
    return 'cargo';
  }

  // 4. Other space stations and permanently attached habitat modules
  if (
    upper.includes('TIANHE') ||
    upper.includes('WENTIAN') ||
    upper.includes('MENGTIAN') ||
    upper.includes('CSS') ||
    upper.includes('TIANGONG') ||
    upper.includes('NAUKA') ||
    upper.includes('POISK') ||
    upper.includes('PRICHAL') ||
    upper.includes('KIBO') ||
    upper.includes('COLUMBUS')
  ) {
    return 'stations';
  }

  // 5. High-priority Science Observatories and Deep Space / Flagship Explorers
  if (
    upper.includes('HST') ||
    upper.includes('HUBBLE') ||
    upper.includes('JWST') ||
    upper.includes('WEBB') ||
    upper.includes('CHANDRA') ||
    upper.includes('CXO') ||
    upper.includes('SWIFT') ||
    upper.includes('SDO') ||
    upper.includes('TESS') ||
    upper.includes('SPEKTR') ||
    upper.includes('SPITZER') ||
    upper.includes('KEPLER') ||
    upper.includes('XMM') ||
    upper.includes('FERMI') ||
    upper.includes('INTEGRAL') ||
    upper.includes('EUCLID') ||
    upper.includes('GAIA') ||
    upper.includes('PLATO') ||
    upper.includes('SOLAR ORBITER') ||
    upper.includes('PARKER') ||
    upper.includes('VOYAGER') ||
    upper.includes('NEW HORIZONS') ||
    upper.includes('LUNAR RECONNAISSANCE') ||
    upper.includes('LRO') ||
    upper.includes('CHANDRAYAAN') ||
    upper.includes('DANURI') ||
    upper.includes('SLIM')
  ) {
    return 'science';
  }

  // 6. Named commercial / government constellations
  if (upper.includes('STARLINK')) return 'starlink';
  if (upper.includes('ONEWEB')) return 'oneweb';
  if (upper.includes('IRIDIUM')) return 'iridium';
  // Emerging mega-constellations (Amazon Kuiper, Chinese G60/Qianfan and GuoWang).
  if (upper.includes('KUIPER') || upper.includes('QIANFAN') || upper.includes('HULIANWANG')) return 'megaconst';
  if (upper.includes('FLOCK') || upper.includes('SKYSAT') || upper.includes('LEMUR')) return 'planet';
  if (upper.includes('COSMOS') || upper.includes('USA ') || upper.includes('NROL')) return 'military';

  const map = {
    stations:      'stations',
    starlink:      'starlink',
    oneweb:        'oneweb',
    'iridium-NEXT':'iridium',
    'gps-ops':     'gps',
    'glo-ops':     'glonass',
    galileo:       'galileo',
    beidou:        'beidou',
    weather:       'weather',
    goes:          'weather',
    noaa:          'weather',
    geo:           'geo',
    intelsat:      'geo',
    ses:           'geo',
    eutelsat:      'geo',
    telesat:       'geo',
    planet:        'planet',
    spire:         'planet',
    resource:      'planet',
    dmc:           'planet',
    kuiper:        'megaconst',
    qianfan:       'megaconst',
    hulianwang:    'megaconst',
    cubesat:       'cubesat',
    military:      'military',
    science:       'science',
    geodetic:      'science',
    amateur:       'amateur',
    satnogs:       'satnogs',
    globalstar:    'iot',
    orbcomm:       'iot',
    radar:         'radar',
  };
  return map[group] || 'other';
}

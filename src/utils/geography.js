// Geographic surface labels for the Earth globe.
//
// The whole point of this layer is that a label must sit on the *exact* spot it names, so
// the lat/lon → scene conversion is derived from the same convention the Earth mesh uses:
// the sphere is UV-mirrored (see equirectUV.js) and spun by `rotation.y = -gmst`, which puts
// a surface point at east longitude λ at world right ascension GMST + λ. The tests pin this
// against the real `SphereGeometry` so a drift in either the mesh or this math fails loudly.

const DEG = Math.PI / 180;

// Geodetic (lat, lon) → scene position on a sphere of the given radius, in the same frame as
// the Earth mesh (`y` is the north pole, `x`/`z` are the equatorial plane at RA = lon + gmst).
export function latLonToScene(latDeg, lonDeg, gmst, radius = 1.0) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const cosLat = Math.cos(lat);
  return {
    x: radius * cosLat * Math.cos(lon + gmst),
    y: radius * Math.sin(lat),
    z: radius * cosLat * Math.sin(lon + gmst),
  };
}

// Inverse of latLonToScene (spherical, mean-radius Earth). Used by the round-trip test and
// by anything that needs to turn a picked surface point back into coordinates.
export function sceneToLatLon(x, y, z, gmst, radius = 1.0) {
  const r = Math.hypot(x, y, z);
  if (r <= 0) return { lat: 0, lon: 0 };
  const lat = Math.asin(Math.max(-1, Math.min(1, y / r))) / DEG;
  const ra = Math.atan2(z, x);
  let lon = (ra - gmst) / DEG;
  lon = ((lon % 360) + 540) % 360 - 180;
  return { lat, lon, radius: r / radius };
}

// True when a surface point sits on the visible cap of the globe as seen from `camPos`.
// `marginRad` keeps labels off the very limb, where they would smear onto the silhouette.
export function isSurfacePointVisible(point, camPos, radius = 1.0, marginRad = 0.06) {
  if (!point || !camPos) return false;
  const camLen = Math.hypot(camPos.x, camPos.y, camPos.z);
  if (camLen <= radius) return false; // camera inside the globe: nothing is "front"
  // Half-angle of the visible spherical cap.
  const horizon = Math.acos(Math.max(-1, Math.min(1, radius / camLen)));
  const limit = Math.max(0, horizon - marginRad);
  const pLen = Math.hypot(point.x, point.y, point.z);
  if (pLen <= 0) return false;
  const cosAng = (point.x * camPos.x + point.y * camPos.y + point.z * camPos.z) / (pLen * camLen);
  return Math.acos(Math.max(-1, Math.min(1, cosAng))) < limit;
}

// Which geography layer the current camera distance (Earth radii) calls for.
// Close-up → cities (denser the closer you get); pulled back → continents; far → nothing,
// so the planet-name pass owns the view instead.
export function geographyTier(camDist) {
  if (!Number.isFinite(camDist)) return { kind: 'none', level: 0 };
  if (camDist < 1.3) return { kind: 'city', level: 4 };
  if (camDist < 1.8) return { kind: 'city', level: 3 };
  if (camDist < 2.4) return { kind: 'city', level: 2 };
  if (camDist < 3.2) return { kind: 'city', level: 1 };
  if (camDist < 9.0) return { kind: 'continent', level: 5 };
  return { kind: 'none', level: 0 };
}

// Greedy, priority-ordered anti-collision: a label is kept only if its screen box (given by
// its centre `cx`/`cy` and size `w`/`h`) clears every already-accepted box. `priority` is
// ascending (1 = most important), so the biggest names win.
export function selectNonOverlapping(items, maxCount = Infinity, padX = 0, padY = 0) {
  const sorted = [...items].sort((a, b) => a.priority - b.priority);
  const kept = [];
  for (const cand of sorted) {
    if (kept.length >= maxCount) break;
    let overlaps = false;
    for (const k of kept) {
      if (Math.abs(cand.cx - k.cx) < (cand.w + k.w) / 2 + padX &&
          Math.abs(cand.cy - k.cy) < (cand.h + k.h) / 2 + padY) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) kept.push(cand);
  }
  return kept;
}

// Rough on-screen text width for the label font stacks used below. Deliberately a little
// generous so the collision boxes never let two names touch.
export function estimateTextWidth(text, fontSize, letterSpacingEm) {
  const perChar = fontSize * 0.62 + fontSize * letterSpacingEm;
  return Math.max(1, String(text).length) * perChar;
}

// World point → screen pixels, using a THREE camera's view/projection matrices directly so the
// exact placement path can be unit-tested without a WebGL context. Returns `visible: false`
// when the point is behind the camera or outside the depth range.
export function projectWorldToScreen(x, y, z, camera, width, height) {
  if (!camera || !camera.matrixWorldInverse || !camera.projectionMatrix) {
    return { x: 0, y: 0, ndcZ: 2, visible: false };
  }
  const v = camera.matrixWorldInverse.elements;
  const vx = v[0] * x + v[4] * y + v[8] * z + v[12];
  const vy = v[1] * x + v[5] * y + v[9] * z + v[13];
  const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
  const vw = v[3] * x + v[7] * y + v[11] * z + v[15];

  const p = camera.projectionMatrix.elements;
  const cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12] * vw;
  const cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13] * vw;
  const cz = p[2] * vx + p[6] * vy + p[10] * vz + p[14] * vw;
  const cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15] * vw;
  if (cw <= 0) return { x: 0, y: 0, ndcZ: 2, visible: false };

  const ndcX = cx / cw;
  const ndcY = cy / cw;
  const ndcZ = cz / cw;
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (-ndcY * 0.5 + 0.5) * height,
    ndcZ,
    visible: ndcZ > -1.0 && ndcZ < 1.0,
  };
}

// ---------------------------------------------------------------------------
// Curated data. Levels: 1 = megacity (visible furthest), 4 = shown only at the
// closest zoom. Coordinates are the standard city-centre values.
// ---------------------------------------------------------------------------
export const CITY_LABELS = [
  // Level 1 — global hubs
  { name: 'Tokyo', nameRu: 'Токио', lat: 35.6762, lon: 139.6503, level: 1 },
  { name: 'Delhi', nameRu: 'Дели', lat: 28.6139, lon: 77.2090, level: 1 },
  { name: 'Shanghai', nameRu: 'Шанхай', lat: 31.2304, lon: 121.4737, level: 1 },
  { name: 'São Paulo', nameRu: 'Сан-Паулу', lat: -23.5505, lon: -46.6333, level: 1 },
  { name: 'Mexico City', nameRu: 'Мехико', lat: 19.4326, lon: -99.1332, level: 1 },
  { name: 'Cairo', nameRu: 'Каир', lat: 30.0444, lon: 31.2357, level: 1 },
  { name: 'New York', nameRu: 'Нью-Йорк', lat: 40.7128, lon: -74.0060, level: 1 },
  { name: 'Beijing', nameRu: 'Пекин', lat: 39.9042, lon: 116.4074, level: 1 },
  { name: 'London', nameRu: 'Лондон', lat: 51.5074, lon: -0.1278, level: 1 },
  { name: 'Moscow', nameRu: 'Москва', lat: 55.7558, lon: 37.6173, level: 1 },
  { name: 'Paris', nameRu: 'Париж', lat: 48.8566, lon: 2.3522, level: 1 },
  { name: 'Los Angeles', nameRu: 'Лос-Анджелес', lat: 34.0522, lon: -118.2437, level: 1 },

  // Level 2 — major metropolises
  { name: 'Buenos Aires', nameRu: 'Буэнос-Айрес', lat: -34.6037, lon: -58.3816, level: 2 },
  { name: 'Rio de Janeiro', nameRu: 'Рио-де-Жанейро', lat: -22.9068, lon: -43.1729, level: 2 },
  { name: 'Lagos', nameRu: 'Лагос', lat: 6.5244, lon: 3.3792, level: 2 },
  { name: 'Istanbul', nameRu: 'Стамбул', lat: 41.0082, lon: 28.9784, level: 2 },
  { name: 'Karachi', nameRu: 'Карачи', lat: 24.8607, lon: 67.0011, level: 2 },
  { name: 'Mumbai', nameRu: 'Мумбаи', lat: 19.0760, lon: 72.8777, level: 2 },
  { name: 'Jakarta', nameRu: 'Джакарта', lat: -6.2088, lon: 106.8456, level: 2 },
  { name: 'Manila', nameRu: 'Манила', lat: 14.5995, lon: 120.9842, level: 2 },
  { name: 'Bangkok', nameRu: 'Бангкок', lat: 13.7563, lon: 100.5018, level: 2 },
  { name: 'Seoul', nameRu: 'Сеул', lat: 37.5665, lon: 126.9780, level: 2 },
  { name: 'Hong Kong', nameRu: 'Гонконг', lat: 22.3193, lon: 114.1694, level: 2 },
  { name: 'Singapore', nameRu: 'Сингапур', lat: 1.3521, lon: 103.8198, level: 2 },
  { name: 'Sydney', nameRu: 'Сидней', lat: -33.8688, lon: 151.2093, level: 2 },
  { name: 'Johannesburg', nameRu: 'Йоханнесбург', lat: -26.2041, lon: 28.0473, level: 2 },
  { name: 'Madrid', nameRu: 'Мадрид', lat: 40.4168, lon: -3.7038, level: 2 },
  { name: 'Berlin', nameRu: 'Берлин', lat: 52.5200, lon: 13.4050, level: 2 },
  { name: 'Rome', nameRu: 'Рим', lat: 41.9028, lon: 12.4964, level: 2 },
  { name: 'Toronto', nameRu: 'Торонто', lat: 43.6532, lon: -79.3832, level: 2 },
  { name: 'Chicago', nameRu: 'Чикаго', lat: 41.8781, lon: -87.6298, level: 2 },
  { name: 'Houston', nameRu: 'Хьюстон', lat: 29.7604, lon: -95.3698, level: 2 },

  // Level 3 — large cities
  { name: 'Nairobi', nameRu: 'Найроби', lat: -1.2921, lon: 36.8219, level: 3 },
  { name: 'Casablanca', nameRu: 'Касабланка', lat: 33.5731, lon: -7.5898, level: 3 },
  { name: 'Addis Ababa', nameRu: 'Аддис-Абеба', lat: 9.0250, lon: 38.7469, level: 3 },
  { name: 'Cape Town', nameRu: 'Кейптаун', lat: -33.9249, lon: 18.4241, level: 3 },
  { name: 'Tehran', nameRu: 'Тегеран', lat: 35.6892, lon: 51.3890, level: 3 },
  { name: 'Baghdad', nameRu: 'Багдад', lat: 33.3152, lon: 44.3661, level: 3 },
  { name: 'Riyadh', nameRu: 'Эр-Рияд', lat: 24.7136, lon: 46.6753, level: 3 },
  { name: 'Dhaka', nameRu: 'Дакка', lat: 23.8103, lon: 90.4125, level: 3 },
  { name: 'Kolkata', nameRu: 'Калькутта', lat: 22.5726, lon: 88.3639, level: 3 },
  { name: 'Taipei', nameRu: 'Тайбэй', lat: 25.0330, lon: 121.5654, level: 3 },
  { name: 'Osaka', nameRu: 'Осака', lat: 34.6937, lon: 135.5023, level: 3 },
  { name: 'Melbourne', nameRu: 'Мельбурн', lat: -37.8136, lon: 144.9631, level: 3 },
  { name: 'Lima', nameRu: 'Лима', lat: -12.0464, lon: -77.0428, level: 3 },
  { name: 'Bogotá', nameRu: 'Богота', lat: 4.7110, lon: -74.0721, level: 3 },
  { name: 'Santiago', nameRu: 'Сантьяго', lat: -33.4489, lon: -70.6693, level: 3 },
  { name: 'Vancouver', nameRu: 'Ванкувер', lat: 49.2827, lon: -123.1207, level: 3 },
  { name: 'Amsterdam', nameRu: 'Амстердам', lat: 52.3676, lon: 4.9041, level: 3 },
  { name: 'Dubai', nameRu: 'Дубай', lat: 25.2048, lon: 55.2708, level: 3 },

  // Level 4 — shown only at the closest zoom
  { name: 'Auckland', nameRu: 'Окленд', lat: -36.8485, lon: 174.7633, level: 4 },
  { name: 'Perth', nameRu: 'Перт', lat: -31.9505, lon: 115.8605, level: 4 },
  { name: 'Ulaanbaatar', nameRu: 'Улан-Батор', lat: 47.8864, lon: 106.9057, level: 4 },
  { name: 'Almaty', nameRu: 'Алматы', lat: 43.2220, lon: 76.8512, level: 4 },
  { name: 'Tashkent', nameRu: 'Ташкент', lat: 41.2995, lon: 69.2401, level: 4 },
  { name: 'Islamabad', nameRu: 'Исламабад', lat: 33.6844, lon: 73.0479, level: 4 },
  { name: 'Colombo', nameRu: 'Коломбо', lat: 6.9271, lon: 79.8612, level: 4 },
  { name: 'Hanoi', nameRu: 'Ханой', lat: 21.0285, lon: 105.8542, level: 4 },
  { name: 'Kuala Lumpur', nameRu: 'Куала-Лумпур', lat: 3.1390, lon: 101.6869, level: 4 },
  { name: 'Reykjavik', nameRu: 'Рейкьявик', lat: 64.1466, lon: -21.9426, level: 4 },
  { name: 'Anchorage', nameRu: 'Анкоридж', lat: 61.2181, lon: -149.9003, level: 4 },
  { name: 'Honolulu', nameRu: 'Гонолулу', lat: 21.3069, lon: -157.8583, level: 4 },
  { name: 'Lisbon', nameRu: 'Лиссабон', lat: 38.7223, lon: -9.1393, level: 4 },
  { name: 'Warsaw', nameRu: 'Варшава', lat: 52.2297, lon: 21.0122, level: 4 },
  { name: 'Stockholm', nameRu: 'Стокгольм', lat: 59.3293, lon: 18.0686, level: 4 },
  { name: 'Helsinki', nameRu: 'Хельсинки', lat: 60.1699, lon: 24.9384, level: 4 },
  { name: 'Kyiv', nameRu: 'Киев', lat: 50.4501, lon: 30.5234, level: 4 },
  { name: 'Ankara', nameRu: 'Анкара', lat: 39.9334, lon: 32.8597, level: 4 },
];

// Representative interior points (not centroids) so each name reads clearly over its landmass.
export const CONTINENT_LABELS = [
  { name: 'Europe', nameRu: 'Европа', lat: 50.0, lon: 15.0, level: 1 },
  { name: 'Asia', nameRu: 'Азия', lat: 45.0, lon: 90.0, level: 1 },
  { name: 'Africa', nameRu: 'Африка', lat: 5.0, lon: 20.0, level: 1 },
  { name: 'North America', nameRu: 'Северная Америка', lat: 45.0, lon: -100.0, level: 1 },
  { name: 'South America', nameRu: 'Южная Америка', lat: -15.0, lon: -60.0, level: 1 },
  { name: 'Australia', nameRu: 'Австралия', lat: -25.0, lon: 134.0, level: 1 },
  { name: 'Antarctica', nameRu: 'Антарктида', lat: -80.0, lon: 0.0, level: 1 },
];

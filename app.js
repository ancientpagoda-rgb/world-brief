const populationFormatter = new Intl.NumberFormat("en-US");
const DATA_URL = "./world-data.json";
const WEATHER_LAYER_DURATION_MS = 5200;
const WORLD_GEOJSON_URL = "https://unpkg.com/visionscarto-world-atlas@0.0.4/world/50m_countries.geojson";
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const WEATHER_GRID_LAT_STEP = 10;
const WEATHER_GRID_LON_STEP = 10;
const WEATHER_LAYERS = [
  { key: "wind", name: "Wind", detail: "Wind speed and direction." },
  { key: "rainfall", name: "Rain", detail: "Precipitation intensity." },
  { key: "temperature", name: "Temp", detail: "Surface temperature." },
  { key: "clouds", name: "Clouds", detail: "Cloud cover density." },
];

// --- Realistic starfield (HYG catalog) ---
const STAR_CATALOG = [];
const STARS_URL = "./stars.json";

async function loadStarCatalog() {
  try {
    const res = await fetch(STARS_URL);
    const data = await res.json();
    for (const s of data) {
      if (s.m < -20) continue; // skip Sun
      STAR_CATALOG.push({
        ra: s.ra,
        dec: s.dec,
        size: Math.max(0.25, 2.8 - s.m * 0.38),
        baseAlpha: Math.max(0.07, 1.0 - s.m * 0.14),
        r: s.r, g: s.g, b: s.b,
        phase: (s.ra * 13.7 + s.dec * 7.3) % 6.2832,
        speed: 0.3 + (s.m % 1) * 1.2,
      });
    }
  } catch (e) {
    console.warn("Failed to load star catalog");
  }
}

// --- Satellite earth texture ---
const EARTH_TEXTURE_URL = "https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg";
const NIGHT_TEXTURE_URL = "https://unpkg.com/three-globe@2.31.0/example/img/earth-night.jpg";
const earthTexture = { img: null };
const nightTexture = { img: null };

function loadEarthTexture() {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => { earthTexture.img = img; };
  img.src = EARTH_TEXTURE_URL;
}

function loadNightTexture() {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => { nightTexture.img = img; };
  img.onerror = () => { nightTexture.img = null; };
  img.src = NIGHT_TEXTURE_URL;
}

function renderEarthTexture(ctx, cx, cy, r, rotation) {
  const img = earthTexture.img;
  if (!img) return;
  const iw = img.width, ih = img.height;
  const halfIw = iw / 2;

  let srcX = (((rotation + Math.PI / 2) % (2 * Math.PI)) / (2 * Math.PI)) * iw;
  if (srcX < 0) srcX += iw;
  const wrap = srcX + halfIw > iw;

  for (let dy = -r; dy <= r; dy++) {
    const y = cy + dy;
    const sinP = dy / r;
    if (Math.abs(sinP) >= 1) continue;
    const cosP = Math.cos(Math.asin(sinP));
    const sw = Math.round(2 * r * cosP);
    if (sw < 2) continue;
    const sy = (Math.PI / 2 + Math.asin(sinP)) / Math.PI * ih;
    const dx = Math.round(cx - sw / 2);

    if (!wrap) {
      ctx.drawImage(img, srcX, sy, halfIw, 1, dx, y, sw, 1);
    } else {
      const w1 = Math.round(iw - srcX);
      const f = w1 / halfIw;
      const dw1 = Math.round(sw * f);
      if (dw1 > 0) {
        ctx.drawImage(img, srcX, sy, w1, 1, dx, y, dw1, 1);
        ctx.drawImage(img, 0, sy, halfIw - w1, 1, dx + dw1, y, sw - dw1, 1);
      } else {
        ctx.drawImage(img, 0, sy, halfIw, 1, dx, y, sw, 1);
      }
    }
  }
}

function renderNightTexture(ctx, cx, cy, r, rotation) {
  const img = nightTexture.img;
  if (!img) return;
  const iw = img.width, ih = img.height;
  const halfIw = iw / 2;

  let srcX = (((rotation + Math.PI / 2) % (2 * Math.PI)) / (2 * Math.PI)) * iw;
  if (srcX < 0) srcX += iw;
  const wrap = srcX + halfIw > iw;

  for (let dy = -r; dy <= r; dy++) {
    const y = cy + dy;
    const sinP = dy / r;
    if (Math.abs(sinP) >= 1) continue;
    const cosP = Math.cos(Math.asin(sinP));
    const sw = Math.round(2 * r * cosP);
    if (sw < 2) continue;
    const sy = (Math.PI / 2 + Math.asin(sinP)) / Math.PI * ih;
    const dx = Math.round(cx - sw / 2);

    if (!wrap) {
      ctx.drawImage(img, srcX, sy, halfIw, 1, dx, y, sw, 1);
    } else {
      const w1 = Math.round(iw - srcX);
      const f = w1 / halfIw;
      const dw1 = Math.round(sw * f);
      if (dw1 > 0) {
        ctx.drawImage(img, srcX, sy, w1, 1, dx, y, dw1, 1);
        ctx.drawImage(img, 0, sy, halfIw - w1, 1, dx + dw1, y, sw - dw1, 1);
      } else {
        ctx.drawImage(img, 0, sy, halfIw, 1, dx, y, sw, 1);
      }
    }
  }
}

// --- Solar system orbits (actual celestial positions) ---
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const OBLIQUITY = 23.439292 * Math.PI / 180;

const PLANET_ORBITS = [
  { name: 'Mercury', L: 252.250906, a: 0.387098, e: 0.205635, i: 7.004979, w: 77.457796, O: 48.330765, n: 4.092334, c: [210, 200, 180], s: 1.8 },
  { name: 'Venus',   L: 181.979801, a: 0.723332, e: 0.006772, i: 3.394662, w: 131.767557, O: 76.679843, n: 1.602130, c: [245, 235, 205], s: 3.5 },
  { name: 'Mars',    L: 355.453000, a: 1.523679, e: 0.093401, i: 1.849726, w: 336.060234, O: 49.558093, n: 0.524033, c: [230, 165, 125], s: 2.5 },
  { name: 'Jupiter', L: 34.351484,  a: 5.202603, e: 0.048498, i: 1.303267, w: 14.331309,  O: 100.464441, n: 0.083085, c: [225, 205, 170], s: 4.2 },
  { name: 'Saturn',  L: 49.317954,  a: 9.554909, e: 0.055546, i: 2.488879, w: 93.056787,  O: 113.665502, n: 0.033444, c: [215, 205, 175], s: 3.2 },
  { name: 'Uranus',  L: 313.232324, a: 19.218446, e: 0.046295, i: 0.773125, w: 173.005291, O: 74.005957, n: 0.011730, c: [180, 210, 230], s: 2.2 },
  { name: 'Neptune', L: 304.867234, a: 30.110387, e: 0.008986, i: 1.769953, w: 48.120276, O: 131.784226, n: 0.005981, c: [150, 185, 235], s: 2.0 },
];

const EARTH_ORBIT = { L: 100.466, a: 1.000001, e: 0.016708, i: 0, w: 282.938, O: 0, n: 0.9856 };

function heliocentricPos(d, body) {
  const M = ((body.L - body.w + body.n * d) % 360) * Math.PI / 180;
  let E = M;
  for (let i = 5; i--;)
    E -= (E - body.e * Math.sin(E) - M) / (1 - body.e * Math.cos(E));
  const xp = body.a * (Math.cos(E) - body.e);
  const yp = body.a * Math.sqrt(1 - body.e * body.e) * Math.sin(E);
  const wR = body.w * Math.PI / 180, OR = body.O * Math.PI / 180, iR = body.i * Math.PI / 180;
  const cW = Math.cos(wR), sW = Math.sin(wR), cO = Math.cos(OR), sO = Math.sin(OR), cI = Math.cos(iR), sI = Math.sin(iR);
  return {
    x: (cW * cO - sW * sO * cI) * xp + (-sW * cO - cW * sO * cI) * yp,
    y: (cW * sO + sW * cO * cI) * xp + (-sW * sO + cW * cO * cI) * yp,
    z: (sW * sI) * xp + (cW * sI) * yp,
  };
}

function eclipticToEq(lon, lat) {
  const sl = Math.sin(lon);
  return {
    ra: Math.atan2(sl * Math.cos(OBLIQUITY) - Math.tan(lat) * Math.sin(OBLIQUITY), Math.cos(lon)),
    dec: Math.asin(Math.sin(lat) * Math.cos(OBLIQUITY) + Math.cos(lat) * Math.sin(OBLIQUITY) * sl),
  };
}

let celestialBodies = null;
let celestialEpoch = 0;

function computeCelestialBodies() {
  const d = (Date.now() - J2000_MS) / 86400000;
  const earth = heliocentricPos(d, EARTH_ORBIT);
  const bodies = [];

  const sgx = -earth.x, sgy = -earth.y, sgz = -earth.z;
  const sd = Math.sqrt(sgx * sgx + sgy * sgy + sgz * sgz);
  const sl = Math.atan2(sgy, sgx);
  const sa = Math.asin(sgz / sd);
  const se = eclipticToEq(sl, sa);
  if (se.ra < 0) se.ra += 2 * Math.PI;
  bodies.push({ name: 'Sun', ra: se.ra, dec: se.dec, c: [255, 245, 230], s: 28, sun: true });

  for (const p of PLANET_ORBITS) {
    const pos = heliocentricPos(d, p);
    const gx = pos.x - earth.x, gy = pos.y - earth.y, gz = pos.z - earth.z;
    const gd = Math.sqrt(gx * gx + gy * gy + gz * gz);
    const lon = Math.atan2(gy, gx);
    const lat = Math.asin(gz / gd);
    const eq = eclipticToEq(lon, lat);
    if (eq.ra < 0) eq.ra += 2 * Math.PI;
    bodies.push({ name: p.name, ra: eq.ra, dec: eq.dec, c: p.c, s: p.s });
  }

  return bodies;
}

function getCelestialBodies() {
  const now = Date.now();
  if (!celestialBodies || now - celestialEpoch > 600000) {
    celestialBodies = computeCelestialBodies();
    celestialEpoch = now;
  }
  return celestialBodies;
}

const CITIES = [
  [35.68, 139.65, 37], [34.69, 135.50, 19], [37.57, 126.98, 10],
  [31.23, 121.47, 28], [39.90, 116.41, 22], [23.13, 113.26, 25],
  [22.54, 114.06, 12], [25.03, 121.56, 8], [30.57, 104.07, 16],
  [29.56, 106.55, 15], [36.07, 120.38, 9], [45.75, 126.63, 11],
  [28.70, 77.10, 32], [19.08, 72.88, 21], [22.57, 88.36, 15],
  [12.97, 77.59, 12], [13.08, 80.27, 10], [17.39, 78.49, 9],
  [23.81, 90.41, 23], [24.86, 67.01, 16], [31.55, 74.34, 13],
  [33.68, 73.05, 2], [13.76, 100.50, 11], [14.60, 120.98, 14],
  [-6.21, 106.85, 11], [1.35, 103.82, 6], [10.82, 106.63, 9],
  [3.14, 101.69, 8], [16.84, 96.13, 5], [21.03, 105.85, 8],
  [41.01, 28.98, 15], [35.69, 51.39, 9], [33.32, 44.38, 7],
  [24.71, 46.68, 8], [25.20, 55.27, 3], [21.49, 39.19, 4],
  [30.04, 31.24, 22], [6.52, 3.38, 21],
  [55.76, 37.62, 12], [59.93, 30.34, 5], [50.45, 30.52, 3],
  [51.51, -0.13, 14], [48.86, 2.35, 11], [52.52, 13.41, 4],
  [40.42, -3.70, 6], [41.90, 12.50, 4], [45.46, 9.19, 3],
  [41.39, 2.17, 5], [52.37, 4.89, 2], [50.85, 4.35, 2],
  [48.21, 16.37, 2], [52.23, 21.01, 2], [38.72, -9.14, 3],
  [37.98, 23.73, 4], [53.35, -6.26, 2],
  [40.71, -74.01, 20], [34.05, -118.24, 13], [41.88, -87.63, 9],
  [43.65, -79.38, 6], [19.43, -99.13, 22], [20.68, -103.35, 5],
  [25.76, -80.19, 6], [29.76, -95.37, 7], [32.78, -96.81, 7],
  [42.36, -71.06, 5], [47.61, -122.33, 4], [49.28, -123.12, 3],
  [38.91, -77.04, 6], [33.75, -84.39, 6], [45.50, -73.57, 4],
  [-23.55, -46.63, 22], [-22.91, -43.17, 13], [-34.60, -58.38, 15],
  [-33.45, -70.65, 7], [-12.05, -77.04, 10], [4.71, -74.07, 11],
  [10.48, -66.90, 6], [-15.79, -47.86, 4], [-19.92, -43.94, 6],
  [-4.44, 15.27, 15], [-26.20, 28.05, 6], [-33.92, 18.42, 5],
  [-1.29, 36.82, 5], [9.03, 38.75, 5], [5.60, -0.19, 5],
  [14.72, -17.47, 4], [15.55, 32.53, 5],
  [-33.87, 151.21, 5], [-37.81, 144.96, 5], [-27.47, 153.03, 2],
  [-31.95, 115.86, 2],
];

const weatherOrbState = {
  features: [],
  loading: false,
  loaded: false,
  weatherGrid: new Map(),
  weatherTimestamp: "",
  weatherSource: "Synthetic fallback",
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function mixColor(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

function rgba(color, alpha) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function hash2D(x, y) {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) & 0x7fffffff) / 0x7fffffff;
}

function smoothNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash2D(ix, iy), hash2D(ix + 1, iy), sx), lerp(hash2D(ix, iy + 1), hash2D(ix + 1, iy + 1), sx), sy);
}

function normalizeLongitude(lon) {
  let normalized = lon;
  while (normalized < -180) normalized += 360;
  while (normalized > 180) normalized -= 360;
  return normalized;
}

function buildWeatherGridCoordinates() {
  const latitudes = [];
  const longitudes = [];

  for (let lat = -75; lat <= 75; lat += WEATHER_GRID_LAT_STEP) {
    for (let lon = -180; lon < 180; lon += WEATHER_GRID_LON_STEP) {
      latitudes.push(lat);
      longitudes.push(lon);
    }
  }

  return { latitudes, longitudes };
}

function getGridKey(lat, lon) {
  return `${lat}:${lon}`;
}

function snapLatitude(lat) {
  return clamp(
    Math.round(lat / WEATHER_GRID_LAT_STEP) * WEATHER_GRID_LAT_STEP,
    -75,
    75,
  );
}

function snapLongitude(lon) {
  let snapped = Math.round(normalizeLongitude(lon) / WEATHER_GRID_LON_STEP) * WEATHER_GRID_LON_STEP;
  if (snapped >= 180) snapped -= 360;
  if (snapped < -180) snapped += 360;
  return snapped;
}

function getWeatherLayerNodes() {
  return {
    canvas: document.querySelector("#weather-orb-canvas"),
    name: document.querySelector("#weather-layer-name"),
    detail: document.querySelector("#weather-layer-detail"),
    source: document.querySelector("#weather-hud-source"),
    updated: document.querySelector("#weather-hud-updated"),
    temp: document.querySelector("#weather-hud-temp"),
    wind: document.querySelector("#weather-hud-wind"),
    rain: document.querySelector("#weather-hud-rain"),
  };
}

function simplifyRing(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return [];
  const step = ring.length > 220 ? 4 : ring.length > 120 ? 3 : ring.length > 48 ? 2 : 1;
  const simplified = [];
  for (let index = 0; index < ring.length; index += step) {
    simplified.push(ring[index]);
  }
  const last = ring[ring.length - 1];
  const first = simplified[0];
  if (
    simplified.length &&
    (first[0] !== last[0] || first[1] !== last[1])
  ) {
    simplified.push(last);
  }
  return simplified;
}

function preprocessWorldGeometry(geojson) {
  if (!geojson?.features) return [];

  return geojson.features
    .flatMap((feature) => {
      const geometry = feature?.geometry;
      if (!geometry) return [];
      if (geometry.type === "Polygon") return [geometry.coordinates.map(simplifyRing)];
      if (geometry.type === "MultiPolygon") {
        return geometry.coordinates.map((polygon) => polygon.map(simplifyRing));
      }
      return [];
    })
    .filter(Boolean);
}

async function loadWeatherGeometry() {
  if (weatherOrbState.loading || weatherOrbState.loaded) return;
  weatherOrbState.loading = true;

  try {
    const response = await fetch(WORLD_GEOJSON_URL);
    const geojson = await response.json();
    weatherOrbState.features = preprocessWorldGeometry(geojson);
    weatherOrbState.loaded = true;
  } catch (_error) {
    weatherOrbState.features = [];
    weatherOrbState.loaded = false;
  } finally {
    weatherOrbState.loading = false;
  }
}

async function loadLiveWeatherGrid() {
  const { latitudes, longitudes } = buildWeatherGridCoordinates();
  const url = new URL(OPEN_METEO_URL);
  url.searchParams.set("latitude", latitudes.join(","));
  url.searchParams.set("longitude", longitudes.join(","));
  url.searchParams.set(
    "current",
    "temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m",
  );
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("forecast_days", "1");

  const response = await fetch(url.toString());
  const payload = await response.json();
  if (!Array.isArray(payload)) return;

  const grid = new Map();
  payload.forEach((entry) => {
    const lat = snapLatitude(entry.latitude);
    const lon = snapLongitude(entry.longitude);
    const current = entry.current || {};
    grid.set(
      getGridKey(lat, lon),
      {
        temperature: current.temperature_2m,
        precipitation: current.precipitation,
        cloudCover: current.cloud_cover,
        windSpeed: current.wind_speed_10m,
        windDirection: current.wind_direction_10m,
      },
    );
    if (!weatherOrbState.weatherTimestamp && current.time) {
      weatherOrbState.weatherTimestamp = current.time;
    }
  });

  if (grid.size) {
    weatherOrbState.weatherGrid = grid;
    weatherOrbState.weatherSource = "Live weather grid · Open-Meteo";
  }
}

function latLonProjection(latDeg, lonDeg, rotation) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180 + rotation;
  const x = Math.cos(lat) * Math.sin(lon);
  const y = Math.sin(lat);
  const z = Math.cos(lat) * Math.cos(lon);
  return { x, y, z, lat, lon };
}

function sampleTemperature(latDeg, lonDeg, timeMs) {
  const v = interpolateGridField(latDeg, lonDeg, "temperature");
  if (v != null) return clamp((v + 35) / 80, 0, 1);
  const live = getLiveWeatherPoint(latDeg, lonDeg);
  if (live && typeof live.temperature === "number") return clamp((live.temperature + 35) / 80, 0, 1);
  return null;
}

function sampleRainfall(latDeg, lonDeg, timeMs) {
  const v = interpolateGridField(latDeg, lonDeg, "precipitation");
  if (v != null) return clamp(v / 5, 0, 1);
  const live = getLiveWeatherPoint(latDeg, lonDeg);
  if (live && typeof live.precipitation === "number") return clamp(live.precipitation / 5, 0, 1);
  return null;
}

function sampleClouds(latDeg, lonDeg, timeMs) {
  const v = interpolateGridField(latDeg, lonDeg, "cloudCover");
  if (v != null) return clamp(v / 100, 0, 1);
  const live = getLiveWeatherPoint(latDeg, lonDeg);
  if (live && typeof live.cloudCover === "number") return clamp(live.cloudCover / 100, 0, 1);
  return null;
}

function sampleWind(latDeg, lonDeg, timeMs) {
  const speed = interpolateGridField(latDeg, lonDeg, "windSpeed");
  const dir = interpolateGridField(latDeg, lonDeg, "windDirection");
  if (speed != null && dir != null) {
    const cs = clamp(speed / 18, 0.12, 1.2);
    const rad = ((dir + 180) * Math.PI) / 180;
    return { zonal: Math.sin(rad) * cs, meridional: Math.cos(rad) * cs, speed: cs };
  }
  const live = getLiveWeatherPoint(latDeg, lonDeg);
  if (live && typeof live.windSpeed === "number" && typeof live.windDirection === "number") {
    const cs = clamp(live.windSpeed / 18, 0.12, 1.2);
    const rad = ((live.windDirection + 180) * Math.PI) / 180;
    return { zonal: Math.sin(rad) * cs, meridional: Math.cos(rad) * cs, speed: cs };
  }
  return null;
}

function getTemperatureColor(value) {
  if (value < 0.33) return mixColor([78, 126, 255], [82, 224, 255], value / 0.33);
  if (value < 0.66) return mixColor([82, 224, 255], [255, 222, 92], (value - 0.33) / 0.33);
  return mixColor([255, 222, 92], [255, 98, 92], (value - 0.66) / 0.34);
}

function getRainColor(value) {
  return mixColor([40, 102, 168], [117, 221, 255], clamp(value, 0, 1));
}

function getCloudColor(value) {
  return mixColor([110, 136, 156], [240, 247, 255], clamp(value, 0, 1));
}

function getLiveWeatherPoint(latDeg, lonDeg) {
  if (!weatherOrbState.weatherGrid.size) return null;
  const lat = snapLatitude(latDeg);
  const lon = snapLongitude(lonDeg);
  return weatherOrbState.weatherGrid.get(getGridKey(lat, lon)) || null;
}

function interpolateGridField(latDeg, lonDeg, field) {
  if (!weatherOrbState.weatherGrid.size) return null;
  const grid = weatherOrbState.weatherGrid;
  const step = WEATHER_GRID_LAT_STEP;

  const lat0 = snapLatitude(latDeg - step / 2);
  const lat1 = snapLatitude(latDeg + step / 2);
  const lon0 = snapLongitude(lonDeg - step / 2);
  const lon1 = snapLongitude(lonDeg + step / 2);

  if (lat0 === lat1 && lon0 === lon1) {
    const p = grid.get(getGridKey(lat0, lon0));
    return p ? p[field] ?? null : null;
  }

  const gv = (lat, lon) => {
    const p = grid.get(getGridKey(lat, lon));
    return p ? p[field] ?? null : null;
  };

  let fx, latT, latB;
  if (lat0 <= lat1) { fx = (latDeg - lat0) / (lat1 - lat0); latT = lat0; latB = lat1; }
  else { fx = (latDeg - lat1) / (lat0 - lat1); latT = lat1; latB = lat0; }
  fx = clamp(fx, 0, 1);

  let fy, lonL, lonR;
  if (lon0 <= lon1) { fy = (lonDeg - lon0) / (lon1 - lon0); lonL = lon0; lonR = lon1; }
  else { fy = (lonDeg - lon0) / (lon1 + 360 - lon0); lonL = lon0; lonR = lon1; }
  fy = clamp(fy, 0, 1);

  const v00 = gv(latT, lonL);
  const v10 = gv(latB, lonL);
  const v01 = gv(latT, lonR);
  const v11 = gv(latB, lonR);

  const lerpV = (a, b, t) => {
    if (a == null && b == null) return null;
    if (a == null) return b;
    if (b == null) return a;
    return a + (b - a) * t;
  };

  const top = lerpV(v00, v01, fy);
  const bot = lerpV(v10, v11, fy);
  if (top == null && bot == null) return null;
  return lerpV(top, bot, fx);
}

function getWeatherSummary() {
  if (!weatherOrbState.weatherGrid.size) return null;

  let tempTotal = 0;
  let windTotal = 0;
  let maxRain = 0;
  let count = 0;

  weatherOrbState.weatherGrid.forEach((point) => {
    if (typeof point.temperature === "number") tempTotal += point.temperature;
    if (typeof point.windSpeed === "number") windTotal += point.windSpeed;
    if (typeof point.precipitation === "number") maxRain = Math.max(maxRain, point.precipitation);
    count += 1;
  });

  if (!count) return null;
  return {
    averageTemp: tempTotal / count,
    averageWind: windTotal / count,
    maxRain,
  };
}

function drawLayerField(ctx, layerKey, alpha, rotation, radius, centerX, centerY, timeMs) {
  if (alpha <= 0) return;
  const a = alpha;

  if (layerKey === "temperature") {
    for (let lat = -76; lat <= 76; lat += 2) {
      for (let lon = -180; lon < 180; lon += 2) {
        const point = latLonProjection(lat, lon, rotation);
        if (point.z <= 0) continue;
        const x = centerX + point.x * radius;
        const y = centerY - point.y * radius;
        const value = sampleTemperature(lat, lon, timeMs);
        if (value === null) continue;
        ctx.fillStyle = rgba(getTemperatureColor(value), a * (0.2 + value * 0.6));
        ctx.beginPath();
        ctx.arc(x, y, lerp(2, 4.5, point.z), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (layerKey === "rainfall") {
    for (let lat = -76; lat <= 76; lat += 3) {
      for (let lon = -180; lon < 180; lon += 3) {
        const point = latLonProjection(lat, lon, rotation);
        if (point.z <= 0) continue;
        let value = sampleRainfall(lat, lon, timeMs);
        if (value === null || value < 0.1) continue;
        const x = centerX + point.x * radius;
        const y = centerY - point.y * radius;
        const intensity = value;
        const size = lerp(2.5, 5, point.z);
        ctx.fillStyle = rgba(getRainColor(value), a * (0.12 + intensity * 0.5));
        ctx.beginPath();
        ctx.arc(x, y, size * 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (layerKey === "clouds") {
    for (let lat = -76; lat <= 76; lat += 2) {
      for (let lon = -180; lon < 180; lon += 2) {
        const point = latLonProjection(lat, lon, rotation);
        if (point.z <= 0) continue;
        const value = sampleClouds(lat, lon, timeMs);
        if (value === null || value < 0.22) continue;
        const x = centerX + point.x * radius;
        const y = centerY - point.y * radius;
        const s = lerp(3, 7, point.z);
        ctx.fillStyle = rgba(getCloudColor(value), a * (0.1 + value * 0.4));
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (layerKey === "wind") {
    ctx.lineCap = "round";
    for (let lat = -72; lat <= 72; lat += 6) {
      for (let lon = -175; lon < 175; lon += 8) {
        const startWind = sampleWind(lat, lon, timeMs);
        if (!startWind) continue;
        const start = latLonProjection(lat, lon, rotation);
        if (start.z <= 0) continue;
        ctx.beginPath();
        let first = true;
        let clat = lat, clon = lon;
        for (let s = 0; s < 10; s++) {
          const p = latLonProjection(clat, clon, rotation);
          if (p.z <= -0.05) break;
          const sx = centerX + p.x * radius;
          const sy = centerY - p.y * radius;
          if (first) { ctx.moveTo(sx, sy); first = false; }
          else { ctx.lineTo(sx, sy); }
          const w = sampleWind(clat, clon, timeMs);
          if (!w) break;
          const lf = 1 / Math.cos(clat * Math.PI / 180 + 0.01);
          clat += -w.meridional * 1.3;
          clon += w.zonal * 1.3 * lf;
          if (Math.abs(clat) > 85) break;
        }
        ctx.strokeStyle = rgba([80, 220, 255], a * (0.06 + startWind.speed * 0.22));
        ctx.lineWidth = lerp(0.4, 1.3, startWind.speed);
        ctx.stroke();
      }
    }
  }
}

function drawWorldGeometry(ctx, rotation, radius, centerX, centerY) {
  if (!weatherOrbState.features.length) return false;

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (const polygon of weatherOrbState.features) {
    for (const [ringIndex, ring] of polygon.entries()) {
      let started = false;
      ctx.beginPath();
      for (const [lon, lat] of ring) {
        const point = latLonProjection(lat, lon, rotation);
        if (point.z <= -0.12) {
          started = false;
          continue;
        }
        const x = centerX + point.x * radius;
        const y = centerY - point.y * radius;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      if (started) {
        ctx.strokeStyle = ringIndex === 0
          ? "rgba(180, 200, 220, 0.30)"
          : "rgba(140, 170, 200, 0.12)";
        ctx.lineWidth = ringIndex === 0 ? 0.8 : 0.3;
        ctx.stroke();
      }
    }
  }

  return true;
}

let nightOffscreen = null;

function getNightOffscreen(w, h) {
  if (!nightOffscreen || nightOffscreen.width !== w || nightOffscreen.height !== h) {
    nightOffscreen = document.createElement('canvas');
    nightOffscreen.width = w;
    nightOffscreen.height = h;
  }
  return nightOffscreen;
}

let globeRotation = 0;
let globePrevTime = 0;
let globeDrag = { active: false, startX: 0, startRotation: 0 };

function setupGlobeInteraction(canvas) {
  const onStart = (clientX) => {
    globeDrag.active = true;
    globeDrag.startX = clientX;
    globeDrag.startRotation = globeRotation;
  };
  const onMove = (clientX) => {
    if (!globeDrag.active) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const dx = clientX - globeDrag.startX;
    globeRotation = globeDrag.startRotation - (dx / w) * Math.PI * 2;
  };
  const onEnd = () => { globeDrag.active = false; };

  canvas.addEventListener("mousedown", (e) => onStart(e.clientX));
  window.addEventListener("mousemove", (e) => onMove(e.clientX));
  window.addEventListener("mouseup", onEnd);

  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) onStart(e.touches[0].clientX);
  }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches.length === 1) onMove(e.touches[0].clientX);
  }, { passive: true });
  canvas.addEventListener("touchend", onEnd, { passive: true });
}

function updateGlobeRotation(timeMs) {
  if (!globeDrag.active) {
    if (globePrevTime) {
      globeRotation += (timeMs - globePrevTime) * 0.00018;
    }
  }
  globePrevTime = timeMs;
}

function drawWeatherOrbFrame(ctx, canvas, timeMs) {
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.34;
  const cycle = timeMs / WEATHER_LAYER_DURATION_MS;
  const currentIndex = Math.floor(cycle) % WEATHER_LAYERS.length;
  const nextIndex = (currentIndex + 1) % WEATHER_LAYERS.length;
  const transition = smoothstep(cycle % 1);
  const currentLayer = WEATHER_LAYERS[currentIndex];
  const nextLayer = WEATHER_LAYERS[nextIndex];

  ctx.clearRect(0, 0, width, height);
  updateGlobeRotation(timeMs);
  const rotation = globeRotation;
  const moonAngle = timeMs * 0.00003;
  const moonDist = radius * 2;
  const moonX = centerX + Math.cos(moonAngle) * moonDist;
  const moonY = centerY + Math.sin(moonAngle) * moonDist * 0.6 - radius * 0.6;
  const moonToCenter = Math.sqrt((moonX - centerX) ** 2 + (moonY - centerY) ** 2);
  if (moonToCenter > radius * 1.1) {
    const mg = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 15);
    mg.addColorStop(0, "rgba(255, 250, 240, 0.2)");
    mg.addColorStop(1, "rgba(255, 250, 240, 0)");
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(225, 220, 210, 0.85)";
    ctx.beginPath();
    ctx.arc(moonX, moonY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#040a12";
    ctx.beginPath();
    ctx.arc(moonX + 1.8, moonY - 0.5, 5.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.clip();

  renderEarthTexture(ctx, centerX, centerY, radius, rotation);

  // Earth core glow (concentric internal layers)
  const coreLayers = [
    { inner: 0.00, outer: 0.19, c: [255, 240, 180], a: 0.10 },
    { inner: 0.19, outer: 0.55, c: [255, 180, 80], a: 0.06 },
    { inner: 0.55, outer: 0.98, c: [200, 100, 50], a: 0.04 },
  ];
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const l of coreLayers) {
    const g = ctx.createRadialGradient(centerX, centerY, radius * l.inner, centerX, centerY, radius * l.outer);
    g.addColorStop(0, rgba(l.c, l.a));
    g.addColorStop(0.5, rgba(l.c, l.a * 0.5));
    g.addColorStop(1, rgba(l.c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * l.outer, 0, Math.PI * 2);
    ctx.arc(centerX, centerY, radius * l.inner, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  drawWorldGeometry(ctx, rotation, radius, centerX, centerY);

  const shade = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(0.75, "rgba(0, 0, 0, 0.05)");
  shade.addColorStop(1, "rgba(0, 0, 0, 0.20)");
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  for (let lat = -76; lat <= 76; lat += 3) {
    for (let lon = -180; lon < 180; lon += 3) {
      const point = latLonProjection(lat, lon, rotation);
      if (point.z <= 0) continue;
      const cv = sampleClouds(lat, lon, timeMs);
      if (cv < 0.3) continue;
      const x = centerX + point.x * radius;
      const y = centerY - point.y * radius;
      ctx.fillStyle = `rgba(0, 0, 0, ${0.035 * cv})`;
      ctx.beginPath();
      ctx.arc(x + lerp(1, 3, cv), y + lerp(1, 3, cv), lerp(2.5, 6, point.z) * cv, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.strokeStyle = "rgba(120, 160, 200, 0.06)";
  ctx.lineWidth = 0.6;
  for (let lat = -60; lat <= 60; lat += 30) {
    ctx.beginPath();
    let started = false;
    for (let lon = -180; lon <= 180; lon += 3) {
      const point = latLonProjection(lat, lon, rotation);
      if (point.z <= 0) { started = false; continue; }
      const x = centerX + point.x * radius;
      const y = centerY - point.y * radius;
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawLayerField(ctx, currentLayer.key, 1 - transition * 0.55, rotation, radius, centerX, centerY, timeMs);
  drawLayerField(ctx, nextLayer.key, transition * 0.9, rotation, radius, centerX, centerY, timeMs);

  const nightGrad = ctx.createLinearGradient(centerX - radius * 0.5, centerY, centerX + radius * 0.2, centerY);
  nightGrad.addColorStop(0, "rgba(3, 5, 18, 0.88)");
  nightGrad.addColorStop(0.4, "rgba(3, 5, 18, 0.65)");
  nightGrad.addColorStop(0.7, "rgba(3, 5, 18, 0.25)");
  nightGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = nightGrad;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  if (nightTexture.img) {
    const nc = getNightOffscreen(canvas.width, canvas.height);
    const nctx = nc.getContext("2d");
    nctx.clearRect(0, 0, nc.width, nc.height);

    nctx.save();
    nctx.beginPath();
    nctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    nctx.clip();
    renderNightTexture(nctx, centerX, centerY, radius, rotation);
    nctx.restore();

    const maskGrad = nctx.createLinearGradient(centerX - radius * 0.5, centerY, centerX + radius * 0.2, centerY);
    maskGrad.addColorStop(0, "rgba(255, 255, 255, 0.88)");
    maskGrad.addColorStop(0.4, "rgba(255, 255, 255, 0.65)");
    maskGrad.addColorStop(0.7, "rgba(255, 255, 255, 0.25)");
    maskGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
    nctx.globalCompositeOperation = "destination-in";
    nctx.fillStyle = maskGrad;
    nctx.fillRect(0, 0, nc.width, nc.height);
    nctx.globalCompositeOperation = "source-over";

    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(nc, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  } else {
    for (const [clat, clon, cpop] of CITIES) {
      const point = latLonProjection(clat, clon, rotation);
      if (point.z <= 0 || point.x >= 0) continue;
      const sx = centerX + point.x * radius;
      const sy = centerY - point.y * radius;
      const popFactor = Math.log2(cpop + 1) / 5.5;
      const glowR = lerp(2.5, 9, popFactor) * (0.65 + 0.35 * point.z);
      const coreR = lerp(0.4, 2.2, popFactor) * (0.65 + 0.35 * point.z);
      const twinkle = 0.8 + 0.2 * Math.sin(timeMs * 0.001 * (7 + cpop % 13) + clon);
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
      glow.addColorStop(0, `rgba(255, 245, 210, ${0.35 * twinkle})`);
      glow.addColorStop(0.4, `rgba(255, 220, 160, ${0.12 * twinkle})`);
      glow.addColorStop(1, "rgba(255, 220, 160, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 250, 235, ${0.75 * twinkle})`;
      ctx.beginPath();
      ctx.arc(sx, sy, coreR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const sign of [1, -1]) {
    for (let lat = 62; lat <= 82; lat += 1.5) {
      for (let lon = -180; lon < 180; lon += 3) {
        const point = latLonProjection(lat * sign, lon, rotation);
        if (point.z <= 0 || point.x >= 0) continue;
        const sx = centerX + point.x * radius;
        const sy = centerY - point.y * radius;
        const nx = lon * 0.05 + timeMs * 0.00007;
        const ny = lat * 0.04 + timeMs * 0.00004;
        const c1 = smoothNoise(nx, ny);
        const c2 = smoothNoise(nx * 0.5 + 10, ny * 0.5 + 10);
        const curtain = c1 * 0.5 + c2 * 0.5;
        const intensity = curtain * 0.65 - 0.08;
        if (intensity <= 0) continue;
        const g = Math.round(50 + 200 * intensity);
        const r = Math.round(5 + 30 * intensity * smoothNoise(nx + 5, ny));
        const b = Math.round(20 + 60 * intensity * smoothNoise(ny + 5, nx));
        ctx.fillStyle = rgba([r, g, b], 0.22 * intensity);
        ctx.fillRect(sx - 1.5, sy - 1, 3, 2);
      }
    }
  }

  ctx.restore();

  ctx.strokeStyle = "rgba(120, 190, 255, 0.18)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

}

function renderStarfield(timeMs) {
  const canvas = document.getElementById("starfield-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(window.innerWidth);
  const h = Math.round(window.innerHeight);
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Milky Way glow at correct celestial position
  const bodies = getCelestialBodies();
  const raOffset = bodies.length ? (bodies[0].ra - 1.5 * Math.PI) : 0;

  // Milky Way glow at correct celestial position
  const glowA = 0.007 + 0.005 * Math.sin(timeMs * 0.00004);

  for (let ra = 0; ra < 2 * Math.PI; ra += 0.06) {
    const mwDec = Math.atan(-1.966 * Math.cos(ra - 3.366));
    let nra = ((ra - raOffset) % (2 * Math.PI)) / (2 * Math.PI);
    if (nra < 0) nra += 1;
    const cx = nra * canvas.width;
    const cy = (0.5 - mwDec / Math.PI) * canvas.height;
    if (cx < -200 || cx > canvas.width + 200 || cy < -200 || cy > canvas.height + 200) continue;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, 160 * dpr);
    gr.addColorStop(0, `rgba(160, 175, 220, ${glowA})`);
    gr.addColorStop(1, "rgba(160, 175, 220, 0)");
    ctx.fillStyle = gr;
    ctx.fillRect(cx - 160 * dpr, cy - 160 * dpr, 320 * dpr, 320 * dpr);
  }

  // Stars from HYG catalog

  let i = STAR_CATALOG.length;
  while (i--) {
    const s = STAR_CATALOG[i];
    const twinkle = 0.65 + 0.35 * Math.sin(timeMs * 0.001 * s.speed + s.phase);
    const alpha = s.baseAlpha * twinkle;
    if (alpha < 0.01) continue;

    let nra = ((s.ra - raOffset) % (2 * Math.PI)) / (2 * Math.PI);
    if (nra < 0) nra += 1;
    const sx = nra * canvas.width;
    const sy = (0.5 - s.dec / Math.PI) * canvas.height;
    if (sx < -5 || sx > canvas.width + 5 || sy < -5 || sy > canvas.height + 5) continue;

    ctx.fillStyle = `rgba(${s.r},${s.g},${s.b},${alpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, s.size * dpr, 0, 6.2832);
    ctx.fill();
  }

  // Sun and planets at actual celestial positions
  if (bodies.length) {
    for (const b of bodies) {
      let nra = ((b.ra - raOffset) % (2 * Math.PI)) / (2 * Math.PI);
      if (nra < 0) nra += 1;
      const bx = nra * canvas.width;
      const by = (0.5 - b.dec / Math.PI) * canvas.height;
      if (bx < -100 || bx > canvas.width + 100 || by < -100 || by > canvas.height + 100) continue;

      if (b.sun) {
        const gr1 = ctx.createRadialGradient(bx, by, 0, bx, by, b.s * 8 * dpr);
        gr1.addColorStop(0, "rgba(255, 250, 240, 0.04)");
        gr1.addColorStop(1, "rgba(255, 250, 240, 0)");
        ctx.fillStyle = gr1;
        ctx.fillRect(bx - b.s * 8 * dpr, by - b.s * 8 * dpr, b.s * 16 * dpr, b.s * 16 * dpr);

        const gr2 = ctx.createRadialGradient(bx, by, 0, bx, by, b.s * 2.5 * dpr);
        gr2.addColorStop(0, "rgba(255, 250, 235, 0.25)");
        gr2.addColorStop(0.5, "rgba(255, 240, 220, 0.08)");
        gr2.addColorStop(1, "rgba(255, 240, 220, 0)");
        ctx.fillStyle = gr2;
        ctx.fillRect(bx - b.s * 2.5 * dpr, by - b.s * 2.5 * dpr, b.s * 5 * dpr, b.s * 5 * dpr);

        const coreEnd = 1 - 3 / (b.s * dpr);
        const gr3 = ctx.createRadialGradient(bx, by, 0, bx, by, b.s * dpr);
        gr3.addColorStop(0, "rgba(255, 250, 240, 1)");
        gr3.addColorStop(coreEnd * 0.5, "rgba(255, 245, 230, 0.95)");
        gr3.addColorStop(coreEnd, "rgba(255, 240, 215, 0.3)");
        gr3.addColorStop(1, "rgba(255, 240, 215, 0)");
        ctx.fillStyle = gr3;
        ctx.beginPath();
        ctx.arc(bx, by, b.s * dpr, 0, 6.2832);
        ctx.fill();
      } else {
        const glow = ctx.createRadialGradient(bx, by, 0, bx, by, b.s * 3 * dpr);
        glow.addColorStop(0, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0.2)`);
        glow.addColorStop(1, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(bx - b.s * 3 * dpr, by - b.s * 3 * dpr, b.s * 6 * dpr, b.s * 6 * dpr);

        ctx.fillStyle = `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0.85)`;
        ctx.beginPath();
        ctx.arc(bx, by, b.s * dpr, 0, 6.2832);
        ctx.fill();
      }
    }
  }
}

function initializeWeatherOrb() {
  const { canvas } = getWeatherLayerNodes();
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  loadEarthTexture();
  loadNightTexture();
  loadStarCatalog();
  loadWeatherGeometry();
  loadLiveWeatherGrid().catch(() => {
    weatherOrbState.weatherSource = "Synthetic fallback";
  });

  setupGlobeInteraction(canvas);

  const render = (timestamp) => {
    renderStarfield(timestamp);
    drawWeatherOrbFrame(ctx, canvas, timestamp);
    window.requestAnimationFrame(render);
  };

  window.requestAnimationFrame(render);
}

function renderCountries(countries) {
  const root = document.querySelector("#country-list");
  const items = [];

  countries.forEach((item, index) => {
    const desc = item.description || "";
    const descClamped = desc.length > 280 ? desc.slice(0, 277) + "..." : desc;
    items.push(`
        <article class="country-row">
          <div class="country-rank">#${index + 1}</div>
          <div>
            <p class="country-headline">${escapeHtml(item.name)}</p>
            <span class="country-code">${escapeHtml(item.iso3)}</span>
            <p class="country-news">${escapeHtml(item.headline || "No headline.")}</p>
            ${descClamped ? `<p class="country-description">${escapeHtml(descClamped)}</p>` : ""}
          </div>
          <div class="country-population">
            ${populationFormatter.format(item.population)}
            <span>${escapeHtml(item.year)}</span>
          </div>
        </article>
      `);
  });

  root.innerHTML = items.join("");
}

function renderLoading() {
  const root = document.querySelector("#country-list");
  root.innerHTML = `
    <article class="country-row">
      <div class="country-rank">...</div>
      <div>
        <p class="country-headline">Loading</p>
      </div>
      <div class="country-population">...</div>
    </article>
  `;
}

function renderError() {
  const root = document.querySelector("#country-list");
  root.innerHTML = `
    <article class="country-row">
      <div class="country-rank">!</div>
      <div>
        <p class="country-headline">Could not load data.</p>
      </div>
      <div class="country-population">ERR</div>
    </article>
  `;
}

async function loadCountries() {
  const response = await fetch(DATA_URL);
  const countries = await response.json();
  renderCountries(countries);
}

initializeWeatherOrb();
renderLoading();
loadCountries().catch(() => {
  renderError();
});

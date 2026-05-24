const populationFormatter = new Intl.NumberFormat("en-US");
const DATA_URL = "./world-brief-data.json";
const WEATHER_LAYER_DURATION_MS = 5200;
const WORLD_GEOJSON_URL = "https://unpkg.com/visionscarto-world-atlas@0.0.4/world/50m_countries.geojson";
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const WEATHER_GRID_LAT_STEP = 10;
const WEATHER_GRID_LON_STEP = 10;
const WEATHER_LAYERS = [
  {
    key: "wind",
    name: "Wind Flow",
    detail: "Jet stream bands and trade-wind motion.",
  },
  {
    key: "rainfall",
    name: "Rainfall",
    detail: "Equatorial storm belts and moving rain clusters.",
  },
  {
    key: "temperature",
    name: "Temperature",
    detail: "Latitudinal heat bands with warm and cool pockets.",
  },
  {
    key: "clouds",
    name: "Cloud Cover",
    detail: "Global cloud density with drifting high-altitude fields.",
  },
];
const stars = Array.from({ length: 600 }, () => ({
  x: Math.random(),
  y: Math.random(),
  r: Math.random() * 1.5 + 0.4,
  a: Math.random() * 0.55 + 0.15,
}));

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

function fbm(x, y, octaves) {
  let value = 0;
  let amp = 1;
  let freq = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    value += amp * smoothNoise(x * freq, y * freq);
    total += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return value / total;
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

function pseudoLandMask(latDeg, lonDeg) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const shape =
    Math.sin(lat * 1.7) +
    0.82 * Math.cos(lon * 1.35) +
    0.42 * Math.sin(lon * 3.4 + lat * 1.2) +
    0.28 * Math.cos(lat * 4.1 - lon * 2.3);
  return shape > 0.78;
}

function sampleTemperature(latDeg, lonDeg, timeMs) {
  const live = getLiveWeatherPoint(latDeg, lonDeg);
  if (live && typeof live.temperature === "number") {
    return clamp((live.temperature + 35) / 80, 0, 1);
  }

  const latFactor = 1 - Math.abs(latDeg) / 90;
  const wave =
    0.16 * Math.sin((lonDeg + timeMs * 0.0028) * 0.07) +
    0.08 * Math.cos((latDeg - timeMs * 0.0011) * 0.12);
  return clamp(latFactor + wave, 0, 1);
}

function sampleRainfall(latDeg, lonDeg, timeMs) {
  const live = getLiveWeatherPoint(latDeg, lonDeg);
  if (live && typeof live.precipitation === "number") {
    return clamp(live.precipitation / 5, 0, 1);
  }

  const equatorialBand = Math.exp(-Math.pow((latDeg - 8) / 24, 2));
  const southernBand = 0.6 * Math.exp(-Math.pow((latDeg + 14) / 20, 2));
  const pulse =
    0.5 +
    0.5 *
      Math.sin((lonDeg + timeMs * 0.009) * 0.18 + Math.cos((latDeg + 10) * 0.12) * 2.4);
  return clamp((equatorialBand + southernBand) * pulse, 0, 1);
}

function sampleClouds(latDeg, lonDeg, timeMs) {
  const live = getLiveWeatherPoint(latDeg, lonDeg);
  if (live && typeof live.cloudCover === "number") {
    return clamp(live.cloudCover / 100, 0, 1);
  }

  const banding = 0.5 + 0.3 * Math.sin((latDeg + timeMs * 0.0016) * 0.16);
  const turbulence =
    0.35 +
    0.35 * Math.cos((lonDeg - timeMs * 0.0045) * 0.14 + Math.sin(latDeg * 0.08) * 2.1);
  return clamp(banding + turbulence - 0.25, 0, 1);
}

function sampleWind(latDeg, lonDeg, timeMs) {
  const live = getLiveWeatherPoint(latDeg, lonDeg);
  if (
    live &&
    typeof live.windSpeed === "number" &&
    typeof live.windDirection === "number"
  ) {
    const speed = clamp(live.windSpeed / 18, 0.12, 1.2);
    const rad = ((live.windDirection + 180) * Math.PI) / 180;
    return {
      zonal: Math.sin(rad) * speed,
      meridional: Math.cos(rad) * speed,
      speed,
    };
  }

  const bandDirection = latDeg > 30 ? -1 : latDeg < -30 ? 1 : latDeg > 0 ? 1 : -1;
  const swirl = Math.sin((lonDeg + timeMs * 0.008) * 0.09 + latDeg * 0.05);
  const meridional = 0.28 * Math.cos((lonDeg - timeMs * 0.004) * 0.11 + latDeg * 0.08);
  const zonal = bandDirection * (0.55 + 0.35 * Math.abs(Math.sin((latDeg * Math.PI) / 45))) + swirl * 0.22;
  const speed = clamp(Math.abs(zonal) + Math.abs(meridional), 0.18, 1.15);
  return { zonal, meridional, speed };
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

function getLandColor(latDeg) {
  const lat = Math.abs(latDeg);
  const desert = Math.exp(-Math.pow((lat - 26) / 10, 2));
  const tundra = Math.max(0, (lat - 55) / 25);
  const iceCap = Math.max(0, (lat - 72) / 15);
  let g = 155 - lat * 0.8;
  let r = 130 + lat * 0.4;
  let b = 75 - lat * 0.35;
  r += desert * 50;
  g -= desert * 55;
  b -= desert * 25;
  r = lerp(r, 150, tundra);
  g = lerp(g, 130, tundra);
  b = lerp(b, 100, tundra);
  r = lerp(r, 225, iceCap);
  g = lerp(g, 225, iceCap);
  b = lerp(b, 235, iceCap);
  return [Math.round(clamp(r, 45, 235)), Math.round(clamp(g, 45, 235)), Math.round(clamp(b, 30, 235))];
}

function getLiveWeatherPoint(latDeg, lonDeg) {
  if (!weatherOrbState.weatherGrid.size) return null;
  const lat = snapLatitude(latDeg);
  const lon = snapLongitude(lonDeg);
  return weatherOrbState.weatherGrid.get(getGridKey(lat, lon)) || null;
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
        if (value < 0.1) continue;
        const nx = lon * 0.03 + timeMs * 0.00008;
        const ny = lat * 0.03;
        value = clamp(value * (0.5 + 0.5 * smoothNoise(nx, ny)), 0, 1);
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
    const driftX = timeMs * 0.00003;
    const driftY = timeMs * 0.000015;
    for (let lat = -76; lat <= 76; lat += 2) {
      for (let lon = -180; lon < 180; lon += 2) {
        const point = latLonProjection(lat, lon, rotation);
        if (point.z <= 0) continue;
        let value = sampleClouds(lat, lon, timeMs);
        const nx = (lon + driftX) * 0.014;
        const ny = (lat + driftY) * 0.014;
        const noise = fbm(nx, ny, 4);
        value = clamp(value * 0.35 + noise * 0.65, 0, 1);
        if (value < 0.22) continue;
        const x = centerX + point.x * radius;
        const y = centerY - point.y * radius;
        const s = lerp(3, 7, point.z) * (0.7 + 0.3 * noise);
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
          const lf = 1 / Math.cos(clat * Math.PI / 180 + 0.01);
          clat += -w.meridional * 1.3;
          clon += w.zonal * 1.3 * lf;
          if (Math.abs(clat) > 85) break;
        }
        const speed = sampleWind(lat, lon, timeMs).speed;
        ctx.strokeStyle = rgba([80, 220, 255], a * (0.06 + speed * 0.22));
        ctx.lineWidth = lerp(0.4, 1.3, speed);
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
    ctx.beginPath();
    for (const ring of polygon) {
      let started = false;
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
    }
    if (polygon[0] && polygon[0].length) {
      const [r, g, b] = getLandColor(polygon[0][0][1]);
      ctx.fillStyle = rgba([r, g, b], 0.78);
      ctx.fill("evenodd");
    }
  }

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
          ? "rgba(40, 70, 50, 0.40)"
          : "rgba(40, 70, 50, 0.18)";
        ctx.lineWidth = ringIndex === 0 ? 0.7 : 0.35;
        ctx.stroke();
      }
    }
  }

  return true;
}

function drawWeatherOrbFrame(ctx, canvas, timeMs) {
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.34;
  const rotation = timeMs * 0.00018;
  const cycle = timeMs / WEATHER_LAYER_DURATION_MS;
  const currentIndex = Math.floor(cycle) % WEATHER_LAYERS.length;
  const nextIndex = (currentIndex + 1) % WEATHER_LAYERS.length;
  const transition = smoothstep(cycle % 1);
  const currentLayer = WEATHER_LAYERS[currentIndex];
  const nextLayer = WEATHER_LAYERS[nextIndex];

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#040a12";
  ctx.fillRect(0, 0, width, height);

  for (const star of stars) {
    const sx = star.x * width;
    const sy = star.y * height;
    const twinkle = 0.7 + 0.3 * Math.sin(timeMs * 0.001 * (star.r * 2) + star.x * 100);
    ctx.fillStyle = `rgba(255, 255, 255, ${star.a * twinkle})`;
    ctx.beginPath();
    ctx.arc(sx, sy, star.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const outerGlow = ctx.createRadialGradient(centerX, centerY, radius * 0.8, centerX, centerY, radius * 1.4);
  outerGlow.addColorStop(0, "rgba(80, 170, 255, 0)");
  outerGlow.addColorStop(0.75, "rgba(80, 170, 255, 0.05)");
  outerGlow.addColorStop(0.95, "rgba(160, 210, 255, 0.10)");
  outerGlow.addColorStop(1, "rgba(80, 170, 255, 0)");
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 1.4, 0, Math.PI * 2);
  ctx.fill();

  const oceanGrad = ctx.createRadialGradient(
    centerX - radius * 0.25,
    centerY - radius * 0.3,
    radius * 0.05,
    centerX,
    centerY,
    radius,
  );
  oceanGrad.addColorStop(0, "#1a527a");
  oceanGrad.addColorStop(0.4, "#0e3055");
  oceanGrad.addColorStop(0.75, "#081d38");
  oceanGrad.addColorStop(1, "#040f1f");
  ctx.fillStyle = oceanGrad;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  const sunX = centerX + radius * 0.4;
  const sunY = centerY - radius * 0.12;
  const specGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, radius * 0.35);
  specGlow.addColorStop(0, "rgba(255, 255, 255, 0.12)");
  specGlow.addColorStop(0.25, "rgba(210, 235, 255, 0.06)");
  specGlow.addColorStop(1, "rgba(200, 230, 255, 0)");
  ctx.fillStyle = specGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, radius * 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.clip();

  if (!drawWorldGeometry(ctx, rotation, radius, centerX, centerY)) {
    for (let lat = -78; lat <= 78; lat += 4) {
      for (let lon = -180; lon < 180; lon += 4) {
        const point = latLonProjection(lat, lon, rotation);
        if (point.z <= 0 || !pseudoLandMask(lat, lon)) continue;
        const x = centerX + point.x * radius;
        const y = centerY - point.y * radius;
        const size = lerp(1.5, 3.8, point.z);
        const [r, g, b] = getLandColor(lat);
        ctx.fillStyle = rgba([r, g, b], 0.3 + point.z * 0.4);
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
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

  const dayGrad = ctx.createLinearGradient(centerX - radius * 0.05, centerY, centerX + radius * 0.5, centerY);
  dayGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
  dayGrad.addColorStop(0.5, "rgba(255, 235, 180, 0)");
  dayGrad.addColorStop(1, "rgba(255, 235, 180, 0.05)");
  ctx.fillStyle = dayGrad;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  const innerRim = ctx.createRadialGradient(centerX, centerY, radius * 0.88, centerX, centerY, radius);
  innerRim.addColorStop(0, "rgba(100, 190, 255, 0)");
  innerRim.addColorStop(0.9, "rgba(100, 190, 255, 0)");
  innerRim.addColorStop(0.96, "rgba(160, 220, 255, 0.10)");
  innerRim.addColorStop(1, "rgba(100, 190, 255, 0.04)");
  ctx.fillStyle = innerRim;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  const gloss = ctx.createRadialGradient(
    centerX - radius * 0.28,
    centerY - radius * 0.42,
    0,
    centerX,
    centerY,
    radius,
  );
  gloss.addColorStop(0, "rgba(255, 255, 255, 0.16)");
  gloss.addColorStop(0.35, "rgba(255, 255, 255, 0.03)");
  gloss.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gloss;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  ctx.strokeStyle = "rgba(120, 190, 255, 0.18)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

  const meta = getWeatherLayerNodes();
  if (meta.name) meta.name.textContent = transition > 0.68 ? nextLayer.name : currentLayer.name;
  if (meta.detail) {
    const activeLayer = transition > 0.68 ? nextLayer : currentLayer;
    meta.detail.textContent = activeLayer.detail;
  }

  const summary = getWeatherSummary();
  if (meta.source) {
    meta.source.textContent = weatherOrbState.weatherGrid.size
      ? "Live Data · Open-Meteo"
      : "Fallback Mode";
  }
  if (meta.updated) {
    meta.updated.textContent = weatherOrbState.weatherTimestamp
      ? `Updated ${weatherOrbState.weatherTimestamp} UTC`
      : "No live timestamp";
  }
  if (summary && meta.temp) {
    meta.temp.textContent = `Avg Temp ${summary.averageTemp.toFixed(1)}C`;
  }
  if (summary && meta.wind) {
    meta.wind.textContent = `Avg Wind ${summary.averageWind.toFixed(1)}m/s`;
  }
  if (summary && meta.rain) {
    meta.rain.textContent = `Peak Rain ${summary.maxRain.toFixed(1)}mm`;
  }
}

function initializeWeatherOrb() {
  const { canvas } = getWeatherLayerNodes();
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  loadWeatherGeometry();
  loadLiveWeatherGrid().catch(() => {
    weatherOrbState.weatherSource = "Synthetic fallback";
  });

  const render = (timestamp) => {
    drawWeatherOrbFrame(ctx, canvas, timestamp);
    window.requestAnimationFrame(render);
  };

  window.requestAnimationFrame(render);
}

function renderCountries(countries) {
  const root = document.querySelector("#country-list");
  const items = [];

  countries.forEach((item, index) => {
    items.push(`
        <article class="country-row">
          <div class="country-rank">#${index + 1}</div>
          <div>
            <p class="country-headline">${escapeHtml(item.name)}</p>
            <span class="country-code">${escapeHtml(item.iso3)} · ${escapeHtml(item.language)}</span>
            <p class="country-news">${escapeHtml(item.headline || "No cached headline available.")}</p>
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
        <p class="country-headline">Loading World Brief</p>
        <span class="country-code">HEADLINES + POPULATION</span>
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
        <p class="country-headline">Population ranking is temporarily unavailable.</p>
        <span class="country-code">TRY AGAIN</span>
      </div>
      <div class="country-population">ERROR</div>
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

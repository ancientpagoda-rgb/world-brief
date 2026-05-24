const populationFormatter = new Intl.NumberFormat("en-US");
const DATA_URL = "./world-brief-data.json";
const WEATHER_LAYER_DURATION_MS = 5200;
const WORLD_GEOJSON_URL = "https://unpkg.com/visionscarto-world-atlas@0.0.4/world/110m_countries.geojson";
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const WEATHER_GRID_LAT_STEP = 15;
const WEATHER_GRID_LON_STEP = 15;
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

  for (let lat = -76; lat <= 76; lat += 4) {
    for (let lon = -180; lon < 180; lon += 4) {
      const point = latLonProjection(lat, lon, rotation);
      if (point.z <= 0) continue;

      const x = centerX + point.x * radius;
      const y = centerY - point.y * radius;
      const size = lerp(1.2, 3.2, point.z);

      if (layerKey === "temperature") {
        const value = sampleTemperature(lat, lon, timeMs);
        ctx.fillStyle = rgba(getTemperatureColor(value), alpha * (0.22 + value * 0.62));
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      } else if (layerKey === "rainfall") {
        const value = sampleRainfall(lat, lon, timeMs);
        if (value < 0.16) continue;
        ctx.fillStyle = rgba(getRainColor(value), alpha * (0.18 + value * 0.62));
        ctx.beginPath();
        ctx.arc(x, y, size * 1.25, 0, Math.PI * 2);
        ctx.fill();
      } else if (layerKey === "clouds") {
        const value = sampleClouds(lat, lon, timeMs);
        if (value < 0.2) continue;
        ctx.fillStyle = rgba(getCloudColor(value), alpha * (0.16 + value * 0.48));
        ctx.beginPath();
        ctx.arc(x, y, size * 1.15, 0, Math.PI * 2);
        ctx.fill();
      } else if (layerKey === "wind") {
        const flow = sampleWind(lat, lon, timeMs);
        const dx = flow.zonal * size * 4.4;
        const dy = -flow.meridional * size * 3.3;
        ctx.strokeStyle = rgba([131, 231, 255], alpha * (0.24 + flow.speed * 0.34));
        ctx.lineWidth = lerp(0.65, 1.6, point.z);
        ctx.beginPath();
        ctx.moveTo(x - dx * 0.45, y - dy * 0.45);
        ctx.lineTo(x + dx * 0.55, y + dy * 0.55);
        ctx.stroke();
      }
    }
  }
}

function drawWorldGeometry(ctx, rotation, radius, centerX, centerY) {
  if (!weatherOrbState.features.length) return false;

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.clip();

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  weatherOrbState.features.forEach((polygon) => {
    polygon.forEach((ring, ringIndex) => {
      let started = false;
      ctx.beginPath();

      ring.forEach(([lon, lat]) => {
        const point = latLonProjection(lat, lon, rotation);
        if (point.z <= -0.12) {
          started = false;
          return;
        }

        const x = centerX + point.x * radius;
        const y = centerY - point.y * radius;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });

      if (started && ringIndex === 0) {
        ctx.strokeStyle = "rgba(131, 255, 193, 0.45)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else if (started) {
        ctx.strokeStyle = "rgba(131, 255, 193, 0.18)";
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    });
  });

  ctx.restore();
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
  ctx.fillStyle = "#071119";
  ctx.fillRect(0, 0, width, height);

  const halo = ctx.createRadialGradient(centerX, centerY, radius * 0.35, centerX, centerY, radius * 1.7);
  halo.addColorStop(0, "rgba(87, 184, 255, 0.18)");
  halo.addColorStop(1, "rgba(87, 184, 255, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 1.7, 0, Math.PI * 2);
  ctx.fill();

  const globeFill = ctx.createRadialGradient(
    centerX - radius * 0.22,
    centerY - radius * 0.3,
    radius * 0.15,
    centerX,
    centerY,
    radius,
  );
  globeFill.addColorStop(0, "#1f5776");
  globeFill.addColorStop(0.55, "#103247");
  globeFill.addColorStop(1, "#09131c");
  ctx.fillStyle = globeFill;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.clip();

  if (!drawWorldGeometry(ctx, rotation, radius, centerX, centerY)) {
    for (let lat = -78; lat <= 78; lat += 6) {
      for (let lon = -180; lon < 180; lon += 6) {
        const point = latLonProjection(lat, lon, rotation);
        if (point.z <= 0 || !pseudoLandMask(lat, lon)) continue;
        const x = centerX + point.x * radius;
        const y = centerY - point.y * radius;
        const size = lerp(1.5, 3.8, point.z);
        ctx.fillStyle = rgba([82, 138, 111], 0.18 + point.z * 0.3);
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.strokeStyle = "rgba(180, 216, 232, 0.08)";
  ctx.lineWidth = 1;
  for (let lat = -60; lat <= 60; lat += 30) {
    ctx.beginPath();
    for (let lon = -180; lon <= 180; lon += 4) {
      const point = latLonProjection(lat, lon, rotation);
      if (point.z <= 0) continue;
      const x = centerX + point.x * radius;
      const y = centerY - point.y * radius;
      if (lon === -180 || point.z <= 0.02) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawLayerField(ctx, currentLayer.key, 1 - transition * 0.55, rotation, radius, centerX, centerY, timeMs);
  drawLayerField(ctx, nextLayer.key, transition * 0.9, rotation, radius, centerX, centerY, timeMs);

  const gloss = ctx.createRadialGradient(
    centerX - radius * 0.28,
    centerY - radius * 0.45,
    0,
    centerX,
    centerY,
    radius,
  );
  gloss.addColorStop(0, "rgba(255, 255, 255, 0.22)");
  gloss.addColorStop(0.4, "rgba(255, 255, 255, 0.04)");
  gloss.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gloss;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  ctx.strokeStyle = "rgba(183, 223, 255, 0.22)";
  ctx.lineWidth = 1.4;
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

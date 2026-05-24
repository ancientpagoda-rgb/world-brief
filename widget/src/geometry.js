import { WORLD_GEOJSON_URL, weatherOrbState } from "./state.js";

function simplifyRing(ring) {
  const step = Math.max(1, Math.floor(ring.length / 200));
  const simplified = [];
  for (let i = 0; i < ring.length; i += step) {
    simplified.push(ring[i]);
  }
  if (simplified[simplified.length - 1] !== simplified[0]) simplified.push(simplified[0]);
  return simplified;
}

function preprocessWorldGeometry(geojson) {
  const features = [];
  if (!geojson?.features) return features;
  for (const feature of geojson.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    let polygons = [];
    if (geometry.type === "Polygon") {
      polygons = [geometry.coordinates.map(simplifyRing)];
    } else if (geometry.type === "MultiPolygon") {
      polygons = geometry.coordinates.map((poly) => poly.map(simplifyRing));
    }
    for (const poly of polygons) {
      if (poly.length) features.push(poly);
    }
  }
  return features;
}

export async function loadWeatherGeometry() {
  weatherOrbState.loading = true;
  try {
    const response = await fetch(WORLD_GEOJSON_URL);
    const geojson = await response.json();
    weatherOrbState.features = preprocessWorldGeometry(geojson);
    weatherOrbState.loaded = true;

    weatherOrbState.countryShapes = new Map();
    if (geojson?.features) {
      for (const feature of geojson.features) {
        const iso3 = feature.properties?.iso_a3;
        if (!iso3) continue;
        const geometry = feature.geometry;
        if (!geometry) continue;
        let polygons = [];
        if (geometry.type === "Polygon") {
          polygons = [geometry.coordinates.map(simplifyRing)];
        } else if (geometry.type === "MultiPolygon") {
          polygons = geometry.coordinates.map((poly) => poly.map(simplifyRing));
        }
        if (polygons.length) weatherOrbState.countryShapes.set(iso3, polygons);
      }
    }
  } catch (_error) {
    weatherOrbState.features = [];
    weatherOrbState.loaded = false;
  } finally {
    weatherOrbState.loading = false;
  }
}

export function drawWorldGeometry(ctx, rotY, rotX, radius, centerX, centerY) {
  if (!weatherOrbState.features.length) return false;

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (const polygon of weatherOrbState.features) {
    for (const [ringIndex, ring] of polygon.entries()) {
      let started = false;
      ctx.beginPath();
      for (const [lon, lat] of ring) {
        const point = latLonProjection(lat, lon, rotY, rotX);
        if (point.z <= 0) {
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

export function latLonProjection(latDeg, lonDeg, rotY, rotX) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180 + rotY;

  const cx = Math.cos(lat) * Math.sin(lon);
  const cy = Math.sin(lat);
  const cz = Math.cos(lat) * Math.cos(lon);

  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const ya = cy * cosX - cz * sinX;
  const za = cy * sinX + cz * cosX;

  return { x: cx, y: ya, z: za, lat, lon };
}

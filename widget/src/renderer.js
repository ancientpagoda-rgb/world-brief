import {
  globeRotation,
  earthTextureImage,
  nightTextureImage,
  weatherOrbState,
} from "./state.js";
import { drawWorldGeometry } from "./geometry.js";

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function renderEarthTexture(ctx, cx, cy, r, rotation) {
  const img = earthTextureImage;
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
  const img = nightTextureImage;
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

export function drawWeatherOrbFrame(ctx, canvas, timeMs) {
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.34;
  const cycle = timeMs / 5200;
  const currentIndex = Math.floor(cycle) % 4;
  const nextIndex = (currentIndex + 1) % 4;
  const transition = smoothstep(cycle % 1);
  const layerNames = ["temperature", "rainfall", "clouds", "wind"];
  const currentLayer = layerNames[currentIndex];
  const nextLayer = layerNames[nextIndex];

  ctx.clearRect(0, 0, width, height);

  const rotation = globeRotation;
  const moonAngle = timeMs * 0.00003;
  const moonDist = radius * 2;
  const moonX = centerX + Math.cos(moonAngle) * moonDist;
  const moonY = centerY + Math.sin(moonAngle) * moonDist * 0.6 - radius * 0.6;

  // Earth core glow rings
  const coreGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  coreGrad.addColorStop(0, "rgba(255, 240, 200, 0.20)");
  coreGrad.addColorStop(0.19, "rgba(255, 220, 170, 0.20)");
  coreGrad.addColorStop(0.19, "rgba(255, 180, 100, 0.08)");
  coreGrad.addColorStop(0.55, "rgba(255, 140, 60, 0.08)");
  coreGrad.addColorStop(0.55, "rgba(180, 60, 30, 0.04)");
  coreGrad.addColorStop(0.98, "rgba(120, 30, 15, 0.04)");
  coreGrad.addColorStop(0.98, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 6.2832);
  ctx.fill();

  // Earth satellite texture
  if (earthTextureImage) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 6.2832);
    ctx.clip();
    renderEarthTexture(ctx, centerX, centerY, radius, rotation);
    ctx.restore();
  }

  // Night lights (additive blend)
  if (nightTextureImage) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 6.2832);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    renderNightTexture(ctx, centerX, centerY, radius, rotation);
    ctx.restore();
  }

  // Country borders
  ctx.globalCompositeOperation = "source-over";
  drawWorldGeometry(ctx, rotation, radius, centerX, centerY);

  // Weather layer indicator
  const infoY = centerY + radius + 20;
  ctx.fillStyle = "rgba(200, 220, 240, 0.35)";
  ctx.font = "11px 'IBM Plex Mono', monospace";
  ctx.textAlign = "center";
  const label = currentLayer.charAt(0).toUpperCase() + currentLayer.slice(1);
  ctx.fillText(label, centerX, infoY);

  // Moon
  ctx.save();
  const moonGrad = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 6);
  moonGrad.addColorStop(0, "rgba(200, 200, 210, 0.5)");
  moonGrad.addColorStop(0.5, "rgba(180, 180, 200, 0.2)");
  moonGrad.addColorStop(1, "rgba(180, 180, 200, 0)");
  ctx.fillStyle = moonGrad;
  ctx.beginPath();
  ctx.arc(moonX, moonY, 6, 0, 6.2832);
  ctx.fill();
  ctx.restore();
}

import {
  globeRotation,
  earthTextureImage,
  nightTextureImage,
} from "./state.js";
import { drawWorldGeometry } from "./geometry.js";

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function rgba(color, alpha) {
  return `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
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

  ctx.clearRect(0, 0, width, height);

  // Solid dark base for the globe
  ctx.fillStyle = "#111418";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 6.2832);
  ctx.fill();

  const rotation = globeRotation;
  const moonAngle = timeMs * 0.00003;
  const moonDist = radius * 2;
  const moonX = centerX + Math.cos(moonAngle) * moonDist;
  const moonY = centerY + Math.sin(moonAngle) * moonDist * 0.6 - radius * 0.6;

  // Clip to globe circle — everything below stays inside
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 6.2832);
  ctx.clip();

  // Earth satellite texture (opaque scanlines)
  renderEarthTexture(ctx, centerX, centerY, radius, rotation);

  // Earth core glow (additive, visible through the earth)
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
    ctx.arc(centerX, centerY, radius * l.outer, 0, 6.2832);
    ctx.arc(centerX, centerY, radius * l.inner, 0, 6.2832, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Country borders
  drawWorldGeometry(ctx, rotation, radius, centerX, centerY);

  // Edge shading
  const shade = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(0.75, "rgba(0, 0, 0, 0.05)");
  shade.addColorStop(1, "rgba(0, 0, 0, 0.20)");
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 6.2832);
  ctx.fill();

  ctx.restore(); // remove clip

  // Night lights (outside clip, full canvas)
  if (nightTextureImage) {
    const w = canvas.width;
    const h = canvas.height;
    const nc = document.createElement("canvas");
    nc.width = w;
    nc.height = h;
    const nctx = nc.getContext("2d");

    nctx.save();
    nctx.beginPath();
    nctx.arc(centerX, centerY, radius, 0, 6.2832);
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
    nctx.fillRect(0, 0, w, h);
    nctx.globalCompositeOperation = "source-over";

    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(nc, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }

  // Weather layer indicator
  const cycle = timeMs / 5200;
  const currentIndex = Math.floor(cycle) % 4;
  const nextIndex = (currentIndex + 1) % 4;
  const transition = smoothstep(cycle % 1);
  const layerNames = ["temperature", "rainfall", "clouds", "wind"];
  const currentLayer = layerNames[currentIndex];
  const nextLayer = layerNames[nextIndex];

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

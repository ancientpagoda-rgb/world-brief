# Session Summary

## Goals
Interactive 3D globe visualization — canvas-based, no WebGL — showing Earth with textures, weather overlays (wind, temperature, precipitation, clouds), real HYG star catalog, solar system planets, country outlines, Wikipedia country news, and zoom/drag interaction.

## Completed features
- **Country outline thumbnails** — small map inset next to each headline
- **Back-face border culling** — skip country edges with z <= 0
- **Static globe + rotating stars** — globe stays still unless dragged; stars, Milky Way, and planets rotate opposite to drag direction
- **Star rotation fix** — stars drift opposite to drag (was same direction)
- **Globe opacity fix** — solid `#040a12` fill behind globe circle
- **Zoom** — mouse wheel + pinch zoom, range 0.3–4×
- **Nullschool-style weather layers**:
  - Simultaneous temperature/precipitation/clouds/wind (no cycling)
  - 2500 wind particles advected each frame
  - Radar-style precipitation colors
  - Open-Meteo API with wind U/V
- **All-axis rotation** — replaced single `globeRotation` with `globeRotY` + `globeRotX`, per-pixel 3D rotation matrix in texture rendering, clamped pitch ±90°
- **Embeddable widget** — `widget/` directory with rollup-bundled `earth-globe-widget`

## Build/dist commands
- `cd widget && npm run build` — builds ES module to `widget/dist/earth-globe-widget.js`
- **No build step for app.js** — plain `<script>` loaded in `index.html`
- `npx serve .` — local dev server for testing

import { EARTH_TEXTURE_URL, NIGHT_TEXTURE_URL, setEarthTexture, setNightTexture } from "./state.js";

export function loadEarthTexture() {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = EARTH_TEXTURE_URL;
  img.onload = () => setEarthTexture(img);
  img.onerror = () => setEarthTexture(null);
}

export function loadNightTexture() {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = NIGHT_TEXTURE_URL;
  img.onload = () => setNightTexture(img);
  img.onerror = () => setNightTexture(null);
}

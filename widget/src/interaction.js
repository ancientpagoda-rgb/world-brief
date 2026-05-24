import { globeDrag, setGlobeRotation, globeRotation } from "./state.js";

export function setupGlobeInteraction(canvas) {
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
    setGlobeRotation(globeDrag.startRotation - (dx / w) * Math.PI * 2);
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

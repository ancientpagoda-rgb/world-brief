import { globeDrag, setGlobeRotation, globeRotation, setGlobeZoom, globeZoom } from "./state.js";

export function setupGlobeInteraction(canvas, opts = {}) {
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

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const z = globeZoom * Math.exp(-e.deltaY * 0.001);
    setGlobeZoom(Math.max(0.3, Math.min(4, z)));
  }, { passive: false });

  let pinchDist = 0;
  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) onStart(e.touches[0].clientX);
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDist = Math.sqrt(dx * dx + dy * dy);
    }
  }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches.length === 1) onMove(e.touches[0].clientX);
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (pinchDist > 0) {
        const z = globeZoom * (dist / pinchDist);
        setGlobeZoom(Math.max(0.3, Math.min(4, z)));
      }
      pinchDist = dist;
    }
  }, { passive: false });
  canvas.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) pinchDist = 0;
    if (e.touches.length === 0) onEnd();
  }, { passive: true });
}

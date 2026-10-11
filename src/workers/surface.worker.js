// Builds the generic procedural surface for a moon or dwarf planet off the main thread.
//
// The fractal-noise pass is ~200 ms of pure maths; running it here keeps the render loop smooth
// when many bodies are revealed at once. The main thread only does a cheap putImageData with the
// returned buffer. Same maths as the inline fallback, so the pixels are identical.
import { fillGenericSurface, GENERIC_CANVAS_W, GENERIC_CANVAS_H } from '../scene/planets/proceduralSurface.js';

self.onmessage = (e) => {
  const { requestId, r0, g0, b0, seed } = e.data || {};
  const data = new Uint8ClampedArray(GENERIC_CANVAS_W * GENERIC_CANVAS_H * 4);
  fillGenericSurface(data, GENERIC_CANVAS_W, GENERIC_CANVAS_H, r0, g0, b0, seed);
  self.postMessage({ requestId, data }, [data.buffer]);
};

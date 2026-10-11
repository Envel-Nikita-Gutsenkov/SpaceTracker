// Pure, DOM-free procedural surface synthesis, shared by the main thread and the surface worker.
//
// The generic fallback surface (used for moons and dwarf planets with no real global map) is a
// 512x256 fractal-noise pass: ~4 million noise evaluations, ~200 ms of pure maths per body. Built
// inline in the render loop it froze the app for seconds the instant a group of bodies was
// revealed at once (the "show moons" toggle). Keeping the maths in this dependency-free module
// lets the worker run the exact same code off the main thread — identical pixels, no stall.

export const GENERIC_CANVAS_W = 512;
export const GENERIC_CANVAS_H = 256;

// Helper: simple pseudo-random noise generator for deterministic, seedable procedural textures
export function pseudoNoise(x, y, seed = 1) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

export function smoothNoise(x, y, seed = 1) {
  const iX = Math.floor(x);
  const iY = Math.floor(y);
  const fX = x - iX;
  const fY = y - iY;

  // Smooth Hermite interpolation
  const u = fX * fX * (3.0 - 2.0 * fX);
  const v = fY * fY * (3.0 - 2.0 * fY);

  const n00 = pseudoNoise(iX,     iY,     seed);
  const n10 = pseudoNoise(iX + 1, iY,     seed);
  const n01 = pseudoNoise(iX,     iY + 1, seed);
  const n11 = pseudoNoise(iX + 1, iY + 1, seed);

  return (1.0 - u) * (1.0 - v) * n00 +
         u * (1.0 - v) * n10 +
         (1.0 - u) * v * n01 +
         u * v * n11;
}

export function fbm(x, y, octaves = 4, seed = 1) {
  let val = 0.0;
  let amp = 0.5;
  let freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    val += amp * smoothNoise(x * freq, y * freq, seed + i * 17);
    freq *= 2.02;
    amp *= 0.5;
  }
  return val;
}

// Deterministic per-body seed so the same body always gets the same surface.
export function genericSeed(planetId) {
  let seed = 7;
  for (let i = 0; i < planetId.length; i++) seed = (seed * 31 + planetId.charCodeAt(i)) % 100000;
  return seed;
}

// Fill `data` (RGBA, length w*h*4) with the generic fallback surface for a body of base albedo
// (r0,g0,b0) and the given seed. Pure: no canvas, no DOM, safe to run inside a worker.
export function fillGenericSurface(data, w, h, r0, g0, b0, seed) {
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const lat = (v - 0.5) * Math.PI;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const idx = (y * w + x) * 4;
      const relief = fbm(u * 8.0, v * 4.0, 5, seed);
      const craters = Math.pow(fbm(u * 26.0, v * 13.0, 3, seed + 17), 2.0);
      // Slight latitudinal shading (ice caps read brighter toward the poles).
      const polar = Math.min(1.0, Math.pow(Math.abs(Math.sin(lat)), 3.0));
      const shade = 0.72 + 0.55 * relief - 0.28 * craters + 0.18 * polar;
      data[idx]     = Math.max(0, Math.min(255, Math.floor(r0 * shade)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.floor(g0 * shade)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.floor(b0 * shade)));
      data[idx + 3] = 255;
    }
  }
  return data;
}

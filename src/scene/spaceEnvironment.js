import * as THREE from 'three';

// Image-based lighting source for the PBR spacecraft hulls.
//
// The ships carry real NASA PBR materials, many of them metals (metalness ~= 1). A metal has
// no diffuse term: it only shows what it reflects. With no environment map it reflects
// nothing, so every metallic facet renders black except for the sharp specular dot from the
// Sun's point light. Against the black of space those facets read as if they had vanished,
// and as the camera orbits the highlight sweeps from facet to facet — the "faces popping in
// and out / flickering" artifact. Pre-filtering a cheap procedural space environment into an
// IBL map gives the metal a reflection to sample; the pre-filter also mip-filters the
// roughness, which removes the specular shimmer on low-roughness panels.
//
// The map is intentionally dim: it only lifts metals off pure black and supplies a soft Sun
// glint. The Sun's point light stays the dominant, directional source.
const ENV_WIDTH = 256;
const ENV_HEIGHT = 128;

function buildSpaceEquirect() {
  const canvas = document.createElement('canvas');
  canvas.width = ENV_WIDTH;
  canvas.height = ENV_HEIGHT;
  const ctx = canvas.getContext('2d');

  // Deep-space base: near-black, a touch of blue toward the "horizon" so a mirror has some
  // tonal variation to reflect instead of a flat void.
  const bg = ctx.createLinearGradient(0, 0, 0, ENV_HEIGHT);
  bg.addColorStop(0.0, '#05070d');
  bg.addColorStop(0.5, '#0b1424');
  bg.addColorStop(1.0, '#05070d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, ENV_WIDTH, ENV_HEIGHT);

  // A broad, faint blue lobe (the reflected Earth / inner-system glow) so rounded metal
  // picks up a little colour rather than a single flat tone.
  const glowX = ENV_WIDTH * 0.25;
  const glowY = ENV_HEIGHT * 0.62;
  const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, ENV_WIDTH * 0.5);
  glow.addColorStop(0.0, 'rgba(60, 110, 190, 0.28)');
  glow.addColorStop(1.0, 'rgba(60, 110, 190, 0.0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, ENV_WIDTH, ENV_HEIGHT);

  // The Sun: a soft, bright disc. Solar arrays and dishes glint when they face it.
  const sunX = ENV_WIDTH * 0.5;
  const sunY = ENV_HEIGHT * 0.5;
  const sunR = ENV_WIDTH * 0.16;
  const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
  sun.addColorStop(0.0, 'rgba(255, 250, 236, 1.0)');
  sun.addColorStop(0.18, 'rgba(255, 240, 214, 0.5)');
  sun.addColorStop(1.0, 'rgba(255, 240, 214, 0.0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, ENV_WIDTH, ENV_HEIGHT);

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Build and pre-filter the space IBL environment. Returns a PMREM texture suitable for
 * `scene.environment`, or `null` in a headless context (no canvas). The returned texture is
 * owned by the caller's scene; the intermediate generator resources are released here.
 */
export function createSpaceEnvironment(renderer) {
  if (!renderer || typeof document === 'undefined') return null;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const source = buildSpaceEquirect();
  let envTexture = null;
  try {
    pmrem.compileEquirectangularShader();
    envTexture = pmrem.fromEquirectangular(source).texture;
  } finally {
    source.dispose();
    pmrem.dispose();
  }
  return envTexture;
}

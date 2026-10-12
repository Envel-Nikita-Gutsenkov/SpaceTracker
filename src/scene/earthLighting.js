// Physically-motivated Earth day/night lighting, shared by the fragment shader and its
// verification suite.
//
// The day/night boundary is the *geometric* terminator, where the surface normal is
// perpendicular to the Sun direction (N·S = 0). Its longitude is verified against the NOAA
// low-precision solar position in `tests/verify_math.js` (Suite 9). What this module pins
// down is the *appearance*: how wide the atmospheric dusk band is, and how the lit and night
// sides are scaled.
//
// The blend is a smoothstep of N·S whose control points are symmetric about zero
// (`-EARTH_TWILIGHT .. +EARTH_TWILIGHT`), so its midpoint (mix = 0.5) lands exactly on the
// real terminator. The previous hand-tuned band `smoothstep(-0.08, 0.12, …)` was offset
// toward the day side, pushing the visual half-lit line off the true boundary.

// Half-width of the dusk blend in N·S units. 0.10 ≈ ±5.7° of arc, a soft but readable
// twilight that matches the atmospheric scattering seen from orbit.
export const EARTH_TWILIGHT = 0.10;

// Peak day-side irradiance at the sub-solar point (N·S = 1). The day textures are already
// photographs of the fully lit surface, so this only sets the Helios-like HDR headroom.
export const EARTH_SUN_DIFFUSE = 1.6;

// Faint ambient so the day limb close to the terminator never reads as a hard black edge;
// the atmosphere still scatters a little light past the geometric terminator.
export const EARTH_SUN_AMBIENT = 0.07;

// Black Marble city-lights gain on the night side.
export const EARTH_NIGHT_GAIN = 2.0;

/**
 * Day/night blend factor for a surface point, as a function of N·S.
 *
 * Returns 0 deep on the night side, 1 well onto the day side, and exactly 0.5 on the
 * geometric terminator (N·S = 0). Mirrors the GLSL `smoothstep(-t, t, dotNS)` in Earth.js.
 */
export function earthTerminatorMix(ndotS, twilight = EARTH_TWILIGHT) {
  const t = Math.min(1, Math.max(0, (ndotS + twilight) / (2 * twilight)));
  return t * t * (3 - 2 * t);
}

/**
 * Lambertian day-side radiance multiplier for a surface point.
 *
 * Bright at the sub-solar point, falling linearly to `ambient` at dusk — the natural
 * bright-centre / dark-limb falloff of a sunlit sphere, rather than a flat ambient term.
 */
export function earthDayRadiance(ndotS, gain = EARTH_SUN_DIFFUSE, ambient = EARTH_SUN_AMBIENT) {
  return gain * Math.max(ndotS, 0) + ambient;
}

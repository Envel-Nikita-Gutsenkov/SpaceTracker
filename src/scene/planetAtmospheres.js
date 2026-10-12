// Per-body atmospheric limb parameters for the soft rim glow (see Atmosphere.js).
//
// Scientifically grounded: a soft, faint edge is only correct for bodies with a real,
// substantial atmosphere, where sunlight scattering along the grazing line of sight
// (the "aureole") produces a thin bright limb — the blue rim in Apollo/DSCOVR photos of
// Earth, Cassini's orange haze on Titan, New Horizons' blue haze on Pluto, and the
// methane-teal limb of the gas giants.
//
// Airless bodies (Mercury, the Moon, Phobos, Ceres, Europa, Callisto, Enceladus…) keep a
// razor-sharp limb in reality, so adding a glow would be physically wrong and look cheap.
// They are intentionally absent from this table.
//
// Kept free of any `three` import so the parameters can be unit-tested without a WebGL
// context (same convention as spacecraftModels.js).

// height    – shell thickness as a fraction of the body's radius. Real scale, deliberately
//             thin: Earth ~2%, Venus' dense deck ~4.5%, the giants ~1–2%, Titan's thick
//             haze ~10%. Pluto's haze is real but optically thin (mostly seen in
//             backscatter), so it is modelled as a conservative, faint shell.
// color     – dominant scattering / aerosol hue (Rayleigh + haze).
// intensity – peak alpha at the planet's limb (0..1), the visibility knob.
export const ATMOSPHERE_BODIES = {
  earth:   { height: 0.025, color: 0x4aa3ff, intensity: 0.45 },
  venus:   { height: 0.045, color: 0xf5e6b8, intensity: 0.55 },
  mars:    { height: 0.014, color: 0xe0a060, intensity: 0.30 },
  jupiter: { height: 0.012, color: 0xbcd7ff, intensity: 0.40 },
  saturn:  { height: 0.012, color: 0xd8e8ff, intensity: 0.40 },
  uranus:  { height: 0.016, color: 0x9be7ff, intensity: 0.42 },
  neptune: { height: 0.018, color: 0x6fb4ff, intensity: 0.50 },
  titan:   { height: 0.100, color: 0xf0a860, intensity: 0.60 },
  triton:  { height: 0.020, color: 0xd8c0c0, intensity: 0.30 },
  pluto:   { height: 0.050, color: 0x8fd0ff, intensity: 0.16 },
};

// |N·V| at the planet's limb for a shell of relative height `h` and radius R1 = R0·(1+h):
//   b_limb = R0  ⇒  |N·V| = sqrt(1 − (R0/R1)²) = sqrt(1 − 1/(1+h)²)
// The shader divides the raw rim term by this so the glow always peaks at the planet's
// limb (value 1) and fades to exactly 0 at the shell's outer silhouette, independent of how
// thick the shell is. That normalisation is what keeps every body's glow controllable by a
// single 0..1 `intensity` and prevents a thin shell (Neptune/Mars) from washing out.
export function atmosphereLimbRim(height) {
  if (!(height > 0)) return 0;
  const r = 1 / (1 + height);
  return Math.sqrt(Math.max(0, 1 - r * r));
}

// Index of bodies that should carry an atmospheric limb, keyed by body id.
export const ATMOSPHERE_BODY_IDS = Object.keys(ATMOSPHERE_BODIES);

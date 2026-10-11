// Robust solvers for Kepler's equation, shared by the planetary ephemeris
// (ephemeris.js) and the osculating-conic propagator (conicPropagation.js) so both
// use one verified implementation. Kept dependency-free so it can be unit-tested
// in Node without pulling in `three` or any circular import.

// Elliptic Kepler equation  M = E - e sin E,  for 00 <= e < 1.
//
// Why not a plain Newton iteration: seeded with the naive "E0 = pi" for e >= 0.8,
// Newton lands on the wrong side of aphelion when M ~ ±pi (that seed is ~+-pi, but
// the true E is on the opposite branch), overshoots to E ~ 0, and there
// 1 - e*cos(E) ~ 1 - e -> 0, so the next step explodes (observed |dE| up to 1e15).
// On screen this made the high-eccentricity orbiters (Juno, Akatsuki) jump tens to
// hundreds of scene units between frames — the "superluminal satellite" bug.
//
// This solver is provably safe for every e < 1:
//   * Seeded with Danby's (1987) starter, which is accurate across the whole range.
//   * f(E) = E - e sin E - M is strictly increasing (f' = 1 - e cos E > 0), and
//     |E - M| = |e sin E| <= e, so the root is bracketed in [M - e, M + e].
//   * Any Newton step that would leave the bracket falls back to bisection, so
//     convergence to the unique root is guaranteed regardless of the seed.
export function solveKeplerElliptic(M, e) {
  if (!Number.isFinite(M)) return 0;

  // Normalize M to [-pi, pi]. E is 2*pi-periodic, so this selects the same root and
  // yields a canonical E in [-pi, pi] even for circular orbits.
  let m = M % (2 * Math.PI);
  if (m < -Math.PI) m += 2 * Math.PI;
  else if (m > Math.PI) m -= 2 * Math.PI;

  if (!(e > 0)) return m;          // circular orbit (or e <= 0): E == m
  if (e >= 1) return m;            // not elliptic; caller must use the hyperbolic solver

  let lo = m - e;
  let hi = m + e;

  // Danby starter.
  let E = m + (e * Math.sin(m)) / (1 - Math.sin(m + e) + Math.sin(m));
  if (!(E > lo && E < hi)) E = 0.5 * (lo + hi);

  for (let i = 0; i < 100; i++) {
    const f = E - e * Math.sin(E) - m;
    if (f > 0) hi = E; else lo = E;

    const fp = 1 - e * Math.cos(E);
    let next = E - f / fp;
    if (!(next > lo && next < hi)) next = 0.5 * (lo + hi); // bisection safeguard

    if (Math.abs(next - E) < 1e-13) {
      E = next;
      break;
    }
    E = next;
  }

  return E;
}

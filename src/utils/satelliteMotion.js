// Frame bridge for artificial-satellite motion.
//
// The SGP4 propagator (see workers/propagator.worker.js) samples every satellite's state once
// per tick, but the renderer draws at 60+ FPS. With nothing in between, a constellation holds
// its sampled positions and then snaps to the next ones — the "jerky satellites" artifact
// (worst at 1× time scale, where a tick is a full second apart).
//
// satellite.js already returns the velocity vector at the same instant as the position, so the
// vertex shader can dead-reckon `position + velocity * dt` every frame. That is smooth and costs
// nothing per frame beyond updating a single `dt` uniform — no extra SGP4 evaluations.
//
// Pure and dependency-free (besides the Earth-radius constant) so it can be unit-tested in Node
// and imported by both the worker and the main thread.

import { EARTH_RADIUS_KM } from './astronomy.js';

// ECI velocity (km/s) → scene velocity (Earth radii per second), using the SAME axis mapping as
// `eciToThreeJS`: (x, y, z) → (x, z, −y), scaled by 1/R. Keeping this identical to the position
// convention guarantees the extrapolated point stays on the sampled trajectory.
export function eciVelocityToScene(vx, vy, vz, radiusKm = EARTH_RADIUS_KM) {
  return { x: vx / radiusKm, y: vz / radiusKm, z: -vy / radiusKm };
}

// Seconds to extrapolate from the last sampled simulation time to `nowMs`, clamped to
// [0, maxSeconds].
//
//   * A negative delta (a rewind / manual time scrub) clamps to 0 so satellites simply hold
//     their sampled position until the next propagation tick re-samples — never move backwards.
//   * An oversized forward delta (a stalled worker, a backgrounded tab) clamps to `maxSeconds`
//     so a satellite can never be flung far off its orbit by a single frame.
//
// The sampled step is at most the tick interval (1 s at 1×, ~5 simulation-seconds in fast
// forward), so a clamp of a couple of seconds only ever engages on an anomaly.
export function extrapolationDt(sampleSimMs, nowMs, maxSeconds = 2.0) {
  if (!Number.isFinite(sampleSimMs) || !Number.isFinite(nowMs)) return 0;
  const dt = (nowMs - sampleSimMs) / 1000;
  if (!(dt > 0)) return 0;
  return dt < maxSeconds ? dt : maxSeconds;
}

// Default clamp for extrapolationDt, exported so the caller and tests share one value.
export const MAX_EXTRAPOLATION_SEC = 2.0;

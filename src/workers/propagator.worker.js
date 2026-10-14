import * as satellite from 'satellite.js';
import { EARTH_RADIUS_KM } from '../utils/astronomy.js';
import { eciVelocityToScene } from '../utils/satelliteMotion.js';

let satrecs = [];
let ids     = [];

self.onmessage = (e) => {
  const { type, data } = e.data;

  if (type === 'init') {
    satrecs = [];
    ids     = [];
    for (const sat of data) {
      try {
        const rec = satellite.twoline2satrec(sat.tle1, sat.tle2);
        if (rec && !rec.error) {
          satrecs.push(rec);
        } else {
          satrecs.push(null);
        }
        ids.push(sat.id);
      } catch (_) {
        satrecs.push(null);
        ids.push(sat.id);
      }
    }
    self.postMessage({ type: 'ready', count: satrecs.length });
    return;
  }

  if (type === 'propagate') {
    const date  = new Date(data.timeMs);
    const count = satrecs.length;
    // positions: [x0,y0,z0, x1,y1,z1, ...] in Earth-radius units, Three.js coords
    const positions  = new Float32Array(count * 3);
    // velocities: same layout, Earth-radius units per second. The main thread dead-reckons
    // position + velocity * dt between ticks so the constellation glides instead of snapping.
    const velocities = new Float32Array(count * 3);
    const valid      = new Uint8Array(count);

    for (let i = 0; i < count; i++) {
      try {
        const rec = satrecs[i];
        if (!rec) {
          valid[i] = 0;
          continue;
        }
        const pv = satellite.propagate(rec, date);
        if (pv && pv.position && !isNaN(pv.position.x)) {
          const p = pv.position;
          // Right-handed ECI → Three.js: X → X, north pole Z → Y, east Y → -Z.
          positions[i * 3]     = p.x / EARTH_RADIUS_KM;
          positions[i * 3 + 1] = p.z / EARTH_RADIUS_KM;
          positions[i * 3 + 2] = -p.y / EARTH_RADIUS_KM;
          if (pv.velocity && Number.isFinite(pv.velocity.x)) {
            const v = eciVelocityToScene(pv.velocity.x, pv.velocity.y, pv.velocity.z, EARTH_RADIUS_KM);
            velocities[i * 3]     = v.x;
            velocities[i * 3 + 1] = v.y;
            velocities[i * 3 + 2] = v.z;
          }
          valid[i] = 1;
        }
      } catch (_) {
        valid[i] = 0;
      }
    }

    self.postMessage(
      { type: 'positions', positions, velocities, valid, ids },
      [positions.buffer, velocities.buffer, valid.buffer]
    );
  }
};

import * as satellite from 'satellite.js';

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
    const positions = new Float32Array(count * 3);
    const valid     = new Uint8Array(count);

    for (let i = 0; i < count; i++) {
      try {
        const rec = satrecs[i];
        if (!rec) {
          valid[i] = 0;
          continue;
        }
        const pv = satellite.propagate(rec, date);
        if (pv && pv.position && !isNaN(pv.position.x)) {
          const p   = pv.position;
          const R   = 6371;
          // ECI → Three.js: north pole (ECI Z) → Three.js Y
          positions[i * 3]     = p.x / R;
          positions[i * 3 + 1] = p.z / R;
          positions[i * 3 + 2] = p.y / R;
          valid[i] = 1;
        }
      } catch (_) {
        valid[i] = 0;
      }
    }

    self.postMessage(
      { type: 'positions', positions, valid, ids },
      [positions.buffer, valid.buffer]
    );
  }
};

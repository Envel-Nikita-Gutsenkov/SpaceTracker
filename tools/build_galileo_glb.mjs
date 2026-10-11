// Builds public/models/galileo.glb — a compact, physically-proportioned Galileo FOC
// (Full Operational Capability) navigation satellite, generated procedurally with no
// external asset and therefore no licensing constraints.
//
// Modelled from ESA's published Galileo FOC figures:
//   - body: rectangular box, 2.7 m x 1.2 m x 1.1 m
//   - two solar wings, 18.7 m tip-to-tip span (the satellite's largest dimension)
//   - nadir navigation-antenna array on the Earth-facing face
//
// Model frame (before the loader applies `facing: '-z'`):
//   +Y  = body long axis (carries the deployable solar wings' mount line)
//   +X  = solar-array span
//   +Z  = nadir (navigation antenna) axis -> aligned with Earth by the attitude code
//
// Run: node tools/build_galileo_glb.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMesh, addBox, buildGlb } from './glb_writer.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../public/models/galileo.glb');

// Real Galileo FOC dimensions (m).
const BODY_X = 1.2, BODY_Y = 2.7, BODY_Z = 1.1; // rectangular body box
const ARRAY_SPAN = 18.7;                          // tip-to-tip solar-array span

// --- Geometry -----------------------------------------------------------------

// Rectangular body box.
const body = createMesh();
addBox(body.positions, body.normals, 0, 0, 0, BODY_X, BODY_Y, BODY_Z);

// Two solar wings, each a 2x2 grid of panels lying in the XY plane; total span 18.7 m.
const solar = createMesh();
const PANEL_T = 0.05;
const WING_W = 2.4;                               // panel width along Y
const X_IN = BODY_X / 2;                          // wing root, at the body edge
const X_OUT = ARRAY_SPAN / 2;                     // wing tip
const X_MID = (X_IN + X_OUT) / 2;
for (const sx of [1, -1]) {
  for (const [xa, xb] of [[X_IN, X_MID], [X_MID, X_OUT]]) {
    for (const [ya, yb] of [[-WING_W / 2, 0], [0, WING_W / 2]]) {
      const cx = sx * (xa + xb) / 2;
      const cy = (ya + yb) / 2;
      addBox(solar.positions, solar.normals, cx, cy, 0, xb - xa, yb - ya, PANEL_T);
    }
  }
}

// Nadir navigation-antenna array on the Earth-facing (+Z) face.
const antenna = createMesh();
addBox(antenna.positions, antenna.normals, 0, 0, BODY_Z / 2 + 0.06, 1.0, 2.0, 0.12);

// Small service/equipment panel on the opposite (-Z) face.
const service = createMesh();
addBox(service.positions, service.normals, 0, 0, -BODY_Z / 2 - 0.05, 1.0, 2.0, 0.10);

const PARTS = [
  { name: 'body',    ...body,    color: [0.74, 0.75, 0.78, 1], metallic: 0.7,  roughness: 0.4 },
  { name: 'solar',   ...solar,   color: [0.06, 0.11, 0.30, 1], metallic: 0.45, roughness: 0.3 },
  { name: 'antenna', ...antenna, color: [0.85, 0.72, 0.32, 1], metallic: 0.85, roughness: 0.25 }, // gold nav array
  { name: 'service', ...service, color: [0.20, 0.21, 0.24, 1], metallic: 0.6,  roughness: 0.5 },
].map((p) => ({ ...p, positions: new Float32Array(p.positions), normals: new Float32Array(p.normals) }));

const glb = buildGlb(PARTS, 'Space/galileo procedural builder');
fs.writeFileSync(OUT, glb);

const triangleCount = PARTS.reduce((n, p) => n + p.positions.length / 9, 0);
console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${(glb.length / 1024).toFixed(1)} KB, ${triangleCount} triangles)`);

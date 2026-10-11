// Builds public/models/glonass.glb — a compact, physically-proportioned GLONASS-M
// navigation satellite, generated procedurally (no external asset / no licensing).
//
// The real GLONASS-M (Uragan-M bus) cannot be shipped from a stock 3D asset here
// (Sketchfab's GLONASS-M is auth-gated + CC-BY), so this script models the chassis
// from its published dimensions instead:
//   - pressurised body: cylindrical, ~1.6 m diameter x 3.7 m long
//   - two solar wings, ~7.8 m tip-to-tip span (the satellite's largest dimension)
//   - nadir antenna array on the Earth-facing face + a small equipment/propulsion bay
//
// Model frame (before the loader applies `facing: '-y'`):
//   +Y  = nadir (antenna) axis  -> aligned with Earth by the attitude code
//   +X  = solar-array span
//   +Z  = array width / body cross-axis
//
// Run: node tools/build_glonass_glb.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMesh, addBox, addCylinderY, addConeY, buildGlb } from './glb_writer.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../public/models/glonass.glb');

// --- Geometry -----------------------------------------------------------------

// Pressurised body.
const body = createMesh();
addCylinderY(body.positions, body.normals, 0, 0, 0, 0.8, 3.7);

// Nadir antenna array (dish) + its short feed horn aimed at Earth (+Y).
const antenna = createMesh();
addConeY(antenna.positions, antenna.normals, 0, 1.85, 0, 0.75, 2.05);
addCylinderY(antenna.positions, antenna.normals, 0, 2.05, 0, 0.08, 0.5);

// Two solar wings, each a 2x2 grid of panels; tip-to-tip span 7.8 m along X.
const solar = createMesh();
const PANEL_T = 0.04;
const X0 = 1.0, X_MID = 2.45, X1 = 3.9; // [X0..X_MID][X_MID..X1]
const Z0 = -0.6, Z_MID = 0.0, Z1 = 0.6;
for (const sx of [1, -1]) {
  for (const [xa, xb] of [[X0, X_MID], [X_MID, X1]]) {
    for (const [za, zb] of [[Z0, Z_MID], [Z_MID, Z1]]) {
      const cx = sx * (xa + xb) / 2;
      const cz = (za + zb) / 2;
      addBox(solar.positions, solar.normals, cx, 0, cz, xb - xa, PANEL_T, zb - za);
    }
  }
}

// Equipment / propulsion bay below the body.
const bay = createMesh();
addBox(bay.positions, bay.normals, 0, -2.05, 0, 1.0, 0.6, 1.0);

const PARTS = [
  { name: 'body',    ...body,    color: [0.78, 0.79, 0.82, 1], metallic: 0.7,  roughness: 0.4 },
  { name: 'antenna', ...antenna, color: [0.86, 0.87, 0.90, 1], metallic: 0.6,  roughness: 0.3 },
  { name: 'solar',   ...solar,   color: [0.06, 0.11, 0.30, 1], metallic: 0.45, roughness: 0.3 },
  { name: 'bay',     ...bay,     color: [0.20, 0.21, 0.24, 1], metallic: 0.6,  roughness: 0.5 },
].map((p) => ({ ...p, positions: new Float32Array(p.positions), normals: new Float32Array(p.normals) }));

const glb = buildGlb(PARTS, 'Space/glonass procedural builder');
fs.writeFileSync(OUT, glb);

const triangleCount = PARTS.reduce((n, p) => n + p.positions.length / 9, 0);
console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${(glb.length / 1024).toFixed(1)} KB, ${triangleCount} triangles)`);

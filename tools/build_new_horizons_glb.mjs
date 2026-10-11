// Builds public/models/new_horizons.glb from the official NASA 3D Resources
// New Horizons 3D-print kit. NASA only publishes New Horizons as STL print parts
// (no GLB), so this script downloads the authentic NASA STLs, merges the three
// assembled pieces (high-gain antenna, body, RTG) and writes a compact glTF 2.0
// binary container with per-part PBR materials.
//
// Source: https://github.com/nasa/NASA-3D-Resources (public domain / NASA media usage).
// Run:    node tools/build_new_horizons_glb.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../public/models/new_horizons.glb');

const BASE = 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Printing/New%20Horizons';

// Assembled pieces (body.stl is the full body; the *_l/*_r halves are print splits).
//
// The NASA files are *print* parts: each is authored on its own print bed, centred in
// X/Z and grounded at Y=0, in its own orientation. They are NOT a pre-assembled model,
// so merging them raw stacks the dish, body and RTG on top of each other. The
// `transform` below places each part into the spacecraft frame shown in NASA's
// `assembly.pdf` (dish on top of the body, RTG on its boom to the side), matching the
// model conventions the loader expects: body at the origin, +Y up (the dish axis points
// at +Y, which is also the Earth-pointed high-gain antenna).
const DEG = Math.PI / 180;
const PARTS = [
  { file: '7399_05_rp_antenna.stl', name: 'antenna', color: [0.82, 0.84, 0.88, 1], metallic: 0.6, roughness: 0.35,
    transform: { translate: [0.2, 2.0, 0.25] } },
  { file: '7399_05_rp_body.stl', name: 'body', color: [0.80, 0.66, 0.30, 1], metallic: 0.7, roughness: 0.4,
    transform: {} },
  { file: '7399_05_rp_rtg.stl', name: 'rtg', color: [0.22, 0.23, 0.25, 1], metallic: 0.5, roughness: 0.6,
    transform: { rotateZ: -90 * DEG, translate: [1.6, 1.1, 0.25] } },
];

// Apply an optional { rotateX?, rotateY?, rotateZ?, translate? } to a part's vertices.
// The rotation is applied to positions and (direction-only) to normals, then the
// translation shifts positions only.
function applyTransform(positions, normals, t) {
  if (!t) return;
  const rz = t.rotateZ || 0, rx = t.rotateX || 0, ry = t.rotateY || 0;
  const rot = (x, y, z) => {
    // Z
    let cx = Math.cos(rz), sx = Math.sin(rz);
    let x1 = cx * x - sx * y, y1 = sx * x + cx * y, z1 = z;
    // X
    cx = Math.cos(rx); sx = Math.sin(rx);
    let y2 = cx * y1 - sx * z1, z2 = sx * y1 + cx * z1;
    // Y
    const cy = Math.cos(ry), sy = Math.sin(ry);
    let x3 = cy * x1 + sy * z2, z3 = -sy * x1 + cy * z2;
    return [x3, y2, z3];
  };
  const [tx, ty, tz] = t.translate || [0, 0, 0];
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = rot(positions[i], positions[i + 1], positions[i + 2]);
    positions[i] = x + tx; positions[i + 1] = y + ty; positions[i + 2] = z + tz;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const [x, y, z] = rot(normals[i], normals[i + 1], normals[i + 2]);
    normals[i] = x; normals[i + 1] = y; normals[i + 2] = z;
  }
}

/** Parse a binary STL into { positions: Float32Array, normals: Float32Array }. */
function parseBinaryStl(buf) {
  const triCount = buf.readUInt32LE(80);
  if (buf.length < 84 + triCount * 50) throw new Error('not a binary STL');
  const positions = new Float32Array(triCount * 9);
  const normals = new Float32Array(triCount * 9);
  for (let i = 0; i < triCount; i++) {
    const o = 84 + i * 50 + 12; // skip the stored face normal (recomputed below)
    const ax = buf.readFloatLE(o), ay = buf.readFloatLE(o + 4), az = buf.readFloatLE(o + 8);
    const bx = buf.readFloatLE(o + 12), by = buf.readFloatLE(o + 16), bz = buf.readFloatLE(o + 20);
    const cx = buf.readFloatLE(o + 24), cy = buf.readFloatLE(o + 28), cz = buf.readFloatLE(o + 32);
    // Right-hand geometric normal.
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const p = i * 9;
    positions[p] = ax; positions[p + 1] = ay; positions[p + 2] = az;
    positions[p + 3] = bx; positions[p + 4] = by; positions[p + 5] = bz;
    positions[p + 6] = cx; positions[p + 7] = cy; positions[p + 8] = cz;
    for (let v = 0; v < 3; v++) {
      normals[p + v * 3] = nx; normals[p + v * 3 + 1] = ny; normals[p + v * 3 + 2] = nz;
    }
  }
  return { positions, normals };
}

/** Assemble the parsed parts into a single glTF 2.0 GLB buffer. */
function buildGlb(parts) {
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  const materials = [];
  const chunks = [];
  let byteOffset = 0;

  const pushView = (typedArray) => {
    const bytes = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    chunks.push(bytes);
    bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length, target: 34962 });
    byteOffset += bytes.length;
    return bufferViews.length - 1;
  };

  const bounds = (positions) => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const v = positions[i + a];
        if (v < min[a]) min[a] = v;
        if (v > max[a]) max[a] = v;
      }
    }
    return { min, max };
  };

  parts.forEach((part, index) => {
    const posView = pushView(part.positions);
    const nrmView = pushView(part.normals);
    const { min, max } = bounds(part.positions);
    accessors.push({ bufferView: posView, componentType: 5126, count: part.positions.length / 3, type: 'VEC3', min, max });
    const posAcc = accessors.length - 1;
    accessors.push({ bufferView: nrmView, componentType: 5126, count: part.normals.length / 3, type: 'VEC3' });
    const nrmAcc = accessors.length - 1;

    materials.push({
      name: part.name,
      pbrMetallicRoughness: {
        baseColorFactor: part.color,
        metallicFactor: part.metallic,
        roughnessFactor: part.roughness,
      },
      doubleSided: true,
    });
    meshes.push({ name: part.name, primitives: [{ attributes: { POSITION: posAcc, NORMAL: nrmAcc }, material: index, mode: 4 }] });
    nodes.push({ mesh: index, name: part.name });
  });

  const bin = Buffer.concat(chunks);
  const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const gltf = {
    asset: { version: '2.0', generator: 'Space/new_horizons STL merger', copyright: 'NASA 3D Resources (public domain)' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binPadded.length }],
  };

  const jsonPadded = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonPadded.length % 4)) % 4;
  const jsonBuf = Buffer.concat([jsonPadded, Buffer.alloc(jsonPad, 0x20)]);
  const binLen = binPadded.length;
  const total = 12 + 8 + jsonBuf.length + 8 + binLen;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binLen, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return Buffer.concat([header, jsonHeader, jsonBuf, binHeader, binPadded]);
}

async function main() {
  const parts = [];
  for (const part of PARTS) {
    const url = `${BASE}/${part.file}`;
    process.stdout.write(`Fetching ${part.file} ... `);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const { positions, normals } = parseBinaryStl(buf);
    applyTransform(positions, normals, part.transform);
    console.log(`${positions.length / 9} triangles`);
    parts.push({ ...part, positions, normals });
  }

  const glb = buildGlb(parts);
  fs.writeFileSync(OUT, glb);
  console.log(`\nWrote ${path.relative(process.cwd(), OUT)} (${(glb.length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

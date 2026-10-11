// Shared helpers for the procedural spacecraft GLB builders in this folder
// (build_glonass_glb.mjs, build_galileo_glb.mjs).
//
// Provides small primitive generators (box / cylinder / cone) that accumulate a flat
// triangle soup of positions + normals, and a minimal glTF 2.0 binary (.glb) writer.
// Kept dependency-free so the builders run under plain `node`.

/** A fresh mutable mesh accumulator. */
export function createMesh() {
  return { positions: [], normals: [] };
}

export function pushTri(positions, normals, a, b, c, n) {
  positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  normals.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
}

/** Axis-aligned box, 12 triangles with outward face normals. */
export function addBox(positions, normals, cx, cy, cz, sx, sy, sz) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const faces = [
    { n: [1, 0, 0],  v: [[hx, -hy, -hz], [hx, -hy, hz], [hx, hy, hz], [hx, hy, -hz]] },
    { n: [-1, 0, 0], v: [[-hx, -hy, hz], [-hx, -hy, -hz], [-hx, hy, -hz], [-hx, hy, hz]] },
    { n: [0, 1, 0],  v: [[-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]] },
    { n: [0, -1, 0], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, -hy, -hz], [-hx, -hy, -hz]] },
    { n: [0, 0, 1],  v: [[-hx, -hy, hz], [-hx, hy, hz], [hx, hy, hz], [hx, -hy, hz]] },
    { n: [0, 0, -1], v: [[hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, -hz]] },
  ];
  for (const f of faces) {
    const [v0, v1, v2, v3] = f.v.map((v) => [v[0] + cx, v[1] + cy, v[2] + cz]);
    pushTri(positions, normals, v0, v1, v2, f.n);
    pushTri(positions, normals, v0, v2, v3, f.n);
  }
}

/** Cylinder with its axis along +Y, smooth side normals, flat caps. */
export function addCylinderY(positions, normals, cx, cy, cz, r, h, segments = 24) {
  const hy = h / 2;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r;
    const x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
    const n0 = [Math.cos(a0), 0, Math.sin(a0)];
    const n1 = [Math.cos(a1), 0, Math.sin(a1)];
    const b0 = [cx + x0, cy - hy, cz + z0], t0 = [cx + x0, cy + hy, cz + z0];
    const b1 = [cx + x1, cy - hy, cz + z1], t1 = [cx + x1, cy + hy, cz + z1];
    positions.push(...b0, ...t0, ...t1); normals.push(...n0, ...n0, ...n1);
    positions.push(...b0, ...t1, ...b1); normals.push(...n0, ...n1, ...n1);
    const ct = [cx, cy + hy, cz], cb = [cx, cy - hy, cz];
    pushTri(positions, normals, ct, t0, t1, [0, 1, 0]);
    pushTri(positions, normals, cb, b1, b0, [0, -1, 0]);
  }
}

/** Shallow cone (dish / antenna horn) opening toward +Y: base ring at y0, apex at y1. */
export function addConeY(positions, normals, cx, cy0, cz, r, y1, segments = 24) {
  const apex = [cx, y1, cz];
  const h = y1 - cy0;
  const m = Math.hypot(r, h) || 1;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p0 = [cx + Math.cos(a0) * r, cy0, cz + Math.sin(a0) * r];
    const p1 = [cx + Math.cos(a1) * r, cy0, cz + Math.sin(a1) * r];
    const n0 = [Math.cos(a0) * (h / m), r / m, Math.sin(a0) * (h / m)];
    const n1 = [Math.cos(a1) * (h / m), r / m, Math.sin(a1) * (h / m)];
    const nApex = [0, 1, 0];
    positions.push(...p0, ...p1, ...apex); normals.push(...n0, ...n1, ...nApex);
    positions.push(...p0, ...apex, ...p1); normals.push(...n0, ...nApex, ...n1);
    pushTri(positions, normals, [cx, cy0, cz], p1, p0, [0, -1, 0]);
  }
}

/**
 * Assemble parts into a glTF 2.0 binary container.
 *
 * `parts` is an array of:
 *   { name, positions: Float32Array, normals: Float32Array, color:[r,g,b,a], metallic, roughness }
 * Each part becomes one mesh + one opaque, double-sided PBR material.
 * Returns the complete .glb Buffer.
 */
export function buildGlb(parts, generator = 'Space/procedural GLB builder') {
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
    asset: { version: '2.0', generator },
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
  const total = 12 + 8 + jsonBuf.length + 8 + binPadded.length;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binPadded.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return Buffer.concat([header, jsonHeader, jsonBuf, binHeader, binPadded]);
}

import * as THREE from 'three';

// THREE.SphereGeometry lays an equirectangular map's longitude toward −Z as the horizontal UV
// coordinate u grows, so a surface point at east longitude ends up at *decreasing* right
// ascension — the mirror of the standard map convention (east longitude ⇒ increasing RA).
// Mirroring u → 1−u restores the convention for every standard east-positive equirectangular
// texture (Earth day/night, Moon, and the NASA/USGS planet maps).
//
// Note: the sub-observer point at longitude 0 sits at u = 0.5, which is unchanged by the flip,
// so a tidally-locked body's near side keeps facing its parent while its features stop being
// left-right mirrored.
export function applyEquirectLongitudeUV(geometry) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  uv.needsUpdate = true;
  return geometry;
}

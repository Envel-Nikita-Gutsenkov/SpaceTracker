import * as THREE from 'three';
// Shared spin-sign so the field co-rotates with the Earth mesh (see Earth.update()).
// Explicit `.js` keeps this module importable by the node test suite, like Earth.js.
import { EARTH_ROTATION_Y_SIGN } from './Earth.js';

const BELT_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec3 vModelPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vModelPos = position;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
    #include <logdepthbuf_vertex>
  }
`;

const BELT_FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3  uColor;
  uniform float uOpacity;
  varying vec3  vNormal;
  varying vec3  vViewPos;
  varying vec3  vModelPos;

  void main() {
    #include <logdepthbuf_fragment>
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPos);
    // Volumetric limb brightening (fresnel / grazing angle)
    float rim = pow(1.0 - abs(dot(N, V)), 1.8);

    // Altitude taper: radiation belts have peak intensity around equatorial heart,
    // and gradually taper down towards the ionospheric mirror loss cone.
    float r = length(vModelPos);
    float sinLat = abs(vModelPos.y) / max(0.001, r);
    // Smooth attenuation near polar loss cone (sinLat approaching 1).
    // NOTE: smoothstep requires edge0 < edge1; using a reversed, spec-compliant form.
    float lossConeFade = 1.0 - smoothstep(0.40, 0.92, sinLat);

    float alpha = rim * uOpacity * (0.35 + 0.65 * lossConeFade);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

// Scientifically accurate dipole L-shell generator following geomagnetic field lines:
// r(lambda) = L * cos^2(lambda)
// where L is the McIlwain parameter in Earth radii, and lambda is magnetic latitude.
// The footprint terminates at the atmospheric loss cone (r_ionosphere = 1.0157) where:
// cos^2(lat_footprint) = 1.0157 / L  =>  lat_footprint = acos(sqrt(1.0157 / L))
//
// Model scope: a *centred* dipole — the field lines pass through the Earth's centre. The real
// field is an *eccentric* dipole whose centre sits ~489 km (0.077 R_earth; Fraser-Smith 1987)
// from the Earth's centre toward 20.4 deg N, 147 deg E, the source of the South Atlantic
// Anomaly. That offset is intentionally omitted: representing it correctly makes each field-line
// footpoint meet the atmosphere at a different radius, so the shells stop being surfaces of
// revolution (a naive translation dips them inside the solid Earth). See docs/ARCHITECTURE.md.
//
// Single source of truth for the belt model, exported so the verification suite can
// assert against the exact geometry that ships on screen.
export const R_IONOSPHERE = 1.0157;      // ~100 km altitude: atmospheric loss-cone footpoint

// Tilt of the best-fitting (centred) geomagnetic dipole axis from the rotation axis, for the
// current epoch: IGRF-13 (2020) gives atan(sqrt(g11^2 + h11^2) / |g10|) = 9.41 deg, and the
// 2020 geomagnetic pole sits at 80.65 deg N (90 - 80.65 = 9.35 deg). The commonly quoted
// 11.5 deg is the ~1975-1980 value — the pole has since drifted toward the geographic pole.
export const DIPOLE_TILT_DEG     = 9.4;  // geomagnetic dipole axis vs. rotation axis
// Azimuth of the dipole tilt about the rotation axis. The belt shell is a surface of
// revolution about the dipole axis, so this only sets where the (discrete) field-line
// fan points; the shell itself is invariant to it.
export const DIPOLE_AZIMUTH_DEG  = 70.0;

// Empirical radiation-belt extents in McIlwain L (Earth radii).
//   Inner  = energetic-proton belt           (peaks ~L 1.5)
//   Slot   = low-flux "safe" region          (~L 2.4 - 3.0)
//   Outer  = relativistic-electron belt      (peaks ~L 4 - 5)
export const INNER_BELT_L = [1.22, 2.35];
export const OUTER_BELT_L = [3.10, 6.00];

export function buildDipoleShellGeometry(L_in, L_out, segLat = 32, segPhi = 64) {
  const geo = new THREE.BufferGeometry();
  const positions = [];
  const indices = [];

  const rIonosphere = R_IONOSPHERE;
  const latFootprintIn  = Math.acos(Math.sqrt(Math.min(1.0, rIonosphere / L_in)));
  const latFootprintOut = Math.acos(Math.sqrt(Math.min(1.0, rIonosphere / L_out)));

  // Closed cross-section in (L, lat)
  const cross = [];
  // 1. Inner boundary curve (L_in) from South to North
  for (let i = 0; i <= segLat; i++) {
    const lat = -latFootprintIn + (i / segLat) * (2 * latFootprintIn);
    cross.push({ L: L_in, lat });
  }
  // 2. North pole transition cap from L_in to L_out along ionosphere
  for (let i = 1; i < 6; i++) {
    const frac = i / 6;
    const L = THREE.MathUtils.lerp(L_in, L_out, frac);
    const lat = Math.acos(Math.sqrt(Math.min(1.0, rIonosphere / L)));
    cross.push({ L, lat });
  }
  // 3. Outer boundary curve (L_out) from North back to South
  for (let i = 0; i <= segLat; i++) {
    const lat = latFootprintOut - (i / segLat) * (2 * latFootprintOut);
    cross.push({ L: L_out, lat });
  }
  // 4. South pole transition cap from L_out back to L_in along ionosphere
  for (let i = 1; i < 6; i++) {
    const frac = i / 6;
    const L = THREE.MathUtils.lerp(L_out, L_in, frac);
    const lat = -Math.acos(Math.sqrt(Math.min(1.0, rIonosphere / L)));
    cross.push({ L, lat });
  }

  const nC = cross.length;

  for (let p = 0; p <= segPhi; p++) {
    const phi = (p / segPhi) * Math.PI * 2;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);

    for (let c = 0; c < nC; c++) {
      const { L, lat } = cross[c];
      const cosLat = Math.cos(lat);
      const r = L * cosLat * cosLat;
      const x = r * cosLat * cosPhi;
      const y = r * Math.sin(lat);
      const z = r * cosLat * sinPhi;
      positions.push(x, y, z);
    }
  }

  for (let p = 0; p < segPhi; p++) {
    for (let c = 0; c < nC; c++) {
      const nextC = (c + 1) % nC;
      const a = p * nC + c;
      const b = p * nC + nextC;
      const d = (p + 1) * nC + c;
      const e = (p + 1) * nC + nextC;
      indices.push(a, b, d);
      indices.push(b, e, d);
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export class VanAllenBelts {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    // Earth's magnetic dipole axis is tilted by ~9.4° relative to the rotational axis (IGRF-13)
    this.group.rotation.z = (DIPOLE_TILT_DEG * Math.PI) / 180;
    // Earth-fixed azimuth of the tilt. The co-rotating GMST spin is layered on top in
    // update() so the tilt magnitude stays exactly DIPOLE_TILT_DEG.
    this._baseAzimuthRad = (DIPOLE_AZIMUTH_DEG * Math.PI) / 180;
    this.update(0);

    // 1. Inner Radiation Belt (Energetic protons, McIlwain L ~ 1.2 to 2.4 Earth radii)
    // Curving directly into the polar regions as magnetic horns
    const innerGeo = buildDipoleShellGeometry(INNER_BELT_L[0], INNER_BELT_L[1], 48, 64);
    const innerMat = new THREE.ShaderMaterial({
      vertexShader:   BELT_VERT,
      fragmentShader: BELT_FRAG,
      uniforms: {
        uColor:   { value: new THREE.Color(0.18, 0.68, 1.0) }, // Electric cyan-blue
        uOpacity: { value: 0.35 },
      },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
      side:        THREE.DoubleSide,
    });
    this.innerMesh = new THREE.Mesh(innerGeo, innerMat);
    this.group.add(this.innerMesh);

    // 2. Outer Radiation Belt (Relativistic electrons, McIlwain L ~ 3.2 to 6.2 Earth radii)
    // Much wider shell descending into sub-auroral polar ovals
    const outerGeo = buildDipoleShellGeometry(OUTER_BELT_L[0], OUTER_BELT_L[1], 56, 64);
    const outerMat = new THREE.ShaderMaterial({
      vertexShader:   BELT_VERT,
      fragmentShader: BELT_FRAG,
      uniforms: {
        uColor:   { value: new THREE.Color(0.85, 0.22, 0.95) }, // Violet-magenta
        uOpacity: { value: 0.22 },
      },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
      side:        THREE.DoubleSide,
    });
    this.outerMesh = new THREE.Mesh(outerGeo, outerMat);
    this.group.add(this.outerMesh);

    // 3. Dipole magnetic field lines (16 closed flux loops)
    this._buildMagneticFieldLines();

    this.group.visible = false;
    this.scene.add(this.group);
  }

  _buildMagneticFieldLines() {
    const loopCount = 16;
    const pointsPerLoop = 80;
    const positions = [];
    const colors = [];

    const col = new THREE.Color(0.35, 0.75, 1.0);

    for (let i = 0; i < loopCount; i++) {
      const azimuth = (i * Math.PI * 2) / loopCount;
      const L = 3.6; // Field line parameter
      const cosA = Math.cos(azimuth);
      const sinA = Math.sin(azimuth);

      // Emit explicit vertex PAIRS, one per segment: THREE.LineSegments connects
      // (0,1),(2,3),… so feeding it a raw polyline draws a dashed line with stray
      // cross-loop connectors. Every loop is therefore pushed as its own contiguous run
      // of pairs, and only the arc outside the loss cone (r >= R_IONOSPHERE) is kept.
      let prev = null;
      for (let j = 0; j <= pointsPerLoop; j++) {
        // Dipole equation: r = L * cos^2(lat)
        const lat = -Math.PI / 2.35 + (j / pointsPerLoop) * (Math.PI / 2.35 * 2);
        const r = L * Math.cos(lat) * Math.cos(lat);
        if (r < R_IONOSPHERE) { prev = null; continue; }

        const cosLat = Math.cos(lat);
        const p = [r * cosLat * cosA, r * Math.sin(lat), r * cosLat * sinA];
        if (prev) {
          positions.push(prev[0], prev[1], prev[2], p[0], p[1], p[2]);
          colors.push(col.r, col.g, col.b, col.r, col.g, col.b);
        }
        prev = p;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.fieldLines = new THREE.LineSegments(geo, mat);
    this.group.add(this.fieldLines);
  }

  // The geomagnetic field is frozen into the conducting interior and co-rotates with the
  // planet, so the whole tilted shell spins with the Earth's GMST. Applied as a world-Y
  // rotation on top of the Earth-fixed tilt azimuth, which leaves the dipole tilt angle
  // unchanged (asserted by tests/verify_van_allen.js).
  update(gmst = 0) {
    this.group.rotation.y = this._baseAzimuthRad + EARTH_ROTATION_Y_SIGN * gmst;
  }

  setVisibility(visible) {
    this.group.visible = visible;
  }

  dispose() {
    this.scene.remove(this.group);
    this.innerMesh.geometry.dispose();
    this.innerMesh.material.dispose();
    this.outerMesh.geometry.dispose();
    this.outerMesh.material.dispose();
    if (this.fieldLines) {
      this.fieldLines.geometry.dispose();
      this.fieldLines.material.dispose();
    }
  }
}

import * as THREE from 'three';
import { EARTH_RADIUS_KM } from '../utils/astronomy.js';
import { getBodyData } from '../utils/smallBodies.js';
import { ATMOSPHERE_BODIES, atmosphereLimbRim } from './planetAtmospheres.js';
import { resolveBodyAxesKm } from '../utils/bodyShape.js';

// Atmospheric limb glow.
//
// Rendered on a thin spherical shell just outside each body's surface, back-side and
// additive, so the planet's own opaque surface occludes everything except the annulus
// between the surface and the shell's silhouette.
//
// The key to a *soft* edge (the old front-side fresnel was brightest exactly at the shell
// boundary, so the geometry ended on a hard bright line): the emitted brightness is
// proportional to the optical path length of the view ray through the shell. For a sphere
// that length is  2·√(R₁² − b²)  with impact parameter b = R₁·√(1 − (N·V)²), which reduces
// to |N·V| — and is *exactly zero at the outer silhouette*. The glow therefore fades
// smoothly into space, with no visible geometric cutoff, and peaks right at the planet's
// limb, which is also where the real aureole is brightest.

const VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos    = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3  sunDir;    // direction from this body's centre toward the Sun
  uniform vec3  camPos;
  uniform vec3  limbColor;
  uniform float intensity; // peak alpha at the limb
  uniform float limbRim;   // |N·V| at the planet's limb (see atmosphereLimbRim)

  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    #include <logdepthbuf_fragment>
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(camPos - vWorldPos);
    vec3 S = normalize(sunDir);

    // Optical depth through the shell ∝ |N·V|: 0 at the outer silhouette, 1 at the limb.
    float rim = abs(dot(N, V)) / max(limbRim, 1e-4);
    float t   = clamp(rim, 0.0, 1.0);

    // Only the sunlit limb glows; the night limb stays dark (no artificial night halo).
    float lit = smoothstep(-0.25, 0.30, dot(N, S));

    float alpha = pow(t, 1.5) * lit * intensity;
    if (alpha <= 0.002) discard;

    gl_FragColor = vec4(limbColor, alpha);
  }
`;

export class Atmosphere {
  constructor(scene, planetarySystem = null) {
    this.scene = scene;
    this.planetarySystem = planetarySystem;
    this.entries = [];
    this._vDir = new THREE.Vector3();

    for (const [id, cfg] of Object.entries(ATMOSPHERE_BODIES)) {
      const data = getBodyData(id);
      if (!data || !(data.radiusKm > 0)) continue;

      // The shell must hug the body's actual surface, so it inherits its shape: an oblate planet
      // (Jupiter, Saturn…) would otherwise let the equatorial limb sink inside its own equator,
      // because the shell radius is derived from the volume-equivalent radiusKm. Bake the body's
      // semi-axes x (1+height) into the geometry and recompute normals so the limb normal is exact
      // on the squashed shell. For a spherical body this is exactly the old
      // `SphereGeometry(shellRadius)`.
      const axes = resolveBodyAxesKm(data);
      const grow = 1 + cfg.height;

      const uniforms = {
        sunDir:    { value: new THREE.Vector3(1, 0, 0) },
        camPos:    { value: new THREE.Vector3() },
        limbColor: { value: new THREE.Color(cfg.color) },
        intensity: { value: cfg.intensity },
        limbRim:   { value: atmosphereLimbRim(cfg.height) },
      };

      const shellGeo = new THREE.SphereGeometry(1, 64, 64);
      shellGeo.scale(
        (axes.x / EARTH_RADIUS_KM) * grow,
        (axes.y / EARTH_RADIUS_KM) * grow,
        (axes.z / EARTH_RADIUS_KM) * grow,
      );
      shellGeo.computeVertexNormals();

      const mesh = new THREE.Mesh(
        shellGeo,
        new THREE.ShaderMaterial({
          uniforms,
          vertexShader:   VERT,
          fragmentShader: FRAG,
          side:           THREE.BackSide,
          transparent:    true,
          depthTest:      true,
          depthWrite:     false,
          blending:       THREE.AdditiveBlending,
        }),
      );
      mesh.renderOrder = 1;

      // Parent each shell to its body's own group so it inherits motion, tilt and — for the
      // dwarf planets and moons — the show/hide visibility for free. Earth sits at the scene
      // origin (it is rendered by Earth.js, not by PlanetarySystem).
      let parent = null;
      if (id === 'earth') {
        parent = scene;
      } else if (planetarySystem) {
        const obj = planetarySystem.planets?.get(id) || planetarySystem.smallBodies?.get(id);
        // Parent to the body's orientation pivot — it carries the real, time-dependent IAU pole
        // (or the legacy fixed tilt), so the oblate shell hugs the true spin axis and needs no
        // rotation of its own. Fall back to the group for stub systems that predate the pivot.
        parent = obj?.bodyPivot || obj?.group || null;
      }
      if (!parent) continue;

      parent.add(mesh);
      mesh.visible = false;
      this.entries.push({ id, mesh, uniforms });
    }
  }

  setVisibility(visible) {
    for (const e of this.entries) e.mesh.visible = visible;
  }

  update(camera, sunPosition, sunDir) {
    // Guard the camera slot: a stale hot-reload could call this with a Vector3 (or before init),
    // which used to throw on copy(undefined). Skipping the uniform update is harmless — the
    // previous frame's value stands until a real camera arrives.
    const camPos = camera && camera.position ? camera.position : null;
    for (const e of this.entries) {
      if (camPos) e.uniforms.camPos.value.copy(camPos);

      // World direction from this body's centre to the Sun. Near Earth (both at the origin)
      // the difference underflows, so fall back to the global Sun direction.
      e.mesh.getWorldPosition(this._vDir);
      if (sunPosition) this._vDir.subVectors(sunPosition, this._vDir);
      else this._vDir.set(0, 0, 0);

      if (this._vDir.lengthSq() < 1e-8 && sunDir) {
        e.uniforms.sunDir.value.copy(sunDir);
      } else {
        e.uniforms.sunDir.value.copy(this._vDir).normalize();
      }
    }
  }

  dispose() {
    for (const e of this.entries) {
      e.mesh.parent?.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
    }
    this.entries.length = 0;
  }
}

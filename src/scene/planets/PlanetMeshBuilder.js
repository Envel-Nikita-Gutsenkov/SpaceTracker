import * as THREE from 'three';
import { EARTH_RADIUS_KM } from '../../utils/astronomy';
import { getBodyData } from '../../utils/smallBodies';
import { PlanetTextureGenerator, PLANET_LOD_TIERS, PLANET_LOD_OPTIONS } from './PlanetTextureGenerator';
import { applyEquirectLongitudeUV } from './equirectUV.js';
import { resolveBodyAxesKm } from '../../utils/bodyShape.js';

// Pluto was only photographed in detail on its New Horizons encounter hemisphere. The global
// map fills the unobserved south polar region by interpolation, so everything below roughly
// -30° latitude is a visibly smeared, featureless mush. Rather than show that, we fade the
// southern cap to shadow (it was in continuous winter darkness during the 2015 flyby anyway,
// so it reads as polar night). The values are vMapUv.y — the sphere's north pole sits at
// uv.y = 1 and the south pole at uv.y = 0.
const PLUTO_SHADOW_START_UV = 0.333; // latitude -30°: last still-sharp row, left untouched
const PLUTO_SHADOW_FULL_UV  = 0.222; // latitude -50°: fully blurred, faded to shadow

function applyPlutoSouthPolarShadow(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      #ifdef USE_MAP
        float plutoSouth = smoothstep(${PLUTO_SHADOW_FULL_UV}, ${PLUTO_SHADOW_START_UV}, vMapUv.y);
        diffuseColor.rgb *= mix(0.04, 1.0, plutoSouth);
      #endif`
    );
  };
  // Distinct cache key so this patched program is never shared with the other, unpatched
  // MeshStandardMaterials (a shared program would drop the shadow and mis-render Pluto).
  material.customProgramCacheKey = () => 'pluto-south-polar-shadow';
}

// One unit sphere shared by every planet, dwarf and moon. Each body supplies its own radius
// through `mesh.scale`, so the 96x96 sphere, its normals and its de-mirrored UVs are built exactly
// once instead of once per body. With hundreds of moons this drops geometry memory from O(bodies)
// to O(1) and removes a repeated ~55k-triangle build from startup.
let SHARED_BODY_GEOMETRY = null;
let SHARED_BEACON_GEOMETRY = null;

function sharedBodyGeometry() {
  if (!SHARED_BODY_GEOMETRY) {
    // Segments: 96x96 for a smooth silhouette on close planetary fly-bys.
    // Mirror the horizontal UV so standard east-positive equirectangular maps are not
    // east-west mirrored (same convention as the Earth globe).
    SHARED_BODY_GEOMETRY = applyEquirectLongitudeUV(new THREE.SphereGeometry(1, 96, 96));
  }
  return SHARED_BODY_GEOMETRY;
}

function sharedBeaconGeometry() {
  if (!SHARED_BEACON_GEOMETRY) SHARED_BEACON_GEOMETRY = new THREE.SphereGeometry(1, 8, 8);
  return SHARED_BEACON_GEOMETRY;
}

export class PlanetMeshBuilder {
  // `options.lazyTexture` defers the (expensive) procedural surface synthesis of bodies that have
  // no photo to stream until the body is first shown — see `ensureTexture` on the returned object.
  static createPlanet(planetId, lodManager = null, options = {}) {
    const data = getBodyData(planetId);
    if (!data) return null;
    const lazyTexture = options.lazyTexture === true;

    const group = new THREE.Group();
    group.name = `planet_${planetId}`;

    // Radius in Three.js units (Earth radius R_earth = 6371 km = 1.0 unit)
    const radiusUnits = data.radiusKm / EARTH_RADIUS_KM;

    // 1. Photosphere / Surface Sphere (shared unit sphere; radius applied via `bodyMesh.scale`)
    const sphereGeo = sharedBodyGeometry();

    // Two ways the surface map arrives:
    //  • Tiered bodies (see PLANET_LOD_TIERS) stream coarse→fine resolutions by camera
    //    proximity; `PlanetarySystem` advances the tiers and rebinds the material each frame.
    //  • Every other body loads a single real map as a *fresh* texture over the procedural
    //    placeholder (see PlanetTextureGenerator). Both are non-null textures, so the swap is
    //    a reference change and never triggers a shader recompile.
    const lodTiers = lodManager ? PLANET_LOD_TIERS[planetId] : null;
    // Stream the tiers lazily: only the 2K base is fetched at boot, and the 4K/8K tier loads
    // once the camera closes in. The loaded tier is then kept resident (`PLANET_LOD_OPTIONS`,
    // `evict: Infinity`): releasing it on zoom-out made the next approach re-download, re-decode
    // and synchronously re-upload the map — the hard freeze on every return to a body. Preloading
    // every tier here would be different and still wrong: it would fetch and upload the finest
    // maps for all bodies at boot, holding hundreds of MB and stalling the loading overlay.
    const lod = lodTiers ? lodManager.create(lodTiers, PLANET_LOD_OPTIONS) : null;

    // Lazy pays off only for bodies with no photo to stream: their surface is a procedural canvas,
    // expensive to synthesise (a 512x256 fractal-noise pass) and pure dead weight while the body is
    // hidden. Bodies that DO have a real map stay eager so the photo is decoded before the body is
    // ever revealed (no placeholder-to-photo flash on the first toggle).
    const canLazy = lazyTexture && !lod && !PlanetTextureGenerator.hasRealMap(planetId);

    let sphereMat;
    const texture = lod
      ? lod.texture
      : canLazy
        ? PlanetTextureGenerator.getPlaceholderTexture()
        : PlanetTextureGenerator.getTexture(planetId, (realTexture) => {
            if (sphereMat) sphereMat.map = realTexture;
          }, lodManager ? lodManager.renderer : null);

    sphereMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: planetId === 'venus' ? 0.7 : 0.85,
      metalness: 0.05,
    });

    if (planetId === 'pluto') applyPlutoSouthPolarShadow(sphereMat);

    const bodyMesh = new THREE.Mesh(sphereGeo, sphereMat);
    // Non-spherical bodies (Haumea, the oblate gas giants, the irregular moons…) reuse this SAME
    // unit sphere and become a triaxial ellipsoid through a NON-UNIFORM scale — no extra geometry,
    // so there is no memory or build-time cost. `resolveBodyAxesKm` orders the axes for the sphere
    // frame (+Y = polar/spin axis), so the polar semi-axis c lands on Y and the equatorial a, b on
    // X, Z. NormalMatrix handles the squashed normals correctly. Bodies without a `shape` resolve
    // to a uniform radiusKm on all three axes, i.e. the previous `setScalar` behaviour.
    const axes = resolveBodyAxesKm(data);
    bodyMesh.scale.set(
      axes.x / EARTH_RADIUS_KM,
      axes.y / EARTH_RADIUS_KM,
      axes.z / EARTH_RADIUS_KM,
    );
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    // Marks a shared singleton geometry so per-system teardown never disposes it (see
    // PlanetarySystem.dispose) — disposing it once would blank every other body.
    bodyMesh.userData.sharedGeometry = true;

    // Tilt the body by its axial tilt relative to the orbital plane.
    //
    // MUST use 'ZYX' order: the tilt (Z) has to be applied first and the daily spin (Y) about the
    // already-tilted axis. In the default 'XYZ' order the per-frame spin re-orients the tilt, so
    // the pole drifts across latitudes over a single sidereal day (Pluto's sub-observer latitude
    // swung from +21° down to -22° and back) and every tilted body's axis visibly wobbles. With
    // 'ZYX' the rotation axis stays fixed in space.
    const tiltRad = (data.axialTiltDeg || 0) * (Math.PI / 180.0);
    bodyMesh.rotation.order = 'ZYX';
    bodyMesh.rotation.z = -tiltRad;
    group.add(bodyMesh);

    // 2. Planetary Rings (Saturn, Uranus, Haumea, Quaoar). Only bodies with published
    // inner/outer radii are drawn; the faint dwarf-planet rings are left to a future pass.
    let ringMesh = null;
    if (data.hasRings && data.ringInnerRatio && data.ringOuterRatio) {
      const innerR = radiusUnits * data.ringInnerRatio;
      const outerR = radiusUnits * data.ringOuterRatio;

      const ringGeo = new THREE.RingGeometry(innerR, outerR, 96);
      ringGeo.rotateX(-Math.PI / 2.0); // Align with equatorial plane of the planet

      // Map UV radially so 1D ring texture wraps along radius
      const pos = ringGeo.attributes.position;
      const uvs = ringGeo.attributes.uv;
      const count = pos.count;
      for (let i = 0; i < count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const dist = Math.sqrt(x * x + z * z);
        const normR = (dist - innerR) / (outerR - innerR);
        uvs.setXY(i, Math.max(0, Math.min(1, normR)), 0.5);
      }
      uvs.needsUpdate = true;

      const ringTex = PlanetTextureGenerator.createSaturnRingTexture();
      const ringMat = new THREE.MeshStandardMaterial({
        map: ringTex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        roughness: 0.6,
        metalness: 0.1,
      });

      ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.z = -tiltRad;
      group.add(ringMesh);
    }

    // 3. Compact visual beacon marker for extreme distance visibility (shared unit sphere,
    // scaled to the body's marker radius).
    const beaconMat = new THREE.MeshBasicMaterial({
      color: data.colorHex,
      transparent: true,
      opacity: 0.8,
    });
    const beaconMesh = new THREE.Mesh(sharedBeaconGeometry(), beaconMat);
    beaconMesh.scale.setScalar(Math.max(0.04, radiusUnits * 0.05));
    beaconMesh.userData.sharedGeometry = true;
    group.add(beaconMesh);

    // Synthesise the real procedural surface on demand (no-op once built). Bodies built eagerly
    // have their texture already, so `ensureTexture` is null for them.
    let textureEnsured = false;
    const ensureTexture = canLazy
      ? () => {
          if (textureEnsured) return;
          textureEnsured = true;
          // Synthesise off the main thread (see PlanetTextureGenerator.getGenericTextureAsync).
          // The shared placeholder stays bound until the worker returns, so revealing a group of
          // bodies at once (the moons/dwarf toggle) never stalls a frame. `canLazy` implies the
          // body has no real map, so this procedural canvas is its final surface.
          PlanetTextureGenerator.getGenericTextureAsync(planetId, (tex) => {
            if (sphereMat) sphereMat.map = tex;
          });
        }
      : null;

    return {
      group,
      bodyMesh,
      ringMesh,
      beaconMesh,
      data,
      radiusUnits,
      lod,
      ensureTexture,
      tiltRad,
      rotSpeed: data.rotPeriodHours ? (2.0 * Math.PI) / (Math.abs(data.rotPeriodHours) * 3600) : 0,
      rotSign: (data.rotPeriodHours || 1) > 0 ? 1 : -1,
    };
  }
}

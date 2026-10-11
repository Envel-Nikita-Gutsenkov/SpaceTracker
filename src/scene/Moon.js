import * as THREE from 'three';
import { getMoonPositionECI, MOON_RADIUS_UNITS } from '../utils/astronomy';
import { applyEquirectLongitudeUV } from './planets/equirectUV.js';
import { TextureLODManager } from './planets/TextureLODManager.js';

// Camera distance (Earth radii = 1 unit) within which the heavy 8K LROC map is active. The Moon
// sits ~60 units from the camera in the default view, so the 2K base is what shows until the
// camera closes in for a lunar fly-by.
const MOON_HIRES_DISTANCE = 5.0;

const MOON_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vUv          = uv;
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos    = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const MOON_FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D moonTex;
  uniform vec3      sunDir;
  uniform vec3      camPos;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  // Simple procedural hash for close-up lunar surface regolith micro-texture
  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float regolithNoise(vec2 uv) {
    vec2 i = floor(uv);
    vec2 f = fract(uv);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 N = normalize(vWorldNormal);
    vec3 S = normalize(sunDir);
    vec3 V = normalize(camPos - vWorldPos);

    float camDist = length(camPos - vWorldPos);

    // High-resolution lunar albedo map (8K NASA LROC/USGS)
    vec4 albedo = texture2D(moonTex, vUv);

    // Close-up procedural regolith micro-relief:
    // When zooming in close (camDist < 0.8 units), inject multi-octave micro-crater noise
    // to preserve razor-sharp tactile detail down to the surface level without pixel blurring
    float closeBlend = clamp((0.8 - camDist) / 0.65, 0.0, 1.0);
    if (closeBlend > 0.01) {
      float micro = regolithNoise(vUv * 1600.0) * 0.5 + regolithNoise(vUv * 3200.0) * 0.25;
      albedo.rgb *= 1.0 + (micro - 0.38) * 0.22 * closeBlend;
    }

    // Lunar regolith scattering model (Lambert + subtle Lommel-Seeliger backscatter)
    float dotNS = dot(N, S);
    float dayFactor = clamp(dotNS, 0.0, 1.0);

    // Micro-contrast enhancement for craters
    vec3 baseRegolith = albedo.rgb;
    vec3 enhancedCrater = pow(baseRegolith, vec3(1.10)) * 1.18;

    // Moon has no atmosphere, sharp terminator line with earthshine ambient
    vec3 litColor   = enhancedCrater * dayFactor * 1.35;
    vec3 darkColor  = baseRegolith * 0.02; // Earthshine illumination on night side

    vec3 finalColor = litColor + darkColor;
    gl_FragColor    = vec4(finalColor, 1.0);
  }
`;

export class MoonObject {
  constructor(scene, renderer = null) {
    this.scene = scene;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.visible = true;

    // Stream the lunar map in two tiers by camera proximity (see TextureLODManager): the ~0.8 MB
    // 2K base paints instantly (and uploads to the GPU behind the boot gate), while the 14 MB 8K
    // LROC map only loads once the camera closes in. Both tiers are the SAME image — the 2K is a
    // Lanczos downscale of the 8K — so a tier swap changes resolution only, never colour or tone.
    this.textureLod = new TextureLODManager(renderer);
    this._moonLod = this.textureLod.create([
      { url: '/moon_2k.jpg',  distance: Infinity },
      { url: '/moon_8k.webp', distance: MOON_HIRES_DISTANCE },
    ]);

    this.uniforms = {
      moonTex: { value: this._moonLod.texture },
      sunDir:  { value: new THREE.Vector3(1, 0, 0) },
      camPos:  { value: new THREE.Vector3() },
    };

    // Physical radius of Moon = 1737.4 km / 6371 km = ~0.2727 Three.js units
    // Mirror the horizontal UV so the standard east-positive lunar map is not east-west
    // mirrored. Longitude 0 (the near side) sits at u = 0.5, so the sub-Earth point is
    // unchanged and the near side still faces Earth.
    const geo = applyEquirectLongitudeUV(new THREE.SphereGeometry(MOON_RADIUS_UNITS, 64, 64));
    const mat = new THREE.ShaderMaterial({
      uniforms:       this.uniforms,
      vertexShader:   MOON_VERT,
      fragmentShader: MOON_FRAG,
      depthTest:      true,
      depthWrite:     true,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.group.add(this.mesh);

    // Dynamic real-time orbital trajectory ring with directional white gradient
    const orbitSteps = 480;
    this.orbitSteps = orbitSteps;
    const orbitPositions = new Float32Array((orbitSteps + 1) * 3);
    const orbitColors = new Float32Array((orbitSteps + 1) * 3);
    const orbitGeo = new THREE.BufferGeometry();
    orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPositions, 3));
    orbitGeo.setAttribute('color', new THREE.BufferAttribute(orbitColors, 3));
    const orbitMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent:  true,
      blending:     THREE.AdditiveBlending,
      depthWrite:   false,
    });
    this.orbitLine = new THREE.Line(orbitGeo, orbitMat);
    this.orbitLine.renderOrder = -20;
    this.orbitLine.visible = true;
    this.scene.add(this.orbitLine);
    this._lastOrbitEpoch = 0;

    // Selenocentric Lunar Orbiters (Real NASA/ISRO/KARI operational missions)
    // Real selenocentric orbital parameters: RAAN, inclination, argument of periapsis, distinct orbital planes
    this.lunarSats = [
      {
        name: 'LRO (Lunar Reconnaissance Orbiter)',
        noradId: 35315,
        agency: 'NASA',
        altKm: 50, // 50 km polar mapping orbit
        periodMin: 113,
        incDeg: 90.0,
        raanDeg: 42.0,   // True distinct nodal orientation
        phaseOffset: 0.15,
        color: 0x38bdf8,
      },
      {
        name: 'Chandrayaan-2 Orbiter',
        noradId: 44441,
        agency: 'ISRO',
        altKm: 100, // 100 km circular polar orbit
        periodMin: 118,
        incDeg: 89.8,
        raanDeg: 135.0,  // Crossing nodal plane at ~90 deg difference
        phaseOffset: 0.58,
        color: 0xf59e0b,
      },
      {
        name: 'Danuri (KPLO)',
        noradId: 53323,
        agency: 'KARI',
        altKm: 100, // 100 km mission orbit
        periodMin: 118,
        incDeg: 89.5,
        raanDeg: 228.0,  // Independent Korean lunar mission orbital plane
        phaseOffset: 0.82,
        color: 0x10b981,
      },
      {
        name: 'CAPSTONE (Near Rectilinear Halo Orbit)',
        noradId: 52914,
        agency: 'NASA / Advanced Space',
        altKm: 1600, // NRHO halo surrogate
        periodMin: 240,
        incDeg: 85.0,
        raanDeg: 310.0,
        phaseOffset: 0.33,
        color: 0xa855f7,
      },
    ];

    // Build selenocentric satellite group attached directly to the Moon group
    this.satGroup = new THREE.Group();
    this.satMeshes = [];

    this.lunarSats.forEach(sat => {
      // 1. Orbit line in lunar coordinate frame with true 3D spatial rotation (Inclination & RAAN)
      const rUnits = (1737.4 + sat.altKm) / 6371; // In Earth-radius units
      const incRad = sat.incDeg * (Math.PI / 180);
      const raanRad = (sat.raanDeg || 0) * (Math.PI / 180);
      const orbitPts = [];
      const steps = 96;
      for (let i = 0; i <= steps; i++) {
        const u = (i / steps) * Math.PI * 2;
        // Position in orbital plane: (r * cos u, r * sin u, 0)
        // Rotated by inclination around X and RAAN around Y:
        const xOrb = rUnits * Math.cos(u);
        const yOrb = rUnits * Math.sin(u) * Math.sin(incRad);
        const zOrb = rUnits * Math.sin(u) * Math.cos(incRad);
        
        // Rotate around lunar polar axis by RAAN
        const xRot = xOrb * Math.cos(raanRad) - zOrb * Math.sin(raanRad);
        const zRot = xOrb * Math.sin(raanRad) + zOrb * Math.cos(raanRad);
        orbitPts.push(new THREE.Vector3(xRot, yOrb, zRot));
      }
      const lineGeo = new THREE.BufferGeometry().setFromPoints(orbitPts);
      const lineMat = new THREE.LineBasicMaterial({
        color: sat.color,
        transparent: true,
        opacity: 0.75,
      });
      const orbitTrace = new THREE.Line(lineGeo, lineMat);
      orbitTrace.visible = false; // Never clutter view with static orbit rings until clicked
      this.satGroup.add(orbitTrace);

      // 2. Visible satellite point beacon
      const dotGeo = new THREE.SphereGeometry(0.003, 8, 8);
      const dotMat = new THREE.MeshBasicMaterial({ color: sat.color });
      const dotMesh = new THREE.Mesh(dotGeo, dotMat);
      this.satGroup.add(dotMesh);

      this.satMeshes.push({
        sat,
        mesh: dotMesh,
        orbitTrace,
        rUnits,
        incRad,
        raanRad,
        phaseOffset: sat.phaseOffset || 0,
        periodMs: sat.periodMin * 60 * 1000,
      });
    });

    this.group.add(this.satGroup);
    this.scene.add(this.group);
  }

  update(date, sunDir, camera, selectedSatId = null, showAllOrbits = false, showPlanetaryOrbits = true) {
    const moonData = getMoonPositionECI(date);
    const mx = moonData.three.x;
    const my = moonData.three.y;
    const mz = moonData.three.z;

    this.mesh.position.set(mx, my, mz);
    this.satGroup.position.set(mx, my, mz);

    // Tidal locking: the Moon rotates synchronously and always points the near side to Earth
    this.mesh.lookAt(0, 0, 0);

    // Update dynamic lunar orbit trajectory ring relative to current date (recalculated periodically)
    // Only display lunar orbit when zoomed out from Moon and Earth, and if showPlanetaryOrbits is true
    const moonPos = this.mesh.position;
    const camDistToMoon = camera ? camera.position.distanceTo(moonPos) : 10.0;

    // Stream the lunar surface resolution tiers by camera proximity and rebind the active one.
    if (camera) {
      this._moonLod.update(camDistToMoon);
      const activeMap = this._moonLod.texture;
      if (this.uniforms.moonTex.value !== activeMap) this.uniforms.moonTex.value = activeMap;
    }

    const camDistToEarth = camera ? camera.position.length() : 10.0;
    const isZoomedOut = camDistToMoon > 8.0 && camDistToEarth > 60.0;
    this.orbitLine.visible = Boolean(showPlanetaryOrbits && isZoomedOut);

    const timeMs = date.getTime();
    if (this.orbitLine.visible) {
      const fade = Math.min(1.0, Math.max(0.0, (camDistToMoon - 8.0) / 10.0));
      this.orbitLine.material.opacity = fade * 0.85;

      if (Math.abs(timeMs - this._lastOrbitEpoch) > 3600000 || this._lastOrbitEpoch === 0) {
        this._lastOrbitEpoch = timeMs;
        const posAttr = this.orbitLine.geometry.attributes.position;
        const colAttr = this.orbitLine.geometry.attributes.color;
        const siderealMonthMs = 27.321661 * 86400000;
        for (let i = 0; i <= this.orbitSteps; i++) {
          const frac = i / this.orbitSteps;
          // frac = 0 is Moon's current position; tracing backwards in time along the traversed path
          const stepDate = new Date(timeMs - frac * siderealMonthMs);
          const data = getMoonPositionECI(stepDate);
          posAttr.setXYZ(i, data.three.x, data.three.y, data.three.z);

          // Directional white gradient: 1.0 (pure white) at Moon, tapering smoothly to 0.15 ahead
          const brightness = (0.15 + 0.85 * Math.pow(1.0 - frac, 1.4)) * fade;
          colAttr.setXYZ(i, brightness, brightness, brightness);
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
      }
    }

    // Gate selenocentric satellite visibility by camera distance (hide when out at the Sun)
    const isNearMoonOrEarth = camDistToMoon <= 200.0 || camDistToEarth <= 200.0;
    const isSelectedLunarSat = selectedSatId && this.satMeshes.some(m => m.sat.id === selectedSatId || m.sat.noradId === selectedSatId);
    this.satGroup.visible = Boolean(this.visible && (isNearMoonOrEarth || isSelectedLunarSat));

    // Update selenocentric satellite positions around the Moon & orbit line visibility
    this.satMeshes.forEach(item => {
      // Orbit line is ONLY visible if this satellite is currently clicked/selected, or if user toggled 'All Orbits'
      const isSelected = selectedSatId && (item.sat.id === selectedSatId || item.sat.noradId === selectedSatId);
      item.orbitTrace.visible = Boolean(isSelected || showAllOrbits);

      // Phase accounting for distinct epoch offset so satellites never bunch together
      const phase = ((timeMs % item.periodMs) / item.periodMs + item.phaseOffset) % 1.0;
      const u = phase * Math.PI * 2;
      const xOrb = item.rUnits * Math.cos(u);
      const yOrb = item.rUnits * Math.sin(u) * Math.sin(item.incRad);
      const zOrb = item.rUnits * Math.sin(u) * Math.cos(item.incRad);

      // Rotate by RAAN around polar axis
      const xRot = xOrb * Math.cos(item.raanRad) - zOrb * Math.sin(item.raanRad);
      const zRot = xOrb * Math.sin(item.raanRad) + zOrb * Math.cos(item.raanRad);

      item.mesh.position.set(xRot, yOrb, zRot);
    });

    this.uniforms.sunDir.value.copy(sunDir);
    if (camera) {
      this.uniforms.camPos.value.copy(camera.position);
    }
  }

  setVisibility(visible) {
    this.visible = visible;
    this.group.visible = visible;
    if (!visible && this.orbitLine) this.orbitLine.visible = false;
  }

  getPosition() {
    return this.mesh.position.clone();
  }

  getPositionOf(satId) {
    const item = this.satMeshes.find(m => m.sat.id === satId || m.sat.noradId === satId);
    if (!item) return null;
    const worldPos = new THREE.Vector3();
    item.mesh.getWorldPosition(worldPos);
    return worldPos;
  }

  pick(ndcX, ndcY, camera) {
    if (!this.visible || !this.satMeshes.length) return null;

    const clickNDC = new THREE.Vector2(ndcX, ndcY);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(clickNDC, camera);
    const ray = raycaster.ray;

    const tempV = new THREE.Vector3();
    let bestSat = null;
    let minScore = Infinity;

    for (const item of this.satMeshes) {
      item.mesh.getWorldPosition(tempV);

      // Distance from ray in 3D
      const distToRay = ray.distanceToPoint(tempV);

      // Project to screen NDC
      tempV.project(camera);
      if (tempV.z <= -1.0 || tempV.z >= 1.0) continue;

      const dx = tempV.x - clickNDC.x;
      const dy = tempV.y - clickNDC.y;
      const screenDistSq = dx * dx + dy * dy;

      // Allow click within comfortable screen radius (~28px threshold)
      if (screenDistSq < 0.0035 && distToRay < 0.8) {
        if (screenDistSq < minScore) {
          minScore = screenDistSq;
          bestSat = {
            id: item.sat.noradId,
            name: item.sat.name,
            category: 'science',
            country: item.sat.agency,
            agency: item.sat.agency,
            altKm: item.sat.altKm,
            inclination: item.sat.incDeg,
            period: item.sat.periodMin,
            meanMotion: 1440 / item.sat.periodMin,
            eccentricity: 0.001,
            isLunar: true,
          };
        }
      }
    }

    return bestSat;
  }

  dispose() {
    this.scene.remove(this.group);
    this.textureLod?.dispose();
    if (this.orbitLine) {
      this.scene.remove(this.orbitLine);
      this.orbitLine.geometry.dispose();
      this.orbitLine.material.dispose();
    }
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

import * as THREE from 'three';
import {
  SUN_RADIUS_UNITS,
  AU_UNITS,
  getSunPositionECI,
} from '../utils/astronomy';
import { SOLAR_SATS } from '../utils/celestialFleet';
import { sampleConicRing, heliocentricConicThreeJS } from '../utils/conicPropagation';
import { helioEclipticToThreeJS } from '../utils/ephemeris';

// Radius of the close-range corona halo as a multiple of the photosphere radius. Keeps the
// halo's angular size locked to the solar disc at every zoom level; the limb lands at the
// normalized texture radius 1 / CLOSE_CORONA_SCALE.
const CLOSE_CORONA_SCALE = 2.2;

const SUN_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vLocalPos;

  void main() {
    vUv = uv;
    vLocalPos = position;
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
    #include <logdepthbuf_vertex>
  }
`;

const SUN_FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform float time;
  uniform vec3 cameraPos;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vLocalPos;

  // 3D Simplex-style noise helper
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  // Fractional Brownian Motion for turbulent boiling convection granules
  float fbm(vec3 p) {
    float total = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 4; i++) {
      total += snoise(p * freq) * amp;
      freq *= 2.1;
      amp *= 0.48;
    }
    return total;
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 V = normalize(cameraPos - vWorldPosition);
    vec3 N = normalize(vWorldNormal);

    // Astronomical Limb Darkening: Eddington approximation for G2V dwarf star
    // cosTheta = 1 at disk center (facing observer), 0 at disk limb (edge)
    float cosTheta = clamp(dot(N, V), 0.0, 1.0);
    float limbDarkening = 0.38 + 0.62 * pow(cosTheta, 0.65);

    // Multi-layered animated turbulent solar convection plasma in local sphere coordinates
    vec3 pNorm = normalize(vLocalPos);
    vec3 pos = pNorm * 48.0;
    float t = time * 0.08;

    float n1 = fbm(pos + vec3(0.0, t * 0.7, 0.0));
    float n2 = fbm(pos * 2.2 - vec3(t * 0.4, 0.0, t * 0.4));
    float n3 = fbm(pos * 4.6 + vec3(0.0, 0.0, t * 0.5));
    float plasma = clamp(0.5 + 0.5 * (n1 * 0.55 + n2 * 0.32 + n3 * 0.13), 0.0, 1.0);

    // High-temperature solar blackbody color gradient:
    // Core cells: 6400K pure white-hot upwelling
    // Granulation ridges: 5778K blazing golden yellow
    // Intergranular lanes: 5000K deep thermonuclear amber orange
    vec3 deepAmber = vec3(0.95, 0.38, 0.02);
    vec3 brightGold = vec3(1.00, 0.85, 0.32);
    vec3 whiteHot   = vec3(1.00, 0.98, 0.92);

    vec3 col = mix(deepAmber, brightGold, smoothstep(0.28, 0.64, plasma));
    col = mix(col, whiteHot, smoothstep(0.64, 0.88, plasma));

    // Faculae (bright magnetic networks near limbs)
    float faculaeNoise = fbm(pos * 3.6 + vec3(t * 0.2));
    float faculaeMask = smoothstep(0.52, 0.82, faculaeNoise) * pow(1.0 - cosTheta, 1.4);
    col += vec3(1.0, 0.95, 0.82) * faculaeMask * 0.60;

    // Apply Eddington limb darkening
    col *= limbDarkening;

    // Chromospheric razor rim fringe
    float rim = pow(1.0 - cosTheta, 3.2);
    col += vec3(1.0, 0.58, 0.15) * rim * 0.75;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// 3D Solar Coronal Atmosphere Limb Glow Shader
const CORONA_VERT = /* glsl */ `
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

const CORONA_FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 cameraPos;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    #include <logdepthbuf_fragment>
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPos - vWorldPos);

    // Subtle atmospheric chromospheric rim glow at the grazing horizon
    float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    vec3 coronaColor = vec3(1.0, 0.72, 0.22);
    gl_FragColor = vec4(coronaColor * fresnel * 1.2, fresnel * 0.75);
  }
`;

export class SunObject {
  constructor(scene) {
    this.scene = scene;
    this._visible = true;
    this._planetOccluded = false;

    // Sunlight source, placed at the Sun's true scene position so every body is lit from
    // its own direction to the Sun. A DirectionalLight only shines along the fixed
    // Earth->Sun vector, which is correct for Earth (at the origin) but leaves the other
    // planets lit from the wrong side. distance=0 with decay=0 keeps the illumination
    // distance-independent (no inverse-square falloff across the AU-scale scene), so the
    // effective brightness matches the previous directional light exactly.
    this.light = new THREE.PointLight(0xffffff, 4.0, 0, 0);
    this.light.position.set(1, 0, 0);
    this.scene.add(this.light);

    // Deep space ambient fill
    this.ambient = new THREE.AmbientLight(0x0a0f1d, 0.9);
    this.scene.add(this.ambient);

    // 1. Procedural 3D animated solar photosphere with multi-layer convection granulation,
    // Eddington limb darkening and faculae (NASA Fact Sheet: R = 695,700 km, 109.2x Earth)
    this.sunUniforms = {
      time:      { value: 0 },
      cameraPos: { value: new THREE.Vector3() },
    };

    const sphereGeo = new THREE.SphereGeometry(SUN_RADIUS_UNITS, 96, 96);
    this.sphereMat = new THREE.ShaderMaterial({
      uniforms:       this.sunUniforms,
      vertexShader:   SUN_VERT,
      fragmentShader: SUN_FRAG,
      depthTest:      true,
      depthWrite:     true,
    });
    this.sphereMesh = new THREE.Mesh(sphereGeo, this.sphereMat);
    this.sphereMesh.renderOrder = -50;
    this.scene.add(this.sphereMesh);

    // 1b. 3D Solar Coronal Atmosphere Limb Glow Shader
    this.coronaUniforms = {
      cameraPos: { value: new THREE.Vector3() },
    };
    const coronaGeo = new THREE.SphereGeometry(SUN_RADIUS_UNITS * 1.035, 64, 64);
    this.coronaMeshMat = new THREE.ShaderMaterial({
      uniforms:       this.coronaUniforms,
      vertexShader:   CORONA_VERT,
      fragmentShader: CORONA_FRAG,
      side:           THREE.FrontSide,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
    });
    this.coronaMesh = new THREE.Mesh(coronaGeo, this.coronaMeshMat);
    this.coronaMesh.renderOrder = -45;
    this.scene.add(this.coronaMesh);

    // 2. High-intensity inner solar glow halo (chromosphere & intense white plasma glare)
    const coreTex = new THREE.CanvasTexture(this._buildCoreTexture());
    this.coreMat = new THREE.SpriteMaterial({
      map:         coreTex,
      transparent: true,
      blending:    THREE.AdditiveBlending,
      depthTest:   true,
      depthWrite:  false,
    });
    this.coreSprite = new THREE.Sprite(this.coreMat);
    this.coreSprite.scale.set(SUN_RADIUS_UNITS * 2.8, SUN_RADIUS_UNITS * 2.8, 1);
    this.coreSprite.renderOrder = -40;
    this.scene.add(this.coreSprite);

    // 3. Diffuse outer corona and solar glare plasma halo (NASA Eyes proportion)
    const coronaTex = new THREE.CanvasTexture(this._buildCoronaTexture());
    this.coronaMat = new THREE.SpriteMaterial({
      map:         coronaTex,
      transparent: true,
      blending:    THREE.AdditiveBlending,
      depthTest:   true,
      depthWrite:  false,
      opacity:     0.90,
    });
    this.coronaSprite = new THREE.Sprite(this.coronaMat);
    this.coronaSprite.scale.set(SUN_RADIUS_UNITS * 6.5, SUN_RADIUS_UNITS * 6.5, 1);
    this.coronaSprite.renderOrder = -39;
    this.scene.add(this.coronaSprite);

    // 4. Diffraction starburst spikes (optical aperture rays seen through space cameras)
    const raysTex = new THREE.CanvasTexture(this._buildRaysTexture());
    this.raysMat = new THREE.SpriteMaterial({
      map:         raysTex,
      transparent: true,
      blending:    THREE.AdditiveBlending,
      depthTest:   true,
      depthWrite:  false,
      opacity:     0.70,
    });
    this.raysSprite = new THREE.Sprite(this.raysMat);
    this.raysSprite.scale.set(SUN_RADIUS_UNITS * 12.0, SUN_RADIUS_UNITS * 12.0, 1);
    this.raysSprite.renderOrder = -38;
    this.scene.add(this.raysSprite);

    // 5. Anamorphic lens flare streak (cinematic ISS / space camera glare)
    const streakTex = new THREE.CanvasTexture(this._buildStreakTexture());
    this.streakMat = new THREE.SpriteMaterial({
      map:         streakTex,
      transparent: true,
      blending:    THREE.AdditiveBlending,
      depthTest:   true,
      depthWrite:  false,
      opacity:     0.55,
    });
    this.streakSprite = new THREE.Sprite(this.streakMat);
    this.streakSprite.scale.set(SUN_RADIUS_UNITS * 18.0, SUN_RADIUS_UNITS * 1.5, 1);
    this.streakSprite.renderOrder = -37;
    this.scene.add(this.streakSprite);

    // 6. Secondary lens flare optical ghost rings
    const ghostTex = new THREE.CanvasTexture(this._buildGhostTexture());
    this.ghostMat1 = new THREE.SpriteMaterial({
      map:         ghostTex,
      transparent: true,
      blending:    THREE.AdditiveBlending,
      depthTest:   false,
      depthWrite:  false,
      opacity:     0.18,
    });
    this.ghost1 = new THREE.Sprite(this.ghostMat1);
    this.ghost1.scale.set(1.5, 1.5, 1);
    this.ghost1.renderOrder = 20;
    this.scene.add(this.ghost1);

    this.ghostMat2 = new THREE.SpriteMaterial({
      map:         ghostTex,
      transparent: true,
      blending:    THREE.AdditiveBlending,
      depthTest:   false,
      depthWrite:  false,
      opacity:     0.18,
    });
    this.ghost2 = new THREE.Sprite(this.ghostMat2);
    this.ghost2.scale.set(3.0, 3.0, 1);
    this.ghost2.renderOrder = 21;
    this.scene.add(this.ghost2);

    // 6b. Natural close-range solar corona. A camera-facing chromospheric halo concentric with
    // the photosphere that fades IN as the artificial lens-flare layers fade out near the solar
    // surface. It is depth-tested against the photosphere sphere, so only the portion beyond the
    // solar limb survives — yielding a true outward glow instead of a flat overlay on the disc.
    const closeCoronaTex = new THREE.CanvasTexture(this._buildCloseCoronaTexture());
    this.closeCoronaMat = new THREE.SpriteMaterial({
      map:         closeCoronaTex,
      transparent: true,
      blending:    THREE.AdditiveBlending,
      depthTest:   true,
      depthWrite:  false,
      opacity:     0,
    });
    this.closeCoronaSprite = new THREE.Sprite(this.closeCoronaMat);
    this.closeCoronaSprite.scale.set(SUN_RADIUS_UNITS * CLOSE_CORONA_SCALE, SUN_RADIUS_UNITS * CLOSE_CORONA_SCALE, 1);
    this.closeCoronaSprite.renderOrder = -44;
    this.closeCoronaSprite.visible = false;
    this.scene.add(this.closeCoronaSprite);

    // 7. Earth 1 AU heliocentric orbit around the Sun with dynamic directional white gradient.
    // The ring is a fixed-radius circle whose shape is invariant — it only translates with the
    // Sun's current position — so the per-step ephemeris is computed once into `_earthOrbitBase`
    // and every frame is just an offset. That keeps a dense (smooth even edge-on) ring free.
    const earthOrbitSteps = 1440;
    this.earthOrbitSteps = earthOrbitSteps;
    this._earthOrbitBase = null;       // Float32Array of relative offsets, built on first show
    this._earthOrbitBrightness = null; // per-vertex gradient, built alongside
    const earthOrbitPositions = new Float32Array((earthOrbitSteps + 1) * 3);
    const earthOrbitColors = new Float32Array((earthOrbitSteps + 1) * 3);
    const earthOrbitGeo = new THREE.BufferGeometry();
    earthOrbitGeo.setAttribute('position', new THREE.BufferAttribute(earthOrbitPositions, 3));
    earthOrbitGeo.setAttribute('color', new THREE.BufferAttribute(earthOrbitColors, 3));
    const earthOrbitMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent:  true,
      blending:     THREE.AdditiveBlending,
      depthWrite:   false,
    });
    this.earthOrbitLine = new THREE.Line(earthOrbitGeo, earthOrbitMat);
    this.earthOrbitLine.renderOrder = -30;
    this.earthOrbitLine.visible = true;
    this.scene.add(this.earthOrbitLine);

    this.sunDir = new THREE.Vector3(1, 0, 0);

    // Operational Heliophysics Fleet & Solar Probes (NASA / ESA Flagship Missions)
    this.solarSats = SOLAR_SATS;

    this.probeGroup = new THREE.Group();
    this.probeMeshes = [];

    this.solarSats.forEach(sat => {
      // 1. Real heliocentric osculating conic (ecliptic J2000, JPL Horizons). Sampling the ring
      //    through conicPropagation + helioEclipticToThreeJS carries the true orbit plane
      //    (inclination + ascending node) and line of apsides (argument of periapsis); a bare
      //    "tilt a circle about X" would leave every probe's perihelion pointing the same way.
      const auPts = sampleConicRing(sat.elements, 512);
      const orbitPts = auPts.map(([x, y, z]) => {
        const r = helioEclipticToThreeJS(x, y, z);
        return new THREE.Vector3(r.x, r.y, r.z);
      });
      const lineGeo = new THREE.BufferGeometry().setFromPoints(orbitPts);
      const lineMat = new THREE.LineBasicMaterial({
        color: sat.color || 0xf59e0b,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });
      const orbitTrace = new THREE.Line(lineGeo, lineMat);
      orbitTrace.visible = false; // Never clutter view with static orbit rings until clicked
      this.probeGroup.add(orbitTrace);

      // 2. Realistic technological spacecraft model with thermal heat shield, solar panels, and point beacon
      const probeModel = this._createSolarProbeMesh(sat);
      this.probeGroup.add(probeModel.group);

      this.probeMeshes.push({
        sat,
        mesh: probeModel.group,
        ringMesh: probeModel.ringMesh,
        orbitTrace,
        elements: sat.elements,
      });
    });

    this.scene.add(this.probeGroup);
  }

  _createSolarProbeMesh(sat) {
    const group = new THREE.Group();

    // Central avionics bus with gold multilayer insulation
    const busGeo = new THREE.BoxGeometry(0.14, 0.14, 0.22);
    const busMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.85,
      roughness: 0.25,
    });
    const busMesh = new THREE.Mesh(busGeo, busMat);
    busMesh.position.set(0, 0, -0.08);
    group.add(busMesh);

    // Thermal Protection System (TPS) heat shield facing Sun (+Z axis)
    const shieldGeo = new THREE.CylinderGeometry(0.26, 0.28, 0.035, 16);
    shieldGeo.rotateX(Math.PI / 2);
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.15,
      roughness: 0.25,
    });
    const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    shieldMesh.position.set(0, 0, 0.05);
    group.add(shieldMesh);

    // Dark graphite backing on shadow side of shield
    const shieldBackGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.015, 16);
    shieldBackGeo.rotateX(Math.PI / 2);
    const shieldBackMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8,
    });
    const shieldBack = new THREE.Mesh(shieldBackGeo, shieldBackMat);
    shieldBack.position.set(0, 0, 0.03);
    group.add(shieldBack);

    // Articulated solar array wings angled back in shadow zone of shield
    const panelGeo = new THREE.BoxGeometry(0.24, 0.08, 0.012);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      metalness: 0.6,
      roughness: 0.2,
    });

    const leftPanel = new THREE.Mesh(panelGeo, panelMat);
    leftPanel.position.set(-0.24, 0, -0.12);
    leftPanel.rotation.y = 0.25;
    group.add(leftPanel);

    const rightPanel = new THREE.Mesh(panelGeo, panelMat);
    rightPanel.position.set(0.24, 0, -0.12);
    rightPanel.rotation.y = -0.25;
    group.add(rightPanel);

    // Parabolic high-gain antenna dish
    const dishGeo = new THREE.ConeGeometry(0.07, 0.04, 16, 1, true);
    dishGeo.rotateX(-Math.PI / 2);
    const dishMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.75,
      roughness: 0.25,
    });
    const dishMesh = new THREE.Mesh(dishGeo, dishMat);
    dishMesh.position.set(0, 0.09, -0.18);
    group.add(dishMesh);

    // Sensor instrument booms
    const boomGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.35, 6);
    const boomMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
    const boomMesh = new THREE.Mesh(boomGeo, boomMat);
    boomMesh.position.set(0, -0.09, -0.18);
    boomMesh.rotation.x = Math.PI / 3;
    group.add(boomMesh);

    // Small glowing navigation beacon for distance visibility
    const beaconGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: sat.color || 0xf59e0b,
    });
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    group.add(beaconMesh);

    // Selection highlight ring
    const ringGeo = new THREE.RingGeometry(0.38, 0.46, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: sat.color || 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.visible = false;
    group.add(ringMesh);

    return { group, ringMesh };
  }

  _buildPhotosphereTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Equirectangular solar surface with granulation, sunspots, and limb darkening
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // Generate solar active regions / sunspot groups (realistic coordinates)
    const sunspots = [
      { u: 0.28, v: 0.42, r: 0.024 },
      { u: 0.31, v: 0.44, r: 0.016 },
      { u: 0.65, v: 0.58, r: 0.028 },
      { u: 0.68, v: 0.56, r: 0.018 },
      { u: 0.72, v: 0.60, r: 0.012 },
      { u: 0.45, v: 0.38, r: 0.020 },
    ];

    for (let y = 0; y < size; y++) {
      const v = y / size;
      const lat = (v - 0.5) * Math.PI;
      const cosLat = Math.cos(lat);

      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = (y * size + x) * 4;

        // Multi-frequency solar convection cell granulation
        const n1 = Math.sin(u * 90.0) * Math.cos(v * 90.0) * 0.5 + 0.5;
        const n2 = Math.sin(u * 220.0 + 1.2) * Math.cos(v * 220.0 + 0.8) * 0.5 + 0.5;
        const nNoise = (rnd() - 0.5) * 0.18;
        const cell = (n1 * 0.6 + n2 * 0.4 + nNoise);

        // Blackbody radiation curve (5778 K): deep golden-orange plasma to brilliant white-hot ridges
        let r = 255;
        let g = Math.floor(180 + cell * 55);
        let b = Math.floor(60 + cell * 70);

        // Check for sunspots (umbra & penumbra)
        for (const spot of sunspots) {
          let du = Math.abs(u - spot.u);
          if (du > 0.5) du = 1.0 - du;
          const dv = v - spot.v;
          const dist = Math.sqrt(du * du + dv * dv);
          if (dist < spot.r) {
            const spotFactor = dist / spot.r; // 0 at core (umbra), 1 at boundary
            const spotDark = Math.pow(spotFactor, 0.7);
            r = Math.floor(r * (0.15 + 0.85 * spotDark));
            g = Math.floor(g * (0.12 + 0.88 * spotDark));
            b = Math.floor(b * (0.08 + 0.92 * spotDark));
          }
        }

        data[idx]     = Math.min(255, Math.max(0, r));
        data[idx + 1] = Math.min(255, Math.max(0, g));
        data[idx + 2] = Math.min(255, Math.max(0, b));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  _buildCoreTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const cx = size / 2;

    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0.0,  'rgba(255, 255, 255, 1.0)');
    g.addColorStop(0.35, 'rgba(255, 255, 255, 1.0)');
    g.addColorStop(0.50, 'rgba(255, 250, 230, 0.95)');
    g.addColorStop(0.68, 'rgba(255, 225, 160, 0.65)');
    g.addColorStop(0.85, 'rgba(255, 180, 80, 0.2)');
    g.addColorStop(1.0,  'rgba(255, 140, 30, 0.0)');

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return c;
  }

  _buildCoronaTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const cx = size / 2;

    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0.0,  'rgba(255, 250, 225, 0.9)');
    g.addColorStop(0.15, 'rgba(255, 230, 160, 0.6)');
    g.addColorStop(0.32, 'rgba(255, 190, 90, 0.3)');
    g.addColorStop(0.55, 'rgba(255, 150, 50, 0.12)');
    g.addColorStop(0.80, 'rgba(255, 100, 25, 0.03)');
    g.addColorStop(1.0,  'rgba(0, 0, 0, 0.0)');

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return c;
  }

  // Close-range solar corona halo: a thin white chromospheric ring sitting just outside the
  // solar limb that decays into a warm, soft outer falloff. Drawn as an additive billboard
  // concentric with the photosphere so it reads as a real glowing atmosphere up close.
  _buildCloseCoronaTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const cx = size / 2;

    // The photosphere limb sits at normalized radius 1 / CLOSE_CORONA_SCALE (≈ 0.4545),
    // where the bright chromospheric ring peaks before decaying outward.
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0.00, 'rgba(255, 252, 240, 0.0)');
    g.addColorStop(0.30, 'rgba(255, 252, 240, 0.0)');
    g.addColorStop(0.40, 'rgba(255, 255, 246, 0.28)');
    g.addColorStop(0.45, 'rgba(255, 255, 250, 0.72)');
    g.addColorStop(0.52, 'rgba(255, 248, 226, 0.52)');
    g.addColorStop(0.62, 'rgba(255, 228, 178, 0.30)');
    g.addColorStop(0.76, 'rgba(255, 196, 118, 0.13)');
    g.addColorStop(0.89, 'rgba(255, 160, 70, 0.04)');
    g.addColorStop(1.00, 'rgba(255, 140, 50, 0.0)');

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return c;
  }

  _buildRaysTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const cx = size / 2;

    ctx.clearRect(0, 0, size, size);

    // 8-point diffraction starburst rays
    const rayCount = 8;
    for (let i = 0; i < rayCount; i++) {
      const angle = (i * Math.PI) / (rayCount / 2);
      ctx.save();
      ctx.translate(cx, cx);
      ctx.rotate(angle);

      const grad = ctx.createLinearGradient(0, -cx, 0, cx);
      const isMajor = i % 2 === 0;
      const alpha = isMajor ? 0.45 : 0.22;
      grad.addColorStop(0.0, 'rgba(255, 240, 200, 0)');
      grad.addColorStop(0.5, `rgba(255, 255, 240, ${alpha})`);
      grad.addColorStop(1.0, 'rgba(255, 240, 200, 0)');

      ctx.fillStyle = grad;
      const width = isMajor ? 4.0 : 2.2;
      ctx.fillRect(-width / 2, -cx, width, size);
      ctx.restore();
    }

    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx * 0.45);
    g.addColorStop(0.0, 'rgba(255, 250, 240, 0.55)');
    g.addColorStop(1.0, 'rgba(255, 200, 100, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    return c;
  }

  _buildStreakTexture() {
    const w = 512;
    const h = 128;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const cx = w / 2;
    const cy = h / 2;

    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    // True optical anamorphic flare: smooth exponential horizontal streak with zero border artifacts
    for (let y = 0; y < h; y++) {
      const dy = (y - cy) / (h * 0.45);
      const vertFade = Math.exp(-dy * dy * 6.0); // Smooth Gaussian vertical cutoff

      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / (w * 0.5);
        const horizFade = Math.exp(-Math.abs(dx) * 3.5); // Smooth horizontal exponential decay
        const intensity = vertFade * horizFade;
        const idx = (y * w + x) * 4;

        data[idx]     = 255;
        data[idx + 1] = Math.floor(240 * intensity + 15);
        data[idx + 2] = Math.floor(210 * intensity + 45);
        data[idx + 3] = Math.floor(intensity * 255);
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return c;
  }

  _buildGhostTexture() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const cx = size / 2;

    const g = ctx.createRadialGradient(cx, cx, cx * 0.4, cx, cx, cx * 0.95);
    g.addColorStop(0.0,  'rgba(255, 240, 160, 0.0)');
    g.addColorStop(0.65, 'rgba(255, 215, 120, 0.28)');
    g.addColorStop(0.85, 'rgba(255, 170, 70, 0.12)');
    g.addColorStop(1.0,  'rgba(0, 0, 0, 0.0)');

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return c;
  }

  update(sunDir, camera, focusMode = 'earth', selectedSatId = null, showAllOrbits = false, date = new Date(), showPlanetaryOrbits = true) {
    this.sunDir.copy(sunDir);
    const sunPos = sunDir.clone().multiplyScalar(AU_UNITS);

    this.light.position.copy(sunPos);
    this.sphereMesh.position.copy(sunPos);
    this.coronaMesh.position.copy(sunPos);
    this.coreSprite.position.copy(sunPos);
    this.coronaSprite.position.copy(sunPos);
    this.raysSprite.position.copy(sunPos);
    this.streakSprite.position.copy(sunPos);
    this.closeCoronaSprite.position.copy(sunPos);

    // Update solar shader uniforms
    if (this.sunUniforms) {
      this.sunUniforms.time.value = performance.now() * 0.001;
      if (camera) this.sunUniforms.cameraPos.value.copy(camera.position);
    }
    if (this.coronaUniforms && camera) {
      this.coronaUniforms.cameraPos.value.copy(camera.position);
    }

    // True physical IAU/NASA solar proportions:
    // Photosphere R = 109.198 units.
    // In space visualization tools (NASA Eyes, Celestia), the blazing solar flare is collimated
    // so it always shines brightly as a brilliant beacon even across 1 AU distance.
    const camDist = camera ? camera.position.distanceTo(sunPos) : AU_UNITS;
    // Scale factor is strictly clamped between 1.0 and 1.5 to prevent flares exploding on zoom-out
    const distScale = Math.min(1.5, Math.max(1.0, camDist / 24000.0));

    this.sphereMesh.scale.set(1, 1, 1);
    this.coreSprite.scale.set(SUN_RADIUS_UNITS * 2.8 * distScale, SUN_RADIUS_UNITS * 2.8 * distScale, 1);
    this.coronaSprite.scale.set(SUN_RADIUS_UNITS * 6.5 * distScale, SUN_RADIUS_UNITS * 6.5 * distScale, 1);
    this.raysSprite.scale.set(SUN_RADIUS_UNITS * 12.0 * distScale, SUN_RADIUS_UNITS * 12.0 * distScale, 1);
    this.streakSprite.scale.set(SUN_RADIUS_UNITS * 18.0 * distScale, SUN_RADIUS_UNITS * 2.0 * distScale, 1);

    // Update Earth 1 AU orbit trajectory line with directional white gradient
    // In Earth-centered coordinates, the Earth sits at (0, 0, 0).
    // As Earth orbits the Sun, the relative Sun vector traces Earth's heliocentric orbit around the Sun.
    // The Earth orbit line is shown only when zoomed out (camDistFromEarth > 8.0) to avoid penetrating close-up views.
    if (this.earthOrbitLine) {
      const camDistFromEarth = camera ? camera.position.length() : 10.0;
      // Earth's heliocentric orbit is only meaningful as a map once the camera has left the
      // Earth-Moon neighbourhood; any closer and the giant ring is just a stray line cutting
      // across the close-up view.
      const isZoomedOut = camDistFromEarth > 60.0;
      this.earthOrbitLine.visible = Boolean(showPlanetaryOrbits && isZoomedOut);

      if (this.earthOrbitLine.visible) {
        // Fade in smoothly as camera pulls back between 8.0 and 20.0 units
        const fade = Math.min(1.0, Math.max(0.0, (camDistFromEarth - 60.0) / 60.0));
        this.earthOrbitLine.material.opacity = fade * 0.85;

        const posAttr = this.earthOrbitLine.geometry.attributes.position;
        const colAttr = this.earthOrbitLine.geometry.attributes.color;
        const orbitSteps = this.earthOrbitSteps;

        // Build the invariant ring shape once: offsets relative to the Sun's current position.
        // P(frac) = (sunDir_now - sunDir_step) * AU, and sunDir is periodic, so the curve is a
        // circle of radius AU centred on the Sun — only its translation changes per frame.
        if (!this._earthOrbitBase) {
          const nowMs = date.getTime();
          const tropicalYearMs = 365.2422 * 86400000;
          const base = new Float32Array((orbitSteps + 1) * 3);
          const bright = new Float32Array(orbitSteps + 1);
          for (let i = 0; i <= orbitSteps; i++) {
            const frac = i / orbitSteps;
            const sunStep = getSunPositionECI(new Date(nowMs - frac * tropicalYearMs));
            base[i * 3]     = -sunStep.x * AU_UNITS;
            base[i * 3 + 1] = -sunStep.z * AU_UNITS; // ECI z -> Three.js y
            base[i * 3 + 2] = sunStep.y * AU_UNITS;  // -ECI y -> Three.js z
            // Directional white gradient: brightest (1.0) right at Earth, tapering to 0.15 ahead
            bright[i] = 0.15 + 0.85 * Math.pow(1.0 - frac, 1.4);
          }
          this._earthOrbitBase = base;
          this._earthOrbitBrightness = bright;
        }

        const base = this._earthOrbitBase;
        const bright = this._earthOrbitBrightness;
        for (let i = 0; i <= orbitSteps; i++) {
          posAttr.setXYZ(
            i,
            base[i * 3] + sunPos.x,
            base[i * 3 + 1] + sunPos.y,
            base[i * 3 + 2] + sunPos.z
          );
          const b = bright[i] * fade;
          colAttr.setXYZ(i, b, b, b);
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
      }
    }

    // Update heliophysics fleet (Parker Solar Probe, Solar Orbiter, SOHO)
    if (this.probeGroup) {
      this.probeGroup.position.copy(sunPos);
      const probeDate = date || new Date();
      this.probeMeshes.forEach(item => {
        // Orbit line is ONLY visible if clicked/selected, or if user toggled 'All Orbits'
        const isSelected = selectedSatId && (item.sat.id === selectedSatId || item.sat.noradId === selectedSatId);
        item.orbitTrace.visible = Boolean(isSelected || showAllOrbits);

        // True heliocentric position on the osculating conic (scene units, relative to the Sun).
        const res = heliocentricConicThreeJS(item.elements, probeDate);
        item.mesh.position.set(res.rel.x, res.rel.y, res.rel.z);

        // Orient heat shield (+Z axis) directly towards the blazing Sun center
        item.mesh.lookAt(0, 0, 0);

        if (item.ringMesh) {
          item.ringMesh.visible = Boolean(isSelected);
          if (camera) item.ringMesh.lookAt(camera.position);
        }

        // Keep realistic scale when inspected close-up, gently boost visibility at extreme solar distances
        if (camera) {
          const worldPos = new THREE.Vector3();
          item.mesh.getWorldPosition(worldPos);
          const camDist = camera.position.distanceTo(worldPos);
          const s = camDist < 5.0 ? 1.0 : Math.min(1.0 + (camDist - 5.0) * 0.05, 4.0);
          item.mesh.scale.set(s, s, s);
        }
      });
      // Show solar probes when examining Sun or generally active
      this.probeGroup.visible = this.sphereMesh.visible;
    }

    if (camera) {
      const camPos = camera.position;
      const toSun = sunPos.clone().sub(camPos);
      const sunDist = toSun.length();
      const sunRay = toSun.normalize();

      // Earth is centered at (0,0,0) with radius 1.0
      const t = -camPos.dot(sunRay);
      let fade = 1.0;

      if (t > 0 && t < sunDist) {
        const closestPoint = camPos.clone().add(sunRay.clone().multiplyScalar(t));
        const d = closestPoint.length();
        // Earth radius 1.0; smooth fade over atmosphere boundary 0.94 - 1.05
        if (d < 1.05) {
          fade = Math.max(0, (d - 0.94) / (1.05 - 0.94));
        }
      }

      // Close-up inspection of the Sun (e.g. Focus on Sun or flying near Sun):
      // When approaching the solar photosphere (sunDist < 10000 units),
      // optical camera streaks, diffraction spikes and artificial glare smoothly fade out completely
      // so the user can inspect the realistic 3D solar photosphere sphere!
      const closeFade = Math.min(1.0, Math.max(0.0, (sunDist - 1500.0) / 6000.0));
      const streakFade = Math.min(1.0, Math.max(0.0, (sunDist - 3000.0) / 8000.0));

      // Natural close-range corona: fades in exactly as the artificial lens-flare layers fade
      // out, so inspecting the photosphere reveals a glowing limb instead of a bare disc.
      const closeGlowNear = 1200.0;
      const closeGlowFar  = 7000.0;
      const closeGlow = Math.min(1.0, Math.max(0.0, (closeGlowFar - sunDist) / (closeGlowFar - closeGlowNear)));

      this.coreMat.opacity   = fade * 0.85 * closeFade;
      this.coronaMat.opacity = fade * 0.80 * (0.08 + 0.92 * closeFade);
      this.raysMat.opacity   = fade * 0.70 * streakFade;
      this.streakMat.opacity = fade * 0.45 * streakFade;
      this.closeCoronaMat.opacity = fade * closeGlow * 0.85;

      // Skip the full-screen additive quad entirely once it has faded out.
      this.closeCoronaSprite.visible = this.sphereMesh.visible && closeGlow > 0.01;

      // Optical lens flare ghosts along viewing line
      if (fade > 0.05 && focusMode !== 'sun' && streakFade > 0.1) {
        const centerDir = camera.getWorldDirection(new THREE.Vector3());
        const sunDot = centerDir.dot(sunRay);

        if (sunDot > 0.25) {
          const flareFactor = (sunDot - 0.25) / 0.75;
          this.ghostMat1.opacity = fade * flareFactor * 0.28 * closeFade;
          this.ghostMat2.opacity = fade * flareFactor * 0.18;

          this.ghost1.position.copy(camPos).add(sunRay.clone().multiplyScalar(15)).sub(centerDir.clone().multiplyScalar(3));
          this.ghost2.position.copy(camPos).add(sunRay.clone().multiplyScalar(28)).sub(centerDir.clone().multiplyScalar(7));
          this.ghost1.visible = true;
          this.ghost2.visible = true;
        } else {
          this.ghost1.visible = false;
          this.ghost2.visible = false;
        }
      } else {
        this.ghost1.visible = false;
        this.ghost2.visible = false;
      }
    }
  }

  setPlanetOccluded(occluded) {
    this._planetOccluded = Boolean(occluded);
    if (this._planetOccluded) {
      // Kill the additive glare layers immediately; the photosphere/corona meshes are
      // handled by visibility below so the Sun can never glow through a foreground body.
      this.coreMat.opacity = 0;
      this.coronaMat.opacity = 0;
      this.raysMat.opacity = 0;
      this.streakMat.opacity = 0;
      this.closeCoronaMat.opacity = 0;
    }
    this._applyVisibility();
  }

  getPosition() {
    return this.sphereMesh.position.clone();
  }

  getPositionOf(satId) {
    const item = this.probeMeshes.find(m => m.sat.id === satId || m.sat.noradId === satId);
    if (!item) return null;
    const worldPos = new THREE.Vector3();
    item.mesh.getWorldPosition(worldPos);
    return worldPos;
  }

  pick(ndcX, ndcY, camera) {
    if (!this.sphereMesh.visible || !this.probeMeshes.length) return null;

    const clickNDC = new THREE.Vector2(ndcX, ndcY);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(clickNDC, camera);
    const ray = raycaster.ray;

    const tempV = new THREE.Vector3();
    let bestSat = null;
    let minScore = Infinity;

    for (const item of this.probeMeshes) {
      item.mesh.getWorldPosition(tempV);
      const distToRay = ray.distanceToPoint(tempV);
      tempV.project(camera);

      if (tempV.z <= -1.0 || tempV.z >= 1.0) continue;

      const dx = tempV.x - clickNDC.x;
      const dy = tempV.y - clickNDC.y;
      const screenDistSq = dx * dx + dy * dy;

      if (screenDistSq < 0.0035) {
        const score = screenDistSq + distToRay * 0.0001;
        if (score < minScore) {
          minScore = score;
          bestSat = item.sat;
        }
      }
    }
    return bestSat;
  }

  setVisibility(visible) {
    this._visible = visible;
    this._applyVisibility();
  }

  // Single source of truth for the Sun's render visibility. A foreground body
  // occlusion (planet/Earth/Moon between the camera and the Sun) hides the whole
  // solar stack — photosphere, corona shell and every additive glare layer.
  _applyVisibility() {
    const show = this._visible !== false && !this._planetOccluded;
    this.sphereMesh.visible   = show;
    this.coronaMesh.visible   = show;
    this.coreSprite.visible   = show;
    this.coronaSprite.visible = show;
    this.raysSprite.visible   = show;
    this.streakSprite.visible = show;
    this.closeCoronaSprite.visible = show;
    if (this.ghost1) this.ghost1.visible = show;
    if (this.ghost2) this.ghost2.visible = show;
    if (!show && this.earthOrbitLine) this.earthOrbitLine.visible = false;
  }

  dispose() {
    this.scene.remove(this.sphereMesh);
    this.scene.remove(this.coronaMesh);
    this.coronaMesh.geometry.dispose();
    this.coronaMeshMat.dispose();
    this.scene.remove(this.coreSprite);
    this.scene.remove(this.coronaSprite);
    this.scene.remove(this.raysSprite);
    this.scene.remove(this.streakSprite);
    this.scene.remove(this.closeCoronaSprite);
    this.scene.remove(this.ghost1);
    this.scene.remove(this.ghost2);
    if (this.earthOrbitLine) {
      this.scene.remove(this.earthOrbitLine);
      this.earthOrbitLine.geometry.dispose();
      this.earthOrbitLine.material.dispose();
    }

    this.sphereMesh.geometry.dispose();
    this.sphereMat.dispose();
    this.coreMat.map.dispose();
    this.coreMat.dispose();
    this.coronaMat.map.dispose();
    this.coronaMat.dispose();
    this.raysMat.map.dispose();
    this.raysMat.dispose();
    this.streakMat.map.dispose();
    this.streakMat.dispose();
    this.closeCoronaMat.map.dispose();
    this.closeCoronaMat.dispose();
    this.ghostMat1.map.dispose();
    this.ghostMat1.dispose();
    this.ghostMat2.map.dispose();
    this.ghostMat2.dispose();
  }
}

import * as THREE from 'three';
import { TextureLODManager } from './planets/TextureLODManager.js';
import { applyEquirectLongitudeUV } from './planets/equirectUV.js';

const VERT = /* glsl */ `
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

const FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D dayTex;
  uniform sampler2D nightTex;
  uniform sampler2D specTex;
  uniform vec3      sunDir;
  uniform vec3      camPos;
  uniform float     nightLights;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    #include <logdepthbuf_fragment>
    vec3 N       = normalize(vWorldNormal);
    vec3 V       = normalize(camPos - vWorldPos);
    vec3 S       = normalize(sunDir);

    float dotNS  = dot(N, S);
    // Smooth transition from night to day
    float dayMix = smoothstep(-0.08, 0.12, dotNS);

    // Pure real photo textures with bilinear hardware filtering
    vec4 daySample   = texture2D(dayTex,   vUv);
    vec4 nightSample = texture2D(nightTex, vUv);
    float spec       = texture2D(specTex,  vUv).r;

    // Realistic Solar Radiance & Diffuse Scattering:
    // In space photography (Apollo, ISS, DSCOVR), the sunlit Earth is brilliantly bright.
    // Diffuse cosine factor with gentle ambient scattering prevents Europe from looking pitch dark.
    float diffuse = clamp(dotNS * 0.75 + 0.35, 0.0, 1.0);
    vec3 dayColor = daySample.rgb * 1.45 * diffuse;

    // Night: real city lights photograph modulated by nightLights uniform
    vec3 nightColor = nightSample.rgb * 2.2 * nightLights;

    vec3 color = mix(nightColor, dayColor, dayMix);

    // Specular ocean reflection
    vec3 R        = reflect(-S, N);
    float specPow = pow(max(dot(V, R), 0.0), 32.0);
    color += vec3(0.4, 0.5, 0.7) * specPow * spec * dayMix * 0.9;

    // Subtle atmospheric limb
    float limb = 1.0 - pow(1.0 - max(dot(N, V), 0.0), 3.5) * 0.18;
    color *= limb;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const CLOUD_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vWorldNormal;

  void main() {
    vUv          = uv;
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const CLOUD_FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D cloudTex;
  uniform vec3      sunDir;
  uniform float     uOpacity;

  varying vec2 vUv;
  varying vec3 vWorldNormal;

  void main() {
    #include <logdepthbuf_fragment>
    vec3 N = normalize(vWorldNormal);
    vec3 S = normalize(sunDir);
    float dayFactor = smoothstep(-0.15, 0.25, dot(N, S));

    // Hardware bilinear filtered sample
    float raw = texture2D(cloudTex, vUv).r;

    // Smooth continuous cloud density (NO hard discard which causes blocky flickering rectangles!)
    float density = smoothstep(0.08, 0.65, raw);

    // Direct sunlight scattering on bright white clouds
    vec3 sunLitCloud = vec3(1.0, 1.0, 1.0);
    // Deep dark tone on night side so clouds do not glow artificially in darkness
    vec3 nightCloud  = vec3(0.015, 0.02, 0.035);

    vec3 cloudColor = mix(nightCloud, sunLitCloud, dayFactor);
    // Smooth natural opacity curve
    float alpha = density * (0.12 + dayFactor * 0.88) * uOpacity;

    gl_FragColor = vec4(cloudColor, alpha);
  }
`;

// Distance (in Earth radii, R = 1 unit) within which the heavy 8K day/night layers are
// active. The default camera sits at ~3.5 units, so 8K is the *normal* view. The layers
// are preloaded at startup and never evicted: the one-time 8K decode + GPU upload lands
// during boot (behind the loading overlay), so zooming never has any texture work to do.
const EARTH_HIRES_DISTANCE = 6.0;
const EARTH_LOD_OPTIONS = { preload: true, evict: Infinity };

// Peak cloud-layer alpha (0 = invisible, 1 = fully opaque). Kept below 1 so the
// surface reads through the cloud deck. This affects ONLY the cloud material's
// opacity — the Earth day/night/specular materials are untouched.
const CLOUD_MAX_OPACITY = 0.65;

const textureLod = new TextureLODManager();

// Sign of the mesh's axial spin. `rotation.y = EARTH_ROTATION_Y_SIGN * gmst` puts the prime
// meridian at world right ascension GMST (correct astronomical convention).
export const EARTH_ROTATION_Y_SIGN = -1;

// Three.js SphereGeometry lays an equirectangular map's longitude toward −Z as u grows, so a
// point at east longitude ends up at *decreasing* right ascension — the mirror of the
// astronomical convention (east longitude ⇒ increasing RA). Mirroring the horizontal UV makes
// a surface point at east longitude λ land at world RA GMST + λ once the mesh is spun by
// `rotation.y = EARTH_ROTATION_Y_SIGN * gmst`. Without this the globe (and therefore the
// day/night terminator) is east-west mirrored. Verified against NOAA solar position in tests.
// Re-exported from the shared helper so the Moon and planets share the exact same convention.
export const applyEarthLongitudeUV = applyEquirectLongitudeUV;

export class Earth {
  constructor(scene, renderer = null) {
    this.scene = scene;
    this.mesh  = null;
    this.cloudMesh = null;

    textureLod.setRenderer(renderer);

    // Resolution tiers streamed by camera proximity (see TextureLODManager): the 2K base
    // paints instantly and the 8K day/night layers are preloaded at startup, then kept
    // resident for the whole session, so the heavy upload never lands mid-zoom. Spec/cloud
    // maps are single-tier.
    this._dayLod   = textureLod.create([
      { url: '/earth_day_2048.webp',  distance: Infinity },
      { url: '/earth_day_8k.webp',    distance: EARTH_HIRES_DISTANCE },
    ], EARTH_LOD_OPTIONS);
    this._nightLod = textureLod.create([
      { url: '/earth_night_2048.png', distance: Infinity },
      { url: '/earth_night_8k.webp',  distance: EARTH_HIRES_DISTANCE },
    ], EARTH_LOD_OPTIONS);
    this._specLod  = textureLod.create([{ url: '/earth_spec_2048.webp' }]);
    // Bundled static cloud map — the always-available fallback. If a live map is
    // streamed in via setLiveClouds(), this tier is released once the live base decodes.
    this._cloudLod = textureLod.create([{ url: '/earth_clouds_2048.webp' }]);
    this._liveCloudLod = null;

    const dayTex   = this._dayLod.texture;
    const nightTex = this._nightLod.texture;
    const specTex  = this._specLod.texture;
    const cloudTex = this._cloudLod.texture;

    this.uniforms = {
      dayTex:      { value: dayTex   },
      nightTex:    { value: nightTex },
      specTex:     { value: specTex  },
      sunDir:      { value: new THREE.Vector3(1, 0, 0) },
      camPos:      { value: new THREE.Vector3() },
      nightLights: { value: 1.0 },
    };

    const geo = applyEarthLongitudeUV(new THREE.SphereGeometry(1.0, 96, 96));
    const mat = new THREE.ShaderMaterial({
      uniforms:       this.uniforms,
      vertexShader:   VERT,
      fragmentShader: FRAG,
      depthTest:      true,
      depthWrite:     true,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    scene.add(this.mesh);

    // Independent animated high-resolution cloud sphere layer
    this.cloudUniforms = {
      cloudTex: { value: cloudTex },
      sunDir:   { value: new THREE.Vector3(1, 0, 0) },
      uOpacity: { value: CLOUD_MAX_OPACITY },
    };

    const cloudGeo = applyEarthLongitudeUV(new THREE.SphereGeometry(1.006, 128, 128));
    const cloudMat = new THREE.ShaderMaterial({
      uniforms:       this.cloudUniforms,
      vertexShader:   CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent:    true,
      depthWrite:     false,
      depthTest:      true,
      polygonOffset:  true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -2.0,
    });

    this.cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    this.cloudMesh.renderOrder = 2;
    scene.add(this.cloudMesh);
  }

  setNightLights(enabled) {
    this.uniforms.nightLights.value = enabled ? 1.0 : 0.0;
  }

  setClouds(visible) {
    if (this.cloudMesh) this.cloudMesh.visible = visible;
  }

  /**
   * Swap the bundled static cloud map for the streamed near-real-time map.
   *
   * `tiers` is a coarse→fine tier list (see `CloudService`); the static map stays bound
   * until the live base tier has decoded, then it is released. Higher tiers stream in by
   * camera proximity through the shared `TextureLODManager`. Safe no-op for an empty list
   * or without a cloud mesh.
   */
  setLiveClouds(tiers) {
    if (!Array.isArray(tiers) || tiers.length === 0 || !this.cloudMesh) return;
    if (this._liveCloudLod) this._liveCloudLod.dispose();
    // Preload every tier and never evict them. The cloud maps are streamed over the network, so
    // letting a tier be released on zoom-out and re-downloaded on zoom-in caused a hard freeze
    // every time the camera crossed the eviction window. Fetching once (in the background —
    // gateBoot: false keeps the loading overlay off this optional network fetch) and keeping the
    // tiers resident makes every zoom a pure reference swap.
    this._liveCloudLod = textureLod.create(tiers, { preload: true, evict: Infinity, gateBoot: false });
  }

  update(gmst, sunDir, camera) {
    // Rotate Earth: at GMST = 0 prime meridian (u = 0.5) aligns with vernal equinox (+X in ECI)
    this.mesh.rotation.y = EARTH_ROTATION_Y_SIGN * gmst;

    // Atmosphere clouds rotate at realistic slightly different differential speed
    if (this.cloudMesh) {
      this.cloudMesh.rotation.y = EARTH_ROTATION_Y_SIGN * gmst * 1.004;
      this.cloudUniforms.sunDir.value.copy(sunDir);
    }

    this.uniforms.sunDir.value.copy(sunDir);
    if (camera) {
      this.uniforms.camPos.value.copy(camera.position);
      const camDist = camera.position.length();

      // Stream the day/night resolution tiers with camera proximity, then bind the
      // active tier (a swap is an instant reference change — no per-frame re-upload).
      this._dayLod.update(camDist);
      this._nightLod.update(camDist);
      this.uniforms.dayTex.value   = this._dayLod.texture;
      this.uniforms.nightTex.value = this._nightLod.texture;

      // Live clouds: stream resolution tiers as the camera approaches. The bundled
      // static map stays bound until the live base tier has decoded, so the swap is
      // seamless; once it is, the static tier is released.
      if (this._liveCloudLod) {
        this._liveCloudLod.update(camDist);
        if (this._liveCloudLod.ready) {
          if (this._cloudLod) { this._cloudLod.dispose(); this._cloudLod = null; }
          this.cloudUniforms.cloudTex.value = this._liveCloudLod.texture;
        }
      }

      // Proximity fade: at extreme close-up (r < 1.065, e.g. orbital altitude < 415 km),
      // smoothly fade out clouds so they don't block the Earth surface and satellite inspection
      if (this.cloudUniforms && this.cloudUniforms.uOpacity) {
        const closeFade = THREE.MathUtils.clamp((camDist - 1.015) / 0.05, 0.0, 1.0);
        this.cloudUniforms.uOpacity.value = CLOUD_MAX_OPACITY * closeFade;
      }
    }
  }

  dispose() {
    this._dayLod.dispose();
    this._nightLod.dispose();
    this._specLod.dispose();
    this._cloudLod?.dispose();
    this._liveCloudLod?.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    if (this.cloudMesh) {
      this.scene.remove(this.cloudMesh);
      this.cloudMesh.geometry.dispose();
      this.cloudMesh.material.dispose();
    }
  }
}

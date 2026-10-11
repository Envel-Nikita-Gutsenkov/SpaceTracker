import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import {
  SPACECRAFT_3D_REGISTRY,
  resolveCategoryModel,
  FACING_VECTORS,
  computeModelScale,
  computeOverlayDepthRange,
  PROCEDURAL_SPAN_UNITS,
} from './spacecraftModels.js';
import { perfProbe } from '../utils/perfProbe.js';
import { textureReadiness } from './textureReadiness.js';

const MAX_CACHED_MODELS = 4;         // LRU budget: bounds VRAM/RAM held by models
const DRACO_DECODER_PATH = '/draco/'; // Decoder files served from public/draco/ (offline-capable)

// Dedicated render layer for the focused hull. The main camera (layer 0) skips it and a
// second pass re-draws it with a tightly fitted depth range (see _renderOverlay).
const MODEL_LAYER = 1;

/** Recursively release all GPU resources held by a model. */
function disposeObject3D(root) {
  root.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    for (const m of mats) {
      if (!m) continue;
      for (const key of Object.keys(m)) {
        const v = m[key];
        if (v && v.isTexture) v.dispose();
      }
      m.dispose();
    }
  });
}

export class SatelliteModel {
  constructor(scene, renderer = null) {
    this.scene = scene;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.group.visible = false;

    // NASA 3D Resources export meshes with KHR_draco_mesh_compression, so every
    // compressed GLB requires the Draco decoder or GLTFLoader rejects the file.
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    // Warm the decoder workers + WASM now, so the first model the user opens does not
    // pay the decoder cold-start on the click that selects it.
    this.dracoLoader.preload();
    this.loader = new GLTFLoader();
    this.loader.setDRACOLoader(this.dracoLoader);
    this.loadedModels = new Map(); // url -> THREE.Group (insertion order == LRU order)
    this.loadingUrls = new Set();
    this.activeCustomModel = null;
    this.activeModelUrl = null;
    this.currentSatId = null;
    this._camPos = new THREE.Vector3(); // scratch for per-frame distance checks (no per-frame alloc)

    // 1. Procedural Fallback: Compact realistic satellite bus (scale ~ 10-15 meters)
    // 1 unit = 6,371 km. 10 meters = ~0.00000157 units
    const busGeo = new THREE.BoxGeometry(0.0000015, 0.0000022, 0.0000015);
    const busMat = new THREE.MeshStandardMaterial({
      color:     0xd4af37,
      metalness: 0.85,
      roughness: 0.25,
    });
    this.bus = new THREE.Mesh(busGeo, busMat);
    this.proceduralGroup = new THREE.Group();
    this.proceduralGroup.add(this.bus);

    // 2. Solar panel arrays
    const panelGeo = new THREE.BoxGeometry(0.0000045, 0.0000014, 0.0000001);
    const panelMat = new THREE.MeshStandardMaterial({
      color:     0x15357a,
      metalness: 0.5,
      roughness: 0.2,
    });

    this.leftPanel = new THREE.Mesh(panelGeo, panelMat);
    this.leftPanel.position.set(-0.0000030, 0, 0);
    this.proceduralGroup.add(this.leftPanel);

    this.rightPanel = new THREE.Mesh(panelGeo, panelMat);
    this.rightPanel.position.set(0.0000030, 0, 0);
    this.proceduralGroup.add(this.rightPanel);

    // 3. High-gain parabolic antenna dish
    const dishGeo = new THREE.ConeGeometry(0.0000008, 0.0000005, 16, 1, true);
    dishGeo.rotateX(Math.PI);
    const dishMat = new THREE.MeshStandardMaterial({
      color:     0xeeeeee,
      metalness: 0.7,
      roughness: 0.3,
    });
    this.dish = new THREE.Mesh(dishGeo, dishMat);
    this.dish.position.set(0, 0.00000135, 0);
    this.proceduralGroup.add(this.dish);

    this.group.add(this.proceduralGroup);

    // The focused hull is drawn in its own depth pass, so keep it off the main camera's
    // layer (otherwise it renders with the collapsed global depth range and z-fights).
    this.group.traverse((node) => {
      if (node.isMesh) node.layers.set(MODEL_LAYER);
    });

    // Overlay pass state + camera (allocated once).
    this._overlayCam = new THREE.PerspectiveCamera();
    this._overlayCam.layers.set(MODEL_LAYER);
    this._inOverlay = false;
    this._activeSpan = PROCEDURAL_SPAN_UNITS;

    // Let the model light up in the overlay pass: lights are layer-filtered, so the scene
    // lights must also live on MODEL_LAYER. They already exist by the time we are built.
    this.scene.traverse((node) => {
      if (node.isLight) node.layers.enable(MODEL_LAYER);
    });

    // Re-draw the focused hull with a tight depth range right after the main scene render.
    const previousAfterRender = this.scene.onAfterRender;
    this._onAfterRender = (renderer, scene, camera) => {
      if (previousAfterRender) previousAfterRender(renderer, scene, camera);
      this._renderOverlay(renderer, scene, camera);
    };
    this.scene.onAfterRender = this._onAfterRender;

    // Selection highlight ring marker
    // Clearly marks the selected satellite from orbit/distance, and smoothly disappears when zoomed up close
    const ringGeo = new THREE.RingGeometry(0.8, 1.0, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color:       0x38bdf8,
      side:        THREE.DoubleSide,
      transparent: true,
      opacity:     0.75,
      blending:    THREE.AdditiveBlending,
      depthTest:   false,
    });
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.ring.renderOrder = 999;
    this.scene.add(this.ring); // Attached directly to scene to handle screen-space scale independently

    this.scene.add(this.group);

    // Proactively warm the model cache during idle time after boot (see _scheduleWarmCache).
    this._disposed = false;
    this._warmScheduled = false;
    this._scheduleWarmCache();
  }

  loadModelOnDemand(config) {
    if (this.loadedModels.has(config.url) || this.loadingUrls.has(config.url)) return;

    this.loadingUrls.add(config.url);
    const loadStart = performance.now();
    this.loader.load(
      config.url,
      (gltf) => {
        // Wall time for fetch + Draco decode + glTF parse. Shows up in the perf probe as
        // `modelLoad` so a freeze that only happens when opening a spacecraft is provable.
        perfProbe.record('modelLoad', performance.now() - loadStart);
        const root = gltf.scene;
        // Realistic NASA PBR materials: fix untextured/debug materials and optimize lighting
        root.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = false;
            node.receiveShadow = false;
            // NASA exports routinely model solar arrays, radiators and dishes as
            // zero-thickness planes, and MMS ships no material at all — so glTF falls
            // back to an opaque FrontSide material. Back-face culling then makes whole
            // sides of the spacecraft vanish as the camera orbits. Render every model
            // double-sided and skip frustum culling of its tiny (scaled ~1e-6) meshes,
            // which otherwise drop out unpredictably.
            node.frustumCulled = false;
            node.layers.set(MODEL_LAYER);
            if (node.geometry && !node.geometry.attributes.normal) {
              node.geometry.computeVertexNormals();
            }
            if (node.material) {
              const oldMats = Array.isArray(node.material) ? node.material : [node.material];
              const newMats = oldMats.map((m) => {
                const matName = (m.name || '').toLowerCase();
                // Check if this material is an untextured debug/placeholder green material (e.g. material04)
                const isGreenDebug = matName.includes('material04') ||
                  (m.color && m.color.g > 0.4 && m.color.r < 0.2 && m.color.b < 0.1);
                const isBlueDebug = matName.includes('bluebg');

                // If it has a diffuse texture map or is a standard PBR material, preserve its rich maps & properties
                if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
                  if (isGreenDebug) {
                    // Replace placeholder green with NASA white/silver thermal insulation blanket (Multi-Layer Insulation)
                    m.color.setHex(0xe8ecef);
                    m.roughness = 0.35;
                    m.metalness = 0.55;
                  } else if (isBlueDebug) {
                    // Replace harsh blue with dark solar module frame / composite material
                    m.color.setHex(0x1a2638);
                    m.roughness = 0.4;
                    m.metalness = 0.6;
                  } else {
                    m.roughness = m.roughness !== undefined ? Math.min(m.roughness, 0.4) : 0.35;
                    m.metalness = m.metalness !== undefined ? Math.max(m.metalness, 0.5) : 0.6;
                  }
                  m.side = THREE.DoubleSide; // thin/open model geometry must show from both faces
                  m.polygonOffset = true;
                  m.polygonOffsetFactor = 0.5;
                  m.polygonOffsetUnits = 0.5;
                  m.needsUpdate = true;
                  return m;
                }

                // Fallback conversion for any non-standard materials
                let baseColor = m.color ? m.color.clone() : new THREE.Color(0xffffff);
                if (isGreenDebug) {
                  baseColor.setHex(0xe8ecef);
                } else if (isBlueDebug) {
                  baseColor.setHex(0x1a2638);
                }

                const newMat = new THREE.MeshStandardMaterial({
                  color:            baseColor,
                  map:              m.map || null,
                  normalMap:        m.normalMap || null,
                  roughnessMap:     m.roughnessMap || null,
                  metalnessMap:     m.metalnessMap || null,
                  side:             THREE.DoubleSide,
                  metalness:        0.6,
                  roughness:        0.35,
                  transparent:      Boolean(m.transparent && m.opacity < 1.0),
                  opacity:          m.opacity !== undefined ? m.opacity : 1.0,
                  polygonOffset:    true,
                  polygonOffsetFactor: 0.5,
                  polygonOffsetUnits: 0.5,
                });
                return newMat;
              });
              node.material = Array.isArray(node.material) ? newMats : newMats[0];
            }
          }
        });

        // Optional fine-tune rotation BEFORE centering/scaling (model-local frame).
        if (config.rotOffset) {
          root.rotation.copy(config.rotOffset);
        }

        // Automatically center the 3D model geometry at (0, 0, 0)
        const box = new THREE.Box3().setFromObject(root);
        const center = new THREE.Vector3();
        box.getCenter(center);
        root.position.sub(center);

        // Scale: either an explicit override or auto-fit to the real physical size.
        const size = box.getSize(new THREE.Vector3());
        const rawLargest = Math.max(size.x, size.y, size.z) || 1;
        const scale = config.scale ?? computeModelScale(rawLargest, config.physicalSizeMeters);

        const wrapper = new THREE.Group();
        wrapper.add(root);
        wrapper.scale.set(scale, scale, scale);
        wrapper.userData.rawLargest = rawLargest;
        wrapper.userData.scale = scale;

        // Pay the GPU cost now (shader compile + texture upload) while the procedural
        // stand-in is still on screen, so the frame that first shows the real hull does
        // not stall for seconds compiling its programs.
        this._warmModel(root);

        this.loadedModels.set(config.url, wrapper);
        this.loadingUrls.delete(config.url);

        // Enforce the memory budget (never evict the model being viewed right now).
        this.evictIfNeeded();

        // If currently viewing this satellite, switch to real model immediately. Compare
        // against the resolved config (not the raw id) so fleet objects keyed by NORAD
        // still swap in the moment their GLB finishes streaming.
        if (this.activeConfig && this.activeConfig.url === config.url) {
          this.showCustomModel(wrapper, config.url);
        }
      },
      undefined,
      (err) => {
        console.warn('Failed to lazy load 3D spacecraft model:', err);
        this.loadingUrls.delete(config.url);
      }
    );
  }

  /**
   * Upload a freshly parsed model's textures and compile its shader programs ahead of the
   * first draw. Without this the first frame that shows the hull stalls for the whole
   * compile + upload (measured ~2s in the perf probe), which reads as a freeze exactly when
   * the user zooms onto the satellite.
   */
  _warmModel(root) {
    const renderer = this.renderer;
    if (!renderer || !root) return;

    // Upload every texture now, so no draw call pays a synchronous upload later.
    root.traverse((node) => {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) {
        if (!m) continue;
        for (const key of Object.keys(m)) {
          const v = m[key];
          if (v && v.isTexture && typeof renderer.initTexture === 'function') {
            try { renderer.initTexture(v); } catch { /* non-fatal */ }
          }
        }
      }
    });

    // Compile the programs now. compileAsync defers the driver-side compile through
    // KHR_parallel_shader_compile where available; otherwise it still front-loads the work
    // off the frame that displays the hull. The overlay camera already matches MODEL_LAYER,
    // so the compiled program is the exact one the close-up pass will use.
    try {
      if (typeof renderer.compileAsync === 'function') {
        renderer.compileAsync(root, this._overlayCam, this.scene);
      } else if (typeof renderer.compile === 'function') {
        renderer.compile(root, this._overlayCam, this.scene);
      }
    } catch { /* non-fatal */ }
  }

  /**
   * Warm the model cache during idle time once boot has settled.
   *
   * Opening a spacecraft otherwise pays a cold fetch + Draco decode + glTF parse on the click —
   * the multi-second `modelLoad` peak in the perf probe. Pre-parsing the most likely hulls while
   * the GPU is idle makes that click instant. The parse budget is capped at MAX_CACHED_MODELS so
   * warming fills the LRU cache instead of thrashing it; every remaining hull is only byte-warmed
   * (a cache-priming fetch) so its later parse is a disk-cache hit rather than a network stall.
   */
  _scheduleWarmCache() {
    if (this._warmScheduled) return;
    this._warmScheduled = true;
    const start = () => {
      if (this._disposed) return;
      const seen = new Set();
      const queue = [];
      for (const cfg of Object.values(SPACECRAFT_3D_REGISTRY)) {
        if (cfg && cfg.url && !seen.has(cfg.url)) { seen.add(cfg.url); queue.push(cfg); }
      }
      this._warmQueue = queue;
      this._warmIndex = 0;
      this._warmStep();
    };
    // Never compete with the boot gate: wait for the first-paint textures to settle first.
    textureReadiness.whenReady().then(start, start);
  }

  _warmStep() {
    if (this._disposed) return;
    const queue = this._warmQueue;
    if (!queue || this._warmIndex >= queue.length) return;
    const cfg = queue[this._warmIndex++];
    const resident = this.loadedModels.size + this.loadingUrls.size;
    if (this.loadedModels.has(cfg.url) || this.loadingUrls.has(cfg.url)) {
      // Already warm — nothing to fetch.
    } else if (resident < MAX_CACHED_MODELS) {
      this.loadModelOnDemand(cfg); // parse + keep resident: the click becomes instant
    } else if (typeof fetch === 'function') {
      // LRU budget full: prime the HTTP cache only, so the eventual parse is a cache hit.
      try { fetch(cfg.url, { cache: 'force-cache' }).catch(() => {}); } catch { /* non-fatal */ }
    }
    this._idleWarm(() => this._warmStep());
  }

  _idleWarm(cb) {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(cb, { timeout: 2000 });
    else setTimeout(cb, 250);
  }

  /** Dispose every cached model except the active one until the LRU budget holds. */
  evictIfNeeded() {
    while (this.loadedModels.size > MAX_CACHED_MODELS) {
      let victim = null;
      for (const url of this.loadedModels.keys()) {
        if (url !== this.activeModelUrl) { victim = url; break; }
      }
      if (!victim) break;
      this.disposeModel(victim);
    }
  }

  disposeModel(url) {
    const obj = this.loadedModels.get(url);
    if (!obj) return;
    if (this.activeCustomModel === obj) {
      this.group.remove(obj);
      this.activeCustomModel = null;
      this.activeModelUrl = null;
    }
    disposeObject3D(obj);
    this.loadedModels.delete(url);
  }

  /** Move a URL to the most-recently-used position in the LRU map. */
  touchModel(url) {
    const obj = this.loadedModels.get(url);
    if (!obj) return;
    this.loadedModels.delete(url);
    this.loadedModels.set(url, obj);
  }

  showCustomModel(modelObj, url = null) {
    if (this.activeCustomModel) {
      this.group.remove(this.activeCustomModel);
    }
    if (url) this.touchModel(url);
    this.proceduralGroup.visible = false;
    this.activeCustomModel = modelObj;
    this.activeModelUrl = url;
    this.group.add(modelObj);
  }

  showProceduralModel() {
    if (this.activeCustomModel) {
      this.group.remove(this.activeCustomModel);
      this.activeCustomModel = null;
      this.activeModelUrl = null;
    }
    this.proceduralGroup.visible = true;
  }

  update(pos, sunDir, camera, visible = true, selectedSat = null) {
    if (!visible || !pos) {
      this.group.visible = false;
      if (this.ring) this.ring.visible = false;
      this.currentSatId = null;
      return;
    }

    const satId = selectedSat?.id || selectedSat?.noradId;
    if (satId !== this.currentSatId) {
      this.currentSatId = satId;
      // Fleet objects (deep-space probes, planetary orbiters) carry a string id, while the
      // registry is keyed by NORAD number — so resolve by id OR noradId, otherwise they
      // would silently fall back to the procedural bus instead of their real GLB. Finally,
      // constellations streamed per-launch (GLONASS as COSMOS xxxx) fall back to their
      // category default so the whole constellation shares one chassis model — matched by
      // category OR name, since a failed navigation-group fetch can mis-label a member.
      const modelConfig = SPACECRAFT_3D_REGISTRY[satId] ||
        (selectedSat?.noradId != null ? SPACECRAFT_3D_REGISTRY[selectedSat.noradId] : undefined) ||
        resolveCategoryModel(selectedSat?.category, selectedSat?.name);
      if (modelConfig) {
        if (this.loadedModels.has(modelConfig.url)) {
          this.showCustomModel(this.loadedModels.get(modelConfig.url), modelConfig.url);
        } else {
          // Fallback to procedural while asynchronously streaming the 3D model
          this.showProceduralModel();
          this.loadModelOnDemand(modelConfig);
        }
        this.activeConfig = modelConfig;
      } else {
        this.showProceduralModel();
        this.activeConfig = null;
      }
    }

    this.group.position.set(pos.x, pos.y, pos.z);
    this.group.visible = true;

    // Orient spacecraft attitude:
    // Stable Earth-pointing frame that rotates smoothly with the orbital position vector
    if (!this.activeCustomModel && sunDir) {
      this.group.lookAt(pos.x + sunDir.x, pos.y + sunDir.y, pos.z + sunDir.z);
    } else if (this.activeCustomModel) {
      // Align the configured `facing` axis with the radial-outward vector (pos), so the model
      // keeps a stable attitude. Because this points the axis AWAY from the origin (Earth for
      // orbiters, the Sun for deep-space probes), a part that must face the origin — e.g. a
      // dish at the model's +Y — needs `facing` set to its negation ('-y').
      const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
      if (r > 0.0001) {
        const facing = FACING_VECTORS[this.activeConfig?.facing] || FACING_VECTORS['+z'];
        this.group.quaternion.setFromUnitVectors(
          new THREE.Vector3(facing[0], facing[1], facing[2]),
          new THREE.Vector3(pos.x / r, pos.y / r, pos.z / r)
        );
      }
    }

    // Physical scale and distance culling:
    // Real 3D models and procedural meshes keep strict physical scale and NEVER balloon across continents!
    if (camera) {
      this._camPos.set(pos.x, pos.y, pos.z);
      const camDist = camera.position.distanceTo(this._camPos);
      const hasReal3DModel = Boolean(this.activeCustomModel);

      // Keep strictly 1.0 scale (1:1 physical ratio); the model wrapper carries its own scale
      this.group.scale.set(1.0, 1.0, 1.0);

      // Distance culling: hide mesh when zoomed out (> 0.005 units = ~32 km away),
      // seamlessly returning to the standard orbital dot without visual clutter
      const isCloseEnough = camDist < 0.005;
      if (hasReal3DModel) {
        this.activeCustomModel.visible = isCloseEnough;
      } else {
        this.proceduralGroup.visible = isCloseEnough;
      }
      this.isMeshVisible = isCloseEnough;

      // World-space span of whatever hull is currently shown (drives the overlay depth range).
      const custom = this.activeCustomModel;
      if (custom && custom.userData.rawLargest > 0 && custom.userData.scale > 0) {
        this._activeSpan = custom.userData.rawLargest * custom.userData.scale;
      } else {
        this._activeSpan = PROCEDURAL_SPAN_UNITS;
      }

      // Selection ring: visible when viewing from distance, smoothly disappears when zoomed up close (< 0.005 units)
      if (this.ring) {
        if (!isCloseEnough) {
          this.ring.position.set(pos.x, pos.y, pos.z);
          this.ring.lookAt(camera.position);
          // Keep a constant, clean angular size on screen (e.g. 18 pixels radius)
          const ringScale = Math.min(Math.max(camDist * 0.022, 0.002), 0.15);
          this.ring.scale.set(ringScale, ringScale, ringScale);
          this.ring.visible = true;
        } else {
          this.ring.visible = false;
        }
      }
    }
  }

  /**
   * Second render pass: draw only the focused hull, with near/far tightly bracketing it.
   * Called from scene.onAfterRender so it runs immediately after the main scene render and
   * on top of it (main camera no longer draws the hull, which lives on MODEL_LAYER).
   */
  _renderOverlay(renderer, scene, camera) {
    if (this._inOverlay) return; // the overlay render itself must not recurse
    if (!this.group.visible || !this.isMeshVisible || !camera) return;

    const active = this.activeCustomModel || this.proceduralGroup;
    if (!active || !active.visible) return;

    const span = this._activeSpan > 0 ? this._activeSpan : PROCEDURAL_SPAN_UNITS;
    const camDist = camera.position.distanceTo(this.group.position);
    const { near, far } = computeOverlayDepthRange(camDist, span);

    const oc = this._overlayCam;
    oc.fov = camera.fov;
    oc.aspect = camera.aspect;
    oc.zoom = camera.zoom;
    oc.near = near;
    oc.far = far;
    oc.position.copy(camera.position);
    oc.quaternion.copy(camera.quaternion);
    oc.up.copy(camera.up);
    oc.updateProjectionMatrix();
    oc.updateMatrixWorld(true);

    this._inOverlay = true;
    const prevAutoClear = renderer.autoClear;
    try {
      renderer.autoClear = false; // never wipe the frame we are drawing onto
      renderer.clearDepth();      // hull always sits in front of the main scene
      renderer.render(scene, oc);
    } finally {
      renderer.autoClear = prevAutoClear;
      this._inOverlay = false;
    }
  }

  dispose() {
    this._disposed = true;
    if (this.dracoLoader) this.dracoLoader.dispose();
    if (this.scene.onAfterRender === this._onAfterRender) {
      this.scene.onAfterRender = null;
    }
    this.scene.remove(this.group);
    if (this.ring) {
      this.scene.remove(this.ring);
      this.ring.geometry.dispose();
      this.ring.material.dispose();
    }
    // Release every lazily loaded GLTF model still held in the LRU cache.
    for (const url of [...this.loadedModels.keys()]) {
      this.disposeModel(url);
    }
    this.bus.geometry.dispose();
    this.bus.material.dispose();
    this.leftPanel.geometry.dispose();
    this.leftPanel.material.dispose();
    this.rightPanel.geometry.dispose();
    this.rightPanel.material.dispose();
    this.dish.geometry.dispose();
    this.dish.material.dispose();
  }
}

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Earth }            from './Earth';
import { Atmosphere }       from './Atmosphere';
import { Stars }            from './Stars';
import { SunObject }        from './Sun';
import { SatelliteManager } from './SatelliteManager';
import { OrbitLine }        from './OrbitLine';
import { VanAllenBelts }    from './VanAllenBelts';
import { SatelliteModel }   from './SatelliteModel';
import { SPACECRAFT_3D_REGISTRY, resolveCategoryModel, computeFocusDistances } from './spacecraftModels';
import { MoonObject }       from './Moon';
import { PlanetarySystem }  from './planets/PlanetarySystem';
import { PlanetFleet }       from './planets/PlanetFleet';
import { DeepSpaceFleet }    from './DeepSpaceFleet';
import { getGMST, getSunPositionECI, eciToThreeJS, SUN_RADIUS_UNITS } from '../utils/astronomy';
import { textureReadiness } from './textureReadiness.js';
import { setUploadRenderer } from './textureUpload.js';
import { perfProbe } from '../utils/perfProbe.js';
import { isSegmentOccludedBySphere } from '../utils/celestialOcclusion';
import { getZoomedBodyId, SUN_CLOSE_UP_FACTOR } from '../utils/planetaryLabels';
import { getFocusTransitionProgress, FOCUS_TRANSITION_DURATION_MS } from '../utils/focusTransition';
import { useSatStore } from '../store/useSatStore';

// Base wheel-zoom speed. The user's "mouse sensitivity" slider scales this (1.0 = default).
const BASE_ZOOM_SPEED = 1.2;

// Simulation clock is advanced every frame locally, but written back to the store
// at this interval (seconds). Writing every frame would force every subscribed React
// component to re-render at the display refresh rate (~60 fps).
const SIM_STORE_WRITE_INTERVAL = 0.1;

export class SceneManager {
  constructor(canvas) {
    this.canvas      = canvas;
    this.renderer    = null;
    this.scene       = null;
    this.camera      = null;
    this.controls    = null;
    this.earth       = null;
    this.atmosphere  = null;
    this.stars       = null;
    this.sun         = null;
    this.moon        = null;
    this.planets     = null;
    this.planetFleet = null;
    this.deepSpace   = null;
    this.satManager  = null;
    this.orbitLine   = null;
    this.vanAllen    = null;
    this.satModel    = null;
    this.animId      = null;
    this.lastNow     = 0;
    this.frameCount  = 0;
    this.fpsTick     = 0;
    this._prevSelId  = null;
    this.focusedSatId = null;
    this.focusedPlanetId = null;
    this.focusMode = 'earth';
    this._focusOffset = new THREE.Vector3(0.015, 0.012, 0.018);
    this._focusTransition = null;
    this._vFocusTargetOffset = new THREE.Vector3();
    this._vFocusCameraOffset = new THREE.Vector3();
    this._vFocusZero = new THREE.Vector3();
    this._vTempEndCam = new THREE.Vector3();
    this._tempCam = new THREE.PerspectiveCamera();

    // Pre-allocated reusable vectors for zero GC stutter (144+ FPS optimization)
    this._vSunDir = new THREE.Vector3();
    this._vDeltaTrack = new THREE.Vector3();
    this._vLiveTarget = new THREE.Vector3();
    this._vCamDir = new THREE.Vector3();
    this._tempDate = new Date();

    // Scratch objects for the celestial-label pass (kept allocation-free so the
    // 30 Hz React label tick never triggers GC micro-stutters).
    this._vOrigin = new THREE.Vector3(0, 0, 0);
    this._vProj = new THREE.Vector3();
    this._tempV = new THREE.Vector3();
    this._labelBodies = null;

    // Local simulation clock, decoupled from the store to avoid per-frame React renders.
    this._simTime        = useSatStore.getState().simTime;
    this._lastStoreSim   = this._simTime;
    this._simWriteAccum  = 0;
  }

  init() {
    // Ensure WebGL2 unpack state is clean (FLIP_Y and PREMULTIPLY_ALPHA must be false for 3D textures)
    const gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
    if (gl) {
      try {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      } catch (_) {}
    }

    // Renderer with Logarithmic Depth Buffer for artifact-free rendering from LEO (0.01) to Pluto (1,000,000+)
    this.renderer = new THREE.WebGLRenderer({
      canvas:                this.canvas,
      context:               gl || undefined,
      antialias:             true,
      powerPreference:       'high-performance',
      logarithmicDepthBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Register the renderer for loaders that pre-upload their textures without holding one.
    setUploadRenderer(this.renderer);
    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure  = 0.72;
    this.renderer.outputColorSpace     = THREE.SRGBColorSpace;

    // Scene
    this.scene = new THREE.Scene();

    // Camera: near plane at 0.01 prevents near-plane clipping on close zoom; far at 10,000,000 fits true Solar System
    this.camera = new THREE.PerspectiveCamera(
      55, window.innerWidth / window.innerHeight, 0.01, 10000000
    );
    this.camera.position.set(0, 1.5, 3.2);

    // Controls: minDistance 1.05 prevents passing through Earth surface & clouds (radius 1.006)
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping  = true;
    this.controls.dampingFactor  = 0.06;
    this.controls.minDistance    = 1.05;
    this.controls.maxDistance    = 5000000;
    this.controls.rotateSpeed    = 0.45;
    this.controls.zoomSpeed      = BASE_ZOOM_SPEED;
    this.controls.enablePan      = true;
    this.controls.panSpeed       = 0.8;
    this.controls.screenSpacePanning = true;

    // Detect user right-click/pan to preserve pan offset relative to tracked body
    this._panOffset = new THREE.Vector3(0, 0, 0);
    this._prevTrackTarget = new THREE.Vector3();

    // Scene objects
    this.earth      = new Earth(this.scene, this.renderer);
    this.stars      = new Stars(this.scene, this.renderer);
    this.sun        = new SunObject(this.scene);
    this.moon       = new MoonObject(this.scene, this.renderer);
    this.planets    = new PlanetarySystem(this.scene, this.renderer);
    // Created after PlanetarySystem: each atmosphere shell is parented to its body's group.
    this.atmosphere = new Atmosphere(this.scene, this.planets);
    this.planetFleet = new PlanetFleet(this.scene, this.planets);
    this.deepSpace  = new DeepSpaceFleet(this.scene);
    this.vanAllen   = new VanAllenBelts(this.scene);
    this.satModel   = new SatelliteModel(this.scene, this.renderer);
    this.satManager = new SatelliteManager(this.scene, this.camera);
    this.orbitLine  = new OrbitLine(this.scene);

    // Resize handler
    this._onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this._onResize);

    this.lastNow = performance.now();
    this._loop();
  }

  loadSatellites(satellites) {
    this.satManager.load(satellites);
  }

  /**
   * Resolves once every boot-time texture (Earth/Moon/planet/star maps) has decoded and been
   * uploaded, so `App` can keep the loading overlay up until the scene's first paint is fully
   * ready. Never rejects: a failed or hung load is released by a safety timeout.
   */
  whenTexturesReady(timeoutMs) {
    return textureReadiness.whenReady(timeoutMs);
  }

  /** Fraction (0..1) of boot-time textures that have finished decoding + uploading. */
  get textureProgress() {
    return textureReadiness.progress;
  }

  // Swap in the streamed near-real-time cloud map (see CloudService). No-op without Earth.
  setLiveClouds(tiers) {
    if (this.earth) this.earth.setLiveClouds(tiers);
  }

  setFilters(visibleCategories, searchQuery, operatorFilter, orbitRegimeFilter, bodyFilter) {
    this.satManager.setFilters(visibleCategories, searchQuery, operatorFilter, orbitRegimeFilter, bodyFilter);
    const allDomains = ['earth', 'moon', 'sun', 'cislunar', 'planetary', 'deepspace'];
    const activeDomains = (bodyFilter instanceof Set)
      ? bodyFilter
      : (typeof bodyFilter === 'string'
          ? (bodyFilter === 'all' ? new Set(allDomains) : new Set([bodyFilter]))
          : new Set(allDomains));

    // Control Moon's own satellites visibility based on active domains
    if (this.moon && this.moon.satGroup) {
      this.moon.satGroup.visible = activeDomains.has('moon');
    }
    // Control Sun's own probes visibility based on active domains
    if (this.sun && this.sun.probeGroup) {
      this.sun.probeGroup.visible = activeDomains.has('sun');
    }
    // Artificial satellites of the other planets + the interstellar probes
    if (this.planetFleet) this.planetFleet.setVisibility(activeDomains.has('planetary'));
    if (this.deepSpace) this.deepSpace.setVisibility(activeDomains.has('deepspace'));
  }

  pick(ndcX, ndcY) {
    // The planetary fleet and the interstellar probes are rendered as small dots/rings that
    // sit right next to (or in front of) their parent body. A planet's pick volume is
    // deliberately generous — it also matches anything within two radii of the body's centre
    // line — so while a planet is focused, resolving the planet first would swallow every
    // click meant for an orbiting spacecraft. Try the fleet and probes before the focused
    // planet so a visibly separate orbiter stays selectable.
    if (this.planetFleet) {
      const fleetHit = this.planetFleet.pick(ndcX, ndcY, this.camera);
      if (fleetHit) return fleetHit;
    }
    if (this.deepSpace) {
      const probeHit = this.deepSpace.pick(ndcX, ndcY, this.camera);
      if (probeHit) return probeHit;
    }
    if (this.focusMode === 'planet' && this.planets) {
      const planetHit = this.planets.pick(ndcX, ndcY, this.camera);
      if (planetHit) return planetHit;
    }
    // If viewing the Moon or near it, check lunar satellites first
    if (this.focusMode === 'moon') {
      const lunarHit = this.moon.pick(ndcX, ndcY, this.camera);
      if (lunarHit) return lunarHit;
    }
    // If viewing the Sun, check solar probes first
    if (this.focusMode === 'sun') {
      const solarHit = this.sun.pick(ndcX, ndcY, this.camera);
      if (solarHit) return solarHit;
    }
    const earthHit = this.satManager.pick(ndcX, ndcY);
    if (earthHit) return earthHit;
    const moonHit = this.moon.pick(ndcX, ndcY, this.camera);
    if (moonHit) return moonHit;
    const solarHit = this.sun.pick(ndcX, ndcY, this.camera);
    if (solarHit) return solarHit;
    return this.planets ? this.planets.pick(ndcX, ndcY, this.camera) : null;
  }

  focusSat(sat) {
    if (!sat) {
      this.resetFocus();
      return;
    }

    if (sat.isPlanet) {
      this.focusPlanet(sat.id);
      return;
    }

    if (sat.isSolar) {
      const pos = this.sun.getPositionOf(sat.id);
      if (!pos) return;
      this.focusedSatId = sat.id;
      this.focusedPlanetId = null;
      this.focusMode = 'sat';
      this._prevTrackTarget.copy(pos); // Crucial: prevents delta jump into deep space
      const camOffset = new THREE.Vector3(2.5, 1.5, 3.0);
      this._startFocusTransition(pos, camOffset, 0.05);
      this.controls.maxDistance = 5000000;
      return;
    }

    if (sat.isLunar) {
      const pos = this.moon.getPositionOf(sat.id);
      if (!pos) return;
      this.focusedSatId = sat.id;
      this.focusedPlanetId = null;
      this.focusMode = 'sat';
      this._prevTrackTarget.copy(pos); // Crucial: prevents delta jump into deep space
      this.camera.near = 0.0000005;
      this.camera.updateProjectionMatrix();
      this._startFocusTransition(pos, new THREE.Vector3(0.00002, 0.000015, 0.000025), 0.000002);
      this.controls.maxDistance = 5000000;
      return;
    }

    if (sat.isPlanetary) {
      const pos = this.planetFleet ? this.planetFleet.getPositionOf(sat.id) : null;
      if (!pos) return;
      this.focusedSatId = sat.id;
      this.focusedPlanetId = null;
      this.focusMode = 'sat';
      this._prevTrackTarget.copy(pos);

      // Frame the real orbiter hull: the selected orbiter renders its NASA GLB through
      // the shared close-up pass, so scale the stand-off/zoom to its actual size.
      const modelConfig = SPACECRAFT_3D_REGISTRY[sat.id] || SPACECRAFT_3D_REGISTRY[sat.noradId] ||
        resolveCategoryModel(sat.category, sat.name);
      const { standoff, minDistance, near } = computeFocusDistances(modelConfig?.physicalSizeMeters);
      const dirFromOrigin = pos.clone().normalize();
      const camOffset = dirFromOrigin.multiplyScalar(standoff);

      this.camera.near = near;
      this.camera.updateProjectionMatrix();
      this._startFocusTransition(pos, camOffset, minDistance);
      this.controls.maxDistance = 5000000;
      return;
    }

    if (sat.isDeepSpace) {
      const pos = this.deepSpace ? this.deepSpace.getPositionOf(sat.id) : null;
      if (!pos) return;
      this.focusedSatId = sat.id;
      this.focusedPlanetId = null;
      this.focusMode = 'sat';
      this._prevTrackTarget.copy(pos);

      // Frame the real probe hull: scale the stand-off/zoom to its actual size so the
      // multi-metre model fills the view instead of staying a speck at the old fixed
      // distance (which was tuned for the procedural mesh).
      const modelConfig = SPACECRAFT_3D_REGISTRY[sat.id] || SPACECRAFT_3D_REGISTRY[sat.noradId] ||
        resolveCategoryModel(sat.category, sat.name);
      const { standoff, minDistance, near } = computeFocusDistances(modelConfig?.physicalSizeMeters);
      const dirFromEarth = pos.clone().normalize();
      const camOffset = dirFromEarth.multiplyScalar(standoff);

      this.camera.near = near;
      this.camera.updateProjectionMatrix();
      this._startFocusTransition(pos, camOffset, minDistance);
      this.controls.maxDistance = 5000000;
      return;
    }

    const pos = this.satManager.getPositionOf(sat.id, this._simTime);
    if (!pos) return;

    this.focusedSatId = sat.id;
    this.focusedPlanetId = null;
    this.focusMode = 'sat';
    this.satManager.setSelectedId(sat.id);
    this.satManager.setHiddenSelectedId(sat.id);
    const target = new THREE.Vector3(pos.x, pos.y, pos.z);

    // Frame the actual spacecraft: scale the stand-off and zoom limits to its real body
    // size, otherwise a tiny bus (e.g. 3.5 m MMS) stays a speck at any zoom level — the
    // fixed distance a 109 m ISS needs is far too wide for it.
    // Constellations streamed per-launch (GLONASS as COSMOS xxxx, Galileo GSATxxxx) carry a
    // fresh NORAD id each, so they are not in the registry — fall back to their category
    // default (matched by category or name), otherwise the camera frames them at the
    // generic procedural stand-off.
    const modelConfig = SPACECRAFT_3D_REGISTRY[sat.id] || SPACECRAFT_3D_REGISTRY[sat.noradId] ||
      resolveCategoryModel(sat.category, sat.name);
    const { standoff: offsetDist, minDistance, near } = computeFocusDistances(modelConfig?.physicalSizeMeters);

    const dirFromEarth = target.clone().normalize();
    const camOffset = dirFromEarth.clone().multiplyScalar(offsetDist);

    this._prevTrackTarget.copy(target); // Crucial: prevents delta jump into deep space

    // Near plane sits just inside the closest approach so the mesh never clips while
    // preserving log depth buffer precision (prevents z-fighting and triangular flicker).
    this.camera.near = near;
    this.camera.updateProjectionMatrix();

    // Fly to the spacecraft instead of teleporting (same easing as planets/Sun).
    this._startFocusTransition(target, camOffset, minDistance);
    this.controls.maxDistance = 5000000;
  }

  // Live world position of whatever body/satellite the camera is currently focusing,
  // evaluated every frame so the focus transition can chase a moving target.
  _getFocusBodyPosition() {
    if (this.focusMode === 'sun') return this.sun?.getPosition();
    if (this.focusMode === 'moon') return this.moon?.getPosition();
    if (this.focusMode === 'earth') return this._vFocusZero;
    if (this.focusMode === 'planet' && this.focusedPlanetId) {
      return this.planets?.getPositionOf(this.focusedPlanetId);
    }
    if (this.focusMode === 'sat' && this.focusedSatId) {
      const id = this.focusedSatId;
      return this.satManager.getPositionOf(id, this._simTime) ||
        this.moon.getPositionOf(id) ||
        (this.sun ? this.sun.getPositionOf(id) : null) ||
        (this.planetFleet ? this.planetFleet.getPositionOf(id) : null) ||
        (this.deepSpace ? this.deepSpace.getPositionOf(id) : null);
    }
    return null;
  }

  _startFocusTransition(bodyPosition, cameraOffset, minDistance) {
    // A retarget mid-flight must not carry over the seized (disabled) controls
    // state, otherwise enabled/damping would never be restored.
    if (this._focusTransition) {
      this._restoreControlsAfterTransition(this._focusTransition);
    }

    this._focusTransition = {
      startTime: performance.now(),
      duration: FOCUS_TRANSITION_DURATION_MS,
      startCameraPos: this.camera.position.clone(),
      startTargetPos: this.controls.target.clone(),
      startQuaternion: this.camera.quaternion.clone(),
      endCameraOffset: cameraOffset.clone(),
      minDistance,
      prevControlsEnabled: this.controls.enabled,
      prevEnableDamping: this.controls.enableDamping,
    };

    // Avoid OrbitControls snapping the camera to the destination distance mid-flight.
    this.controls.minDistance = 0;

    // Fully seize the camera for the duration of the flight. Any residual
    // OrbitControls damping/pan impulse left over from the click that started
    // the transition would otherwise be re-injected on top of the scripted path.
    this.controls.enabled = false;
    this.controls.enableDamping = false;
  }

  _restoreControlsAfterTransition(transition) {
    this.controls.minDistance = transition.minDistance;
    this.controls.enabled = transition.prevControlsEnabled;
    this.controls.enableDamping = transition.prevEnableDamping;
  }

  _updateFocusTransition(now) {
    const transition = this._focusTransition;
    if (!transition) return;

    const bodyPosition = this._getFocusBodyPosition();
    if (!bodyPosition) {
      this._focusTransition = null;
      this._restoreControlsAfterTransition(transition);
      return;
    }

    const progress = getFocusTransitionProgress(transition.startTime, now, transition.duration);
    this._vTempEndCam.copy(bodyPosition).add(transition.endCameraOffset);

    // Smoothly interpolate position across deep space
    this.controls.target.lerpVectors(transition.startTargetPos, bodyPosition, progress);
    this.camera.position.lerpVectors(transition.startCameraPos, this._vTempEndCam, progress);

    // Derive stable destination orientation without float32 catastrophic cancellation:
    this._tempCam.position.copy(this._vTempEndCam);
    this._tempCam.up.copy(this.camera.up);
    this._tempCam.lookAt(bodyPosition);

    // Slerp camera quaternion smoothly from start to destination framing:
    this.camera.quaternion.slerpQuaternions(transition.startQuaternion, this._tempCam.quaternion, progress);

    if (progress >= 1) {
      this.controls.target.copy(bodyPosition);
      this.camera.position.copy(bodyPosition).add(transition.endCameraOffset);
      this.camera.lookAt(this.controls.target);
      this._prevTrackTarget.copy(bodyPosition);
      this._restoreControlsAfterTransition(transition);
      this._focusTransition = null;
    }
  }

  focusMoon() {
    this.focusMode = 'moon';
    this.focusedSatId = null;
    this.focusedPlanetId = null;
    const moonPos = this.moon.getPosition();

    // Position camera near the Moon (radius = 0.2727 units), offset by ~0.8 units
    const offset = new THREE.Vector3(0.5, 0.4, 0.6).normalize().multiplyScalar(0.9);
    this._startFocusTransition(moonPos, offset, 0.32);
    this.controls.maxDistance = 5000000;
  }

  focusEarth() {
    this.focusMode = 'earth';
    this.focusedSatId = null;
    this.focusedPlanetId = null;
    const earthPosition = this._vFocusZero;
    this.camera.near = 0.01;
    this.camera.updateProjectionMatrix();
    this._startFocusTransition(earthPosition, new THREE.Vector3(0, 1.5, 3.2), 1.05);
    this.controls.maxDistance = 5000000;
  }

  focusSun() {
    this.focusMode = 'sun';
    this.focusedSatId = null;
    this.focusedPlanetId = null;
    const sunPos = this.sun.getPosition();

    // Photosphere physical radius is 109.2 units (NASA GSFC Fact Sheet). Place camera at ~330 units
    const offset = new THREE.Vector3(0, 80.0, 320.0);
    this._startFocusTransition(sunPos, offset, 115.0); // Prevent penetrating the photosphere
    this.controls.maxDistance = 5000000;
  }

  focusPlanet(planetId) {
    if (planetId === 'earth') {
      this.focusEarth();
      return;
    }
    if (!this.planets) return;

    const pos = this.planets.getPositionOf(planetId);
    if (!pos) return;

    const data = this.planets.getPlanetData(planetId);
    const radius = (data ? data.radiusKm : 6371) / 6371; // In Earth radii (Three.js units)
    const bodyClass = data?.bodyClass || 'planet';

    this.focusedPlanetId = planetId;
    this.focusMode = 'planet';
    this.focusedSatId = null;

    // Camera distance proportional to body radius. Dwarf planets and moons are far smaller
    // than the major planets, so they use a proportional (not floored) framing and a tighter
    // near plane; major planets keep the original floor to preserve their established view.
    const isSmall = bodyClass === 'dwarf' || bodyClass === 'moon';
    const offsetDist = isSmall
      ? Math.max(0.001, radius * (data?.hasRings ? 7.0 : 4.5))
      : Math.max(3.5, radius * (data?.hasRings ? 6.0 : 4.2));
    const offset = new THREE.Vector3(offsetDist * 0.7, offsetDist * 0.35, offsetDist * 0.8);
    if (isSmall) {
      this.camera.near = Math.max(1e-4, radius * 0.01);
      this.camera.updateProjectionMatrix();
    } else {
      this.camera.near = 0.01;
      this.camera.updateProjectionMatrix();
    }
    this._startFocusTransition(pos, offset, Math.max(1e-4, radius * 1.05));
    this.controls.maxDistance = 5000000;

    useSatStore.getState().setActiveBody(planetId);
    useSatStore.getState().setSelectedSat({
      id: planetId,
      name: data ? data.nameEn : planetId,
      nameRu: data ? data.nameRu : planetId,
      isPlanet: true,
      bodyClass,
      parentId: data?.parentId || null,
      radiusKm: data ? data.radiusKm : 6371,
      data,
    });
  }

  resetFocus() {
    this.focusEarth();
  }

  // True when *any* foreground body (Earth, Moon or a planet) blocks the line of
  // sight from the camera to the Sun's disc, so the solar glare can be hidden
  // instead of shining straight through the body.
  _isSunOccluded() {
    if (!this.camera) return false;
    const camPos = this.camera.position;
    const sunPos = this.sun.getPosition();

    if (isSegmentOccludedBySphere(camPos, sunPos, this._vOrigin, 1.005)) return true;

    if (this.moon) {
      const moonPos = this.moon.getPosition();
      if (isSegmentOccludedBySphere(camPos, sunPos, moonPos, 0.273)) return true;
    }

    if (this.planets) {
      for (const planet of this.planets.planets.values()) {
        planet.group.getWorldPosition(this._tempV);
        if (isSegmentOccludedBySphere(camPos, sunPos, this._tempV, planet.radiusUnits)) {
          return true;
        }
      }
    }

    return false;
  }

  _loop() {
    this.animId = requestAnimationFrame(() => this._loop());

    const now   = performance.now();
    perfProbe.tick(now);
    const delta = Math.min((now - this.lastNow) / 1000, 0.1);
    this.lastNow = now;

    // FPS
    this.frameCount++;
    this.fpsTick += delta;
    if (this.fpsTick >= 1.0) {
      useSatStore.getState().setFps(Math.round(this.frameCount / this.fpsTick));
      this.frameCount = 0;
      this.fpsTick    = 0;
    }

    const store = useSatStore.getState();

    // Resync the local clock if external code reset the sim time (e.g. the "Now" button).
    if (store.simTime !== this._lastStoreSim) {
      this._simTime       = store.simTime;
      this._lastStoreSim  = store.simTime;
      this._simWriteAccum = 0;
    }

    // Advance the local clock every frame for smooth propagation/tracking…
    this._simTime += delta * 1000 * store.timeScale;
    const newSim   = this._simTime;

    // …but only publish it to the store at a throttled rate to keep React idle.
    this._simWriteAccum += delta;
    if (this._simWriteAccum >= SIM_STORE_WRITE_INTERVAL) {
      this._simWriteAccum = 0;
      this._lastStoreSim  = this._simTime;
      store.setSimTime(this._simTime);
    }

    perfProbe.begin('ephemeris');
    this._tempDate.setTime(newSim);
    const date   = this._tempDate;
    const gmst   = getGMST(date);
    const sunECI = getSunPositionECI(date);
    const sunDir = this._vSunDir.set(sunECI.x, sunECI.z, sunECI.y).normalize();
    perfProbe.end();

    const selectedSatId = store.selectedSat?.id || null;
    const showAllOrbits = store.showAllOrbits || false;
    const showPlanetaryOrbits = store.showPlanetaryOrbits !== false;

    perfProbe.begin('sun');
    this.sun.update(sunDir, this.camera, this.focusMode, selectedSatId, showAllOrbits, date, showPlanetaryOrbits);
    this.sun.setVisibility(store.showSun);
    perfProbe.end();

    // Update Moon with real-time ephemeris and solar illumination (only show sat orbits when clicked)
    perfProbe.begin('moon');
    this.moon.update(date, sunDir, this.camera, selectedSatId, showAllOrbits, showPlanetaryOrbits);
    this.moon.setVisibility(store.showMoon);
    perfProbe.end();

    // Update Planetary System (all 9 planets with real-time Keplerian orbital physics)
    perfProbe.begin('planets');
    // One clone per frame instead of one per consumer: getPosition() returns a fresh Vector3,
    // and every downstream reader only reads it.
    const sunPos = this.sun.getPosition();
    if (this.planets) {
      const selectedPlanetId = store.selectedSat?.isPlanet ? store.selectedSat.id : null;
      this.planets.update(
        date,
        sunPos,
        this.camera,
        selectedPlanetId,
        showAllOrbits,
        showPlanetaryOrbits,
        this.focusMode,
        this.focusedPlanetId,
        Boolean(store.showDwarfPlanets),
        Boolean(store.showMoons)
      );

      if (this.planets.isStrongZoom) {
        if (this.sun?.earthOrbitLine) this.sun.earthOrbitLine.visible = false;
        if (this.moon?.orbitLine) this.moon.orbitLine.visible = false;
      }
      this.sun.setPlanetOccluded(this._isSunOccluded());
    }
    perfProbe.end();

    // Artificial satellites of the other planets + the interstellar/escape probes.
    perfProbe.begin('fleet');
    if (this.planetFleet) {
      this.planetFleet.update(date, this.camera, selectedSatId, showAllOrbits);
    }
    if (this.deepSpace) {
      this.deepSpace.update(date, sunPos, this.camera, selectedSatId, showAllOrbits, Boolean(store.showDeepSpaceProbes));
    }
    perfProbe.end();

    perfProbe.begin('earth');
    this.earth.update(gmst, sunDir, this.camera);
    this.earth.setNightLights(store.showNightLights);
    this.earth.setClouds(store.showClouds);
    perfProbe.end();

    perfProbe.begin('atmosphere');
    this.atmosphere.update(this.camera, sunPos, sunDir);
    this.atmosphere.setVisibility(store.showAtmosphere);
    perfProbe.end();

    this.vanAllen.setVisibility(store.showVanAllen);
    this.vanAllen.update(gmst);

    this.stars.setVisibility(store.showStars);
    this.stars.setBrightness(store.starBrightness);

    perfProbe.begin('satellites');
    this.satManager.setPointSize(store.satPointSize);
    this.controls.zoomSpeed = BASE_ZOOM_SPEED * (store.mouseSensitivity ?? 1);
    this.satManager.update(newSim, this.focusedSatId);
    if (this.camera) {
      const camDistEarth = this.camera.position.length();
      this.satManager.updateCameraDistance(camDistEarth);
    }
    perfProbe.end();

    // Real-time tracking with full right-click panning preservation:
    // If the tracked body moved in orbit, move the camera target by the orbital delta,
    // thereby letting the user pan freely with the right mouse button without being snapped back!
    const wasFocusTransitioning = !!this._focusTransition;
    if (this._focusTransition) {
      this._updateFocusTransition(now);
    } else if (this.focusMode === 'moon') {
      const moonPos = this.moon.getPosition();
      this._vDeltaTrack.copy(moonPos).sub(this._prevTrackTarget);
      this.controls.target.add(this._vDeltaTrack);
      this.camera.position.add(this._vDeltaTrack);
      this._prevTrackTarget.copy(moonPos);
    } else if (this.focusMode === 'sun') {
      const sunPos = this.sun.getPosition();
      this._vDeltaTrack.copy(sunPos).sub(this._prevTrackTarget);
      this.controls.target.add(this._vDeltaTrack);
      this.camera.position.add(this._vDeltaTrack);
      this._prevTrackTarget.copy(sunPos);
    } else if (this.focusMode === 'planet' && this.focusedPlanetId) {
      const planetPos = this.planets.getPositionOf(this.focusedPlanetId);
      if (planetPos) {
        this._vDeltaTrack.copy(planetPos).sub(this._prevTrackTarget);
        this.controls.target.add(this._vDeltaTrack);
        this.camera.position.add(this._vDeltaTrack);
        this._prevTrackTarget.copy(planetPos);
      }
    } else if (this.focusMode === 'sat' && this.focusedSatId) {
      const livePos = this.satManager.getPositionOf(this.focusedSatId, newSim) ||
        this.moon.getPositionOf(this.focusedSatId) ||
        this.sun.getPositionOf(this.focusedSatId) ||
        (this.planetFleet ? this.planetFleet.getPositionOf(this.focusedSatId) : null) ||
        (this.deepSpace ? this.deepSpace.getPositionOf(this.focusedSatId) : null);
      if (livePos) {
        this._vLiveTarget.set(livePos.x, livePos.y, livePos.z);
        this._vDeltaTrack.copy(this._vLiveTarget).sub(this._prevTrackTarget);
        this.controls.target.add(this._vDeltaTrack);
        this.camera.position.add(this._vDeltaTrack);
        this._prevTrackTarget.copy(this._vLiveTarget);
      }
    }

    // Orbit line and 3D model for selected satellite
    const sel = store.selectedSat;
    if (sel) {
      if (this._prevSelId !== sel.id) {
        this.satManager.setSelectedId(sel.id);
        this._prevSelId = sel.id;
      }

      const satPos = this.satManager.getPositionOf(sel.id, newSim) ||
        this.moon.getPositionOf(sel.id) ||
        (this.sun ? this.sun.getPositionOf(sel.id) : null) ||
        (this.planetFleet ? this.planetFleet.getPositionOf(sel.id) : null) ||
        (this.deepSpace ? this.deepSpace.getPositionOf(sel.id) : null);

      // Distance check: when zoomed in close to the spacecraft (< 0.005 units = ~32 km away),
      // hide the orbit line so it doesn't pierce through the satellite model and clutter the close-up view!
      let showOrbit = store.showSelectedOrbit;
      let isCloseToSat = false;
      if (satPos) {
        const camDistToSat = this.camera.position.distanceTo(new THREE.Vector3(satPos.x, satPos.y, satPos.z));
        if (camDistToSat < 0.005) {
          showOrbit = false;
        }
        if (camDistToSat < 0.015 || (this.focusMode === 'sat' && String(this.focusedSatId) === String(sel.id))) {
          isCloseToSat = true;
        }
      }

      this.orbitLine.updateSelected(sel, newSim, showOrbit);
      // Every selectable object renders through this close-up pass now — deep-space
      // probes and planetary orbiters included — so the real NASA GLB gets the same
      // tight-depth overlay treatment as the Earth-orbiting fleet. PlanetFleet hides its
      // own procedural mesh for the selected orbiter to avoid drawing it twice.
      this.satModel.update(satPos, sunDir, this.camera, store.showSat3DModel, sel);

      // If the detailed 3D spacecraft model is visible or camera is close/focused,
      // suppress the glowing dot marker completely so there is zero overlap, zero lagging bullet point, and perfect visual clarity!
      if ((store.showSat3DModel && this.satModel.isMeshVisible) || isCloseToSat) {
        this.satManager.setHiddenSelectedId(sel.id);
      } else {
        this.satManager.setHiddenSelectedId(null);
      }
    } else {
      if (this.focusMode === 'sat' && this.focusedSatId) {
        this.satManager.setHiddenSelectedId(this.focusedSatId);
      } else {
        this.satManager.setHiddenSelectedId(null);
      }
      if (this._prevSelId !== null) {
        this.satManager.setSelectedId(null);
        this._prevSelId = null;
      }
      this.orbitLine.hideSelected();
      this.satModel.update(null);
      if (this.focusedSatId) {
        this.resetFocus();
      }
    }

    // Multi-orbit constellation web
    perfProbe.begin('orbitLines');
    this.orbitLine.updateAllOrbits(
      this.satManager.sats,
      newSim,
      store.showAllOrbits,
      store.visibleCategories
    );
    perfProbe.end();

    // Skip OrbitControls while the focus transition owns the camera; it would
    // otherwise re-derive the camera from a stale target+offset and re-inject
    // damping, fighting the scripted path.
    if (!wasFocusTransitioning) {
      this.controls.update();
    }

    // Collision safety: prevent camera and controls target from ever penetrating planetary/solar bodies
    if (this.focusMode === 'moon') {
      const moonPos = this.moon.getPosition();
      const toCam = this.camera.position.clone().sub(moonPos);
      const distToMoon = toCam.length();
      if (distToMoon < 0.32) {
        const dir = distToMoon > 0.001 ? toCam.normalize() : new THREE.Vector3(0, 0, 1);
        this.camera.position.copy(moonPos).add(dir.multiplyScalar(0.32));
      }
    } else if (this.focusMode === 'sun') {
      const sunPos = this.sun.getPosition();
      const toCam = this.camera.position.clone().sub(sunPos);
      const distToSun = toCam.length();
      if (distToSun < 118.0) {
        const dir = distToSun > 0.001 ? toCam.normalize() : new THREE.Vector3(0, 0, 1);
        this.camera.position.copy(sunPos).add(dir.multiplyScalar(118.0));
      }
    } else if (this.focusMode === 'earth' || this.focusMode === 'sat') {
      // Earth-penetration guard. While orbiting Earth the hard limit is the 1.05 shell
      // (surface + atmosphere + clouds). A low-flying satellite can sit *below* that shell
      // (altitude < ~320 km ⇒ radius < 1.05), so when focused on a satellite/planet only the
      // actual surface+cloud shell (1.01) is enforced.
      const minR = this.focusMode === 'earth' ? 1.05 : 1.01;
      const camDist = this.camera.position.length();
      if (camDist < minR) {
        const dir = camDist > 0.001 ? this.camera.position.clone().normalize() : new THREE.Vector3(0, 1, 0);
        this.camera.position.copy(dir.multiplyScalar(minR));
      }
    }

    // Lock stars/skybox strictly to final camera position right before rendering
    this.stars.update(this.camera);

    perfProbe.begin('render');
    this.renderer.render(this.scene, this.camera);
    perfProbe.end();
  }

  // Cached label descriptors. Built once and mutated in place every tick so the
  // 30 Hz label pass performs no per-frame allocation (no GC micro-stutters).
  _ensureLabelBodies() {
    if (this._labelBodies) return this._labelBodies;

    // Display labels only when significantly zoomed out:
    // Earth: radius 1.0 -> visible when camDist >= 7.5 units
    // Moon: radius 0.2727 -> visible when camDist >= 3.5 units
    // Sun: radius 109.2 -> visible when camDist >= 1200.0 units
    const bodies = [
      { id: 'earth', name: 'Earth', nameRu: 'Земля', pos: this._vOrigin, radius: 1.005, radiusUnits: 1.005, closeUpFactor: 15, minZoomDist: 7.5, priority: 1 },
      { id: 'sun',   name: 'Sun',   nameRu: 'Солнце', pos: new THREE.Vector3(), radius: SUN_RADIUS_UNITS, radiusUnits: SUN_RADIUS_UNITS, closeUpFactor: SUN_CLOSE_UP_FACTOR, minZoomDist: 1200.0, priority: 2 },
      { id: 'moon',  name: 'Moon',  nameRu: 'Луна',  pos: new THREE.Vector3(), radius: 0.273, radiusUnits: 0.273, closeUpFactor: 15, minZoomDist: 3.5, priority: 3 },
    ];

    // Add planets when the planetary system is present.
    if (this.planets) {
      this.planets.planets.forEach((planetObj, planetId) => {
        bodies.push({
          id: planetId,
          name: planetObj.data.nameEn,
          nameRu: planetObj.data.nameRu,
          pos: new THREE.Vector3(),
          radius: planetObj.radiusUnits,
          radiusUnits: planetObj.radiusUnits,
          closeUpFactor: 15,
          isPlanet: true,
          // Scale by radius: a fixed 20 units left the label floating over a screen-filling
          // Jupiter (~23 units away). At 8 radii the disc covers ~20-30% of the viewport height,
          // past which the name is redundant clutter.
          minZoomDist: planetObj.radiusUnits * 8.0,
          priority: 4,
          planetObj,
        });
      });
    }

    this._labelBodies = bodies;
    return bodies;
  }

  getCelestialScreenPositions() {
    if (!this.camera) return [];
    const results = [];
    const w = window.innerWidth;
    const h = window.innerHeight;

    const bodies = this._ensureLabelBodies();

    // Refresh live positions in place (Sun and Moon move; planets orbit the Sun).
    for (const b of bodies) {
      if (b.id === 'sun' && this.sun) b.pos.copy(this.sun.getPosition());
      else if (b.id === 'moon' && this.moon) b.pos.copy(this.moon.getPosition());
      else if (b.planetObj) b.planetObj.group.getWorldPosition(b.pos);
    }

    const camPos = this.camera.position;
    // Whichever body the camera is inspecting up-close (Earth, Moon, Sun or a planet)
    // becomes the only body allowed to show a label, so distant planets never bleed
    // their names over the body in view.
    const zoomedBodyId = getZoomedBodyId(camPos, bodies);
    const projected = [];

    for (const b of bodies) {
      if (!b.pos) continue;
      // While the camera is inspecting any body up-close (Earth, Moon, Sun or a planet), drop
      // every label — including that body's own. Once you have zoomed in, the name is redundant
      // clutter rather than orientation.
      if (zoomedBodyId) continue;
      const camDist = camPos.distanceTo(b.pos);
      // Only display label when camera pulls far away so it never clutters close-up views
      if (camDist < b.minZoomDist) continue;

      // Any foreground celestial body can hide a label, not just Earth or the Moon.
      let isOccluded = false;
      for (const occluder of bodies) {
        if (occluder === b || !occluder.pos) continue;
        if (isSegmentOccludedBySphere(camPos, b.pos, occluder.pos, occluder.radius)) {
          isOccluded = true;
          break;
        }
      }
      if (isOccluded) continue;

      const p = this._vProj.copy(b.pos).project(this.camera);
      // Check if point is in front of camera frustum
      if (p.z > -1.0 && p.z < 1.0) {
        const x = (p.x * 0.5 + 0.5) * w;
        const y = (-p.y * 0.5 + 0.5) * h;
        if (x >= -40 && x <= w + 40 && y >= -40 && y <= h + 40) {
          projected.push({
            id: b.id,
            name: b.name,
            nameRu: b.nameRu,
            x,
            y,
            dist: camDist,
            priority: b.priority,
          });
        }
      }
    }

    // Anti-collision: sort by priority (Earth > Sun > Moon) and prevent label overlaps
    projected.sort((a, b) => a.priority - b.priority);
    const boxW = 120;
    const boxH = 30;

    for (const cand of projected) {
      let overlaps = false;
      for (const existing of results) {
        if (Math.abs(cand.x - existing.x) < boxW && Math.abs(cand.y - existing.y) < boxH) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) results.push(cand);
    }

    return results;
  }

  destroy() {
    if (this.animId) cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this._onResize);
    this.controls?.dispose();
    this.satManager?.destroy();
    this.earth?.dispose();
    this.atmosphere?.dispose();
    this.stars?.dispose();
    this.sun?.dispose();
    this.moon?.dispose();
    this.planetFleet?.dispose();
    this.deepSpace?.dispose();
    this.planets?.dispose();
    this.vanAllen?.dispose();
    this.satModel?.dispose();
    this.orbitLine?.dispose();
    this.renderer?.dispose();
  }
}

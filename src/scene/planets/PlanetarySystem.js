import * as THREE from 'three';
import {
  ORDERED_PLANET_KEYS,
  PLANETARY_ELEMENTS_J2000
} from '../../utils/planetaryData';
import { ORDERED_DWARF_KEYS, ORDERED_MOON_KEYS, getBodyData } from '../../utils/smallBodies';
import {
  getPlanetPositionThreeJS,
  getOrbitTrajectoryPoints,
  getGeocentricDistanceKm
} from '../../utils/ephemeris';
import {
  getDwarfPositionThreeJS,
  getDwarfOrbitPoints,
  getMoonOffsetThreeJS,
  getMoonOrbitPoints,
  getMoonMeanAnomaly,
} from '../../utils/smallBodyEphemeris';
import { getMoonPositionECI } from '../../utils/astronomy';
import { isPlanetCloseUp } from '../../utils/planetaryLabels';
import { isSegmentOccludedBySphere } from '../../utils/celestialOcclusion';
import { PlanetMeshBuilder } from './PlanetMeshBuilder';
import { TextureLODManager } from './TextureLODManager';

// Camera distance (in planet radii) below which the planet is considered "strongly
// zoomed": every other planet's orbit line is then removed from the view.
const STRONG_ZOOM_FACTOR = 40.0;

export class PlanetarySystem {
  constructor(scene, renderer = null) {
    this.scene = scene;
    this.textureLod = new TextureLODManager(renderer);
    this.group = new THREE.Group();
    this.group.name = 'planetary_system';
    this.scene.add(this.group);

    this.planets = new Map();
    this.orbitLines = new Map();
    this._lastOrbitUpdate = 0;
    this.isStrongZoom = false;
    this._tempV = new THREE.Vector3();

    // Create planets (excluding Earth, which is at the scene origin with full terrain/atmosphere)
    ORDERED_PLANET_KEYS.forEach(key => {
      if (key === 'earth') return;

      const planetObj = PlanetMeshBuilder.createPlanet(key, this.textureLod);
      if (!planetObj) return;

      planetObj.bodyClass = 'planet';
      this.planets.set(key, planetObj);
      this.group.add(planetObj.group);

      // Create orbital trajectory line
      const steps = 512;
      const positions = new Float32Array((steps + 1) * 3);
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const lineMat = new THREE.LineBasicMaterial({
        color: planetObj.data.orbitColor || 0x64748b,
        transparent: true,
        opacity: 0.85,
        depthTest: true,
        depthWrite: false,
      });

      const lineMesh = new THREE.Line(lineGeo, lineMat);
      lineMesh.frustumCulled = false;
      this.group.add(lineMesh);
      this.orbitLines.set(key, lineMesh);
    });

    // Dwarf planets: heliocentric osculating orbits (hidden until the user enables them).
    this.smallBodies = new Map();
    ORDERED_DWARF_KEYS.forEach(key => {
      const obj = PlanetMeshBuilder.createPlanet(key, this.textureLod, { lazyTexture: true });
      if (!obj) return;

      obj.bodyClass = 'dwarf';
      obj.group.visible = false;
      this.smallBodies.set(key, obj);
      this.group.add(obj.group);

      const steps = 512;
      const positions = new Float32Array((steps + 1) * 3);
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const lineMat = new THREE.LineBasicMaterial({
        color: obj.data.orbitColor || 0x64748b,
        transparent: true,
        opacity: 0.6,
        depthTest: true,
        depthWrite: false,
      });
      const lineMesh = new THREE.Line(lineGeo, lineMat);
      lineMesh.frustumCulled = false;
      lineMesh.visible = false;
      this.group.add(lineMesh);
      this.orbitLines.set(key, lineMesh);
    });

    // Natural satellites: attached to their parent's group so they follow it automatically.
    // A pivot tilted by the parent's axial tilt puts each moon in its parent's equator.
    ORDERED_MOON_KEYS.forEach(key => {
      const data = getBodyData(key);
      if (!data) return;
      const parent = this.planets.get(data.parentId) || this.smallBodies.get(data.parentId);
      if (!parent) return;

      const obj = PlanetMeshBuilder.createPlanet(key, null, { lazyTexture: true });
      if (!obj) return;
      obj.bodyClass = 'moon';
      obj.parentId = data.parentId;
      obj.group.visible = false;
      if (obj.beaconMesh) obj.beaconMesh.visible = false;

      const pivot = new THREE.Group();
      pivot.rotation.z = -parent.tiltRad; // place the moon system in the parent's equator
      pivot.add(obj.group);
      parent.group.add(pivot);
      obj.pivot = pivot;

      // Parent-relative orbit ring, drawn inside the same tilted pivot.
      const pts = getMoonOrbitPoints(key, 256);
      if (pts.length > 1) {
        const positions = new Float32Array(pts.length * 3);
        for (let i = 0; i < pts.length; i++) {
          positions[i * 3] = pts[i].x;
          positions[i * 3 + 1] = pts[i].y;
          positions[i * 3 + 2] = pts[i].z;
        }
        const ringGeo = new THREE.BufferGeometry();
        ringGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const ringMat = new THREE.LineBasicMaterial({
          color: data.orbitColor || 0x64748b,
          transparent: true,
          opacity: 0.35,
          depthTest: true,
          depthWrite: false,
        });
        const ring = new THREE.Line(ringGeo, ringMat);
        ring.frustumCulled = false;
        ring.visible = false;
        pivot.add(ring);
        obj.moonOrbitLine = ring;
      }

      this.smallBodies.set(key, obj);
    });
  }

  update(
    date,
    sunPos,
    camera,
    selectedPlanetId = null,
    showAllOrbits = false,
    showPlanetaryOrbits = true,
    focusMode = 'earth',
    focusedPlanetId = null,
    showDwarfPlanets = false,
    showMoons = false
  ) {
    if (!sunPos) return;

    const timeMs = date ? date.getTime() : Date.now();
    const shouldRecalcOrbits = Math.abs(timeMs - this._lastOrbitUpdate) > 600000 || this._lastOrbitUpdate === 0;

    // Automatic Proximity Detection to ANY celestial body (Earth, Moon, Sun, or any Planet):
    // 1. Earth proximity:
    const camDistFromEarth = camera ? camera.position.length() : 100.0;
    const isCloseToEarth = camDistFromEarth < 60.0;

    // 2. Find closest planet to camera right now:
    let closestPlanetId = null;
    let minPlanetDist = Infinity;
    this.planets.forEach((planet, id) => {
      planet.group.getWorldPosition(this._tempV);
      const d = camera ? camera.position.distanceTo(this._tempV) : Infinity;
      if (d < minPlanetDist) {
        minPlanetDist = d;
        closestPlanetId = id;
      }
    });

    const closestPlanet = closestPlanetId ? this.planets.get(closestPlanetId) : null;
    let isApproachingPlanet = closestPlanet && minPlanetDist < (closestPlanet.radiusUnits * 25.0 + 8.0);
    
    // Also consider approaching the Moon as a reason to hide planetary orbits
    if (camera && date) {
      const moonPosData = getMoonPositionECI(date);
      const moonPos = new THREE.Vector3(moonPosData.three.x, moonPosData.three.y, moonPosData.three.z);
      const distToMoon = camera.position.distanceTo(moonPos);
      if (distToMoon < 35.0 && distToMoon < minPlanetDist) {
        isApproachingPlanet = true;
        closestPlanetId = null; // We are inspecting the Moon, not a planet
      }
    }

    const zoomPlanet = closestPlanetId ? this.planets.get(closestPlanetId) : null;

    // A planet also counts as "strong zoom" when it is the explicitly focused body
    // (the user clicked it) and the camera has closed in on it — this keeps the
    // behaviour identical whether the planet is the closest one or not.
    let focusedClose = false;
    if (focusedPlanetId && camera) {
      const focusedPlanet = this.planets.get(focusedPlanetId);
      if (focusedPlanet) {
        focusedPlanet.group.getWorldPosition(this._tempV);
        focusedClose = camera.position.distanceTo(this._tempV) < focusedPlanet.radiusUnits * STRONG_ZOOM_FACTOR;
      }
    }

    this.isStrongZoom = Boolean(
      focusedClose ||
      (zoomPlanet && minPlanetDist < zoomPlanet.radiusUnits * STRONG_ZOOM_FACTOR)
    );

    // Deep Solar System zoom threshold:
    // Only when camera is sufficiently zoomed out (> 200 Earth radii, well beyond the Moon) do planetary orbits make sense as a map
    const isDeepSpaceOverview = camDistFromEarth >= 200.0 && !isApproachingPlanet;

    this.planets.forEach((planet, id) => {
      // 1. Precise real-time 3D planetary position
      const pos = getPlanetPositionThreeJS(id, date, sunPos);
      if (pos) {
        planet.group.position.set(pos.x, pos.y, pos.z);
        planet.lastComputedPosition = { x: pos.x, y: pos.y, z: pos.z };
        planet.lastComputedHelio = pos.helio;
      }

      // 2. Sidereal axial rotation
      // Negated so a prograde body (rotPeriodHours > 0) rotates eastward, matching Earth's
      // convention (world RA increases with time). Without the negation every planet spun
      // opposite to its true direction.
      if (planet.rotSpeed && planet.bodyMesh) {
        const angle = planet.rotSign * ((timeMs * 0.001 * planet.rotSpeed) % (Math.PI * 2.0));
        planet.bodyMesh.rotation.y = -angle;
      }

      const isSelected = selectedPlanetId === id;

      planet.group.getWorldPosition(this._tempV);
      const camDistToThisPlanet = camera ? camera.position.distanceTo(this._tempV) : 1000.0;

      // 3. Stream this planet's surface resolution tiers by camera proximity and rebind the
      // active one. Both tiers are non-null textures, so the swap is a reference change and
      // never triggers a shader recompile (see TextureLODManager).
      if (planet.lod) {
        planet.lod.update(camDistToThisPlanet);
        const activeMap = planet.lod.texture;
        if (planet.bodyMesh.material.map !== activeMap) {
          planet.bodyMesh.material.map = activeMap;
        }
      }

      // 4. Distance-adaptive beacon: a small marker that grows with camera distance so the
      // planet stays a visible dot from far away, and vanishes once the disc itself is large
      // enough to read. The marker must scale with the body — a fixed 1-unit sphere (the old
      // `Math.max(1.0, …)` floor) swamped tiny Mercury/Venus/Mars, overlapping the disc far
      // closer than the close-up threshold hid it (see isPlanetCloseUp).
      if (camera && planet.beaconMesh) {
        // When inspecting the planet up-close, hide the beacon dot completely
        const isUpClose = isPlanetCloseUp(camDistToThisPlanet, planet.radiusUnits);
        planet.beaconMesh.visible = !isUpClose;
        if (!isUpClose) {
          const bScale = Math.min(Math.max(camDistToThisPlanet * 0.008, planet.radiusUnits * 0.02), 800.0);
          planet.beaconMesh.scale.set(bScale, bScale, bScale);
        }
      }

      // 5. Intelligent Orbit Lines Visibility:
      const orbitLine = this.orbitLines.get(id);
      if (orbitLine) {
        let isOrbitVisible = false;

        if (showPlanetaryOrbits && !this.isStrongZoom) {
          if (isApproachingPlanet) {
            isOrbitVisible = (id === closestPlanetId) || isSelected;
          } else if (isDeepSpaceOverview) {
            isOrbitVisible = true;
          } else {
            isOrbitVisible = isSelected || (showAllOrbits && camDistFromEarth >= 60.0);
          }
        }

        orbitLine.visible = isOrbitVisible;

        if (isOrbitVisible) {
          // Smooth fade out when approaching this planet
          let targetOpacity = 0.85;
          if (camDistToThisPlanet < planet.radiusUnits * 400.0) {
            const fadeStart = planet.radiusUnits * 400.0;
            const fadeEnd = planet.radiusUnits * 30.0;
            const factor = Math.max(0.0, Math.min(1.0, (camDistToThisPlanet - fadeEnd) / (fadeStart - fadeEnd)));
            targetOpacity = 0.85 * factor;
          }
          orbitLine.material.opacity = targetOpacity;
          
          if (targetOpacity <= 0.01) {
            orbitLine.visible = false;
          }
        }

        const needsInit = !orbitLine.userData.initialized;
        if (isOrbitVisible && (shouldRecalcOrbits || needsInit)) {
          // Generate orbit relative to origin (0,0,0) and use 720 steps for smoothness
          const originSun = new THREE.Vector3(0, 0, 0);
          const pts = getOrbitTrajectoryPoints(id, date, originSun, 720);
          const posAttr = orbitLine.geometry.attributes.position;
          
          // Recreate attribute if size changed (from 180 to 720)
          if (posAttr.count !== pts.length) {
             const newPositions = new Float32Array(pts.length * 3);
             for (let i = 0; i < pts.length; i++) {
               newPositions[i * 3] = pts[i].x;
               newPositions[i * 3 + 1] = pts[i].y;
               newPositions[i * 3 + 2] = pts[i].z;
             }
             orbitLine.geometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
          } else {
             for (let i = 0; i < pts.length; i++) {
               posAttr.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
             }
             posAttr.needsUpdate = true;
          }
          
          orbitLine.geometry.computeBoundingSphere();
          orbitLine.userData.initialized = true;
        }
        
        // Track the sun's exact position every frame so the planet never drifts from the line
        orbitLine.position.copy(sunPos);
      }
    });

    if (shouldRecalcOrbits) {
      this._lastOrbitUpdate = timeMs;
    }

    // Dwarf planets and moons (hidden until their display toggle is on or they are selected).
    this._updateSmallBodies(
      date,
      sunPos,
      camera,
      selectedPlanetId,
      focusedPlanetId,
      showPlanetaryOrbits,
      showAllOrbits,
      showDwarfPlanets,
      showMoons
    );
  }

  // Update dwarf planets and natural satellites. Dwarfs use heliocentric conic elements;
  // moons are positioned relative to their (already updated) parent. Both stay hidden unless
  // their display toggle is on or the body is selected/focused.
  _updateSmallBodies(
    date,
    sunPos,
    camera,
    selectedPlanetId,
    focusedPlanetId,
    showPlanetaryOrbits,
    showAllOrbits,
    showDwarfPlanets,
    showMoons
  ) {
    const timeMs = date ? date.getTime() : Date.now();

    this.smallBodies.forEach((body, id) => {
      const isSelected = selectedPlanetId === id;
      const isFocused = focusedPlanetId === id;
      const isMoonBody = body.bodyClass === 'moon';
      const showClass = isMoonBody ? showMoons : showDwarfPlanets;
      const isVisible = Boolean(showClass || isSelected || isFocused);

      // Advance the body's position every frame, even while it is hidden. A hidden group would
      // otherwise sit at the scene origin, so its own moons — and the camera, when the user clicks
      // one — would be anchored to Earth with nothing there: focusing MK 2 or Xiangliu used to fly
      // the camera to the origin because their (hidden) dwarf parent was never positioned. Only
      // the rendering is gated below; the ephemeris work is a handful of Kepler solves per frame.
      if (isMoonBody) {
        const offset = getMoonOffsetThreeJS(id, date);
        if (offset) body.group.position.set(offset.x, offset.y, offset.z);
        // Tidally locked: keep the same face toward the parent.
        if (body.bodyMesh) {
          body.bodyMesh.rotation.y = -getMoonMeanAnomaly(id, date);
        }
      } else {
        const pos = getDwarfPositionThreeJS(id, date, sunPos);
        if (pos) {
          body.group.position.set(pos.x, pos.y, pos.z);
          body.lastComputedPosition = { x: pos.x, y: pos.y, z: pos.z };
        }
        // Sidereal rotation
        if (body.rotSpeed && body.bodyMesh) {
          const angle = body.rotSign * ((timeMs * 0.001 * body.rotSpeed) % (Math.PI * 2.0));
          body.bodyMesh.rotation.y = -angle;
        }
      }

      if (!isVisible) {
        body.group.visible = false;
        const line = this.orbitLines.get(id);
        if (line) line.visible = false;
        if (body.moonOrbitLine) body.moonOrbitLine.visible = false;
        return;
      }

      body.group.visible = true;
      // Bodies built lazily synthesise their surface the first time they are actually shown, so a
      // body that stays hidden never pays for its procedural canvas (no-op after the first call).
      body.ensureTexture?.();

      if (isMoonBody) {
        if (body.moonOrbitLine) {
          body.moonOrbitLine.visible = Boolean(isSelected || isFocused || showMoons);
        }
      } else {
        // Heliocentric orbit line (static osculating ellipse — built once).
        const line = this.orbitLines.get(id);
        if (line) {
          if (!line.userData.initialized) {
            const originSun = new THREE.Vector3(0, 0, 0);
            const pts = getDwarfOrbitPoints(id, originSun, 512);
            const arr = new Float32Array(pts.length * 3);
            for (let i = 0; i < pts.length; i++) {
              arr[i * 3] = pts[i].x;
              arr[i * 3 + 1] = pts[i].y;
              arr[i * 3 + 2] = pts[i].z;
            }
            line.geometry.dispose();
            line.geometry = new THREE.BufferGeometry();
            line.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
            line.geometry.computeBoundingSphere();
            line.userData.initialized = true;
          }
          line.visible = Boolean(showPlanetaryOrbits && (showDwarfPlanets || isSelected || isFocused));
          if (line.visible) line.position.copy(sunPos);
        }
      }

      // Stream this dwarf's surface resolution tiers by camera proximity and rebind the active
      // one — mirrors the planet loop above. Without this the tiers would decode but never be
      // shown, so Ceres/Haumea/Makemake/Eris would stay stuck on their 2K base map. Moons have
      // no LOD (built without a tier table — see PlanetMeshBuilder), so `body.lod` is null.
      if (body.lod && camera) {
        body.group.getWorldPosition(this._tempV);
        const camDistToBody = camera.position.distanceTo(this._tempV);
        body.lod.update(camDistToBody);
        const activeMap = body.lod.texture;
        if (body.bodyMesh.material.map !== activeMap) {
          body.bodyMesh.material.map = activeMap;
        }
      }

      // Distance-adaptive beacon for dwarfs so they read as dots from far away. Same
      // body-scaled marker as the planets above — the old fixed 1-unit floor made the beacon
      // far bigger than a dwarf (Ceres is ~0.07 Earth radii) and it overlapped the disc.
      if (camera && body.beaconMesh && !isMoonBody) {
        body.group.getWorldPosition(this._tempV);
        const camDist = camera.position.distanceTo(this._tempV);
        const isUpClose = isPlanetCloseUp(camDist, body.radiusUnits);
        body.beaconMesh.visible = !isUpClose;
        if (!isUpClose) {
          const bScale = Math.min(Math.max(camDist * 0.008, body.radiusUnits * 0.02), 800.0);
          body.beaconMesh.scale.set(bScale, bScale, bScale);
        }
      }
    });
  }

  getPositionOf(planetId) {
    if (planetId === 'earth') {
      return new THREE.Vector3(0, 0, 0);
    }
    const planet = this.planets.get(planetId) || this.smallBodies.get(planetId);
    if (!planet) return null;
    const v = new THREE.Vector3();
    planet.group.getWorldPosition(v);
    return v;
  }

  getPlanetData(planetId) {
    return getBodyData(planetId);
  }

  getBodyClass(planetId) {
    return getBodyData(planetId)?.bodyClass || null;
  }

  isSunOccluded(camera, sunPosition) {
    if (!camera || !sunPosition) return false;

    for (const planet of this.planets.values()) {
      planet.group.getWorldPosition(this._tempV);
      if (isSegmentOccludedBySphere(
        camera.position,
        sunPosition,
        this._tempV,
        planet.radiusUnits,
      )) {
        return true;
      }
    }
    return false;
  }

  pick(ndcX, ndcY, camera) {
    if (!camera) return null;

    const clickNDC = new THREE.Vector2(ndcX, ndcY);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(clickNDC, camera);
    const ray = raycaster.ray;

    let bestPlanet = null;
    let minScore = Infinity;

    // Planets plus any *visible* small body (dwarfs/moons are only pickable once shown).
    const candidates = [];
    this.planets.forEach((b, id) => candidates.push([id, b]));
    this.smallBodies.forEach((b, id) => { if (b.group.visible) candidates.push([id, b]); });

    candidates.forEach(([id, planet]) => {
      planet.group.getWorldPosition(this._tempV);
      const camDist = camera.position.distanceTo(this._tempV);
      const distToRay = ray.distanceToPoint(this._tempV);

      this._tempV.project(camera);
      if (this._tempV.z <= -1.0 || this._tempV.z >= 1.0) return;

      const dx = this._tempV.x - clickNDC.x;
      const dy = this._tempV.y - clickNDC.y;
      const screenDist = Math.sqrt(dx * dx + dy * dy);

      // Hit threshold: physical radius projected + generous click target
      const hitRadiusNDC = Math.max(0.04, (planet.radiusUnits * 1.5) / Math.max(1.0, camDist));
      if (screenDist < hitRadiusNDC || distToRay < planet.radiusUnits * 2.0) {
        if (screenDist < minScore) {
          minScore = screenDist;
          bestPlanet = {
            id,
            name: planet.data.nameEn,
            nameRu: planet.data.nameRu,
            isPlanet: true,
            bodyClass: planet.bodyClass || 'planet',
            parentId: planet.data.parentId || null,
            radiusKm: planet.data.radiusKm,
            data: planet.data,
          };
        }
      }
    });

    return bestPlanet;
  }

  setVisibility(visible) {
    this.group.visible = visible;
  }

  dispose() {
    this.scene.remove(this.group);
    this.textureLod?.dispose();
    // Body and beacon spheres are shared singletons (see PlanetMeshBuilder): disposing them here
    // would blank every other body, so only their per-body materials are released.
    const release = (mesh) => {
      if (!mesh) return;
      if (!mesh.userData?.sharedGeometry) mesh.geometry?.dispose();
      mesh.material?.dispose();
    };
    this.planets.forEach(p => {
      release(p.bodyMesh);
      release(p.ringMesh);
      release(p.beaconMesh);
    });
    this.orbitLines.forEach(line => {
      line.geometry?.dispose();
      line.material?.dispose();
    });
    this.planets.clear();
    this.smallBodies.forEach(body => {
      release(body.bodyMesh);
      release(body.ringMesh);
      release(body.beaconMesh);
      body.moonOrbitLine?.geometry?.dispose();
      body.moonOrbitLine?.material?.dispose();
    });
    this.smallBodies.clear();
    this.orbitLines.clear();
  }
}

import * as THREE from 'three';
import { PLANETARY_ELEMENTS_J2000 } from '../../utils/planetaryData';
import { EARTH_RADIUS_KM } from '../../utils/astronomy';
import { PLANETARY_ORBITERS } from '../../utils/planetaryFleet';
import { solveEllipticKepler } from '../../utils/conicPropagation';
import { createOrbiterMesh } from '../fleetMeshFactory';

const DEG2RAD = Math.PI / 180;
// Only reveal a planet's artificial fleet once the camera is within this many
// planet radii of it — otherwise the tiny orbit rings would clutter the whole
// Solar System map.
const FLEET_REVEAL_FACTOR = 400.0;

// Screen-space marker sizing (pixels) and the auto-ring fade-in distance.
const DOT_PIXELS = 6;
// Once the camera is closer than this (scene units) the orbiter reads as "full screen"
// and the auto ring is suppressed; beyond it the ring appears like the click-selection ring.
const RING_FROM_UNITS = 0.1;
const RING_MIN_SCALE = 0.002;
const RING_MAX_SCALE = 0.2;

// Artificial satellites orbiting the other planets (Mars, Jupiter, Venus, Mercury).
//
// Each parent planet gets its own group anchored at the planet's live world position;
// the orbiters move on true Keplerian ellipses (from the real periapsis/apoapsis and
// period) in that local frame. This mirrors the Moon's own orbiter fleet, but for the
// planetary system, and it is what lets the fleet track a moving planet.
export class PlanetFleet {
  constructor(scene, planetarySystem) {
    this.scene = scene;
    this.planetarySystem = planetarySystem;
    this.visible = true;

    this.group = new THREE.Group();
    this.group.name = 'planet_fleet';
    this.scene.add(this.group);

    this.entries = new Map(); // parentPlanetId -> { group, planetRadiusUnits, items }
    this._tempV = new THREE.Vector3();

    for (const sat of PLANETARY_ORBITERS) {
      const planetData = PLANETARY_ELEMENTS_J2000[sat.parentPlanetId];
      if (!planetData) continue;

      const planetRadiusUnits = planetData.radiusKm / EARTH_RADIUS_KM;
      const rp = (planetData.radiusKm + (sat.periapsisKm ?? sat.altKm ?? 0)) / EARTH_RADIUS_KM;
      const ra = (planetData.radiusKm + (sat.apoapsisKm ?? sat.periapsisKm ?? sat.altKm ?? 0)) / EARTH_RADIUS_KM;
      const a = (rp + ra) / 2;
      const e = ra + rp > 0 ? (ra - rp) / (ra + rp) : 0;
      const b = a * Math.sqrt(Math.max(0, 1 - e * e));
      const incRad = (sat.incDeg ?? 0) * DEG2RAD;
      const raanRad = (sat.raanDeg ?? 0) * DEG2RAD;

      let entry = this.entries.get(sat.parentPlanetId);
      if (!entry) {
        const planetGroup = new THREE.Group();
        planetGroup.name = `fleet_${sat.parentPlanetId}`;
        this.group.add(planetGroup);
        entry = { group: planetGroup, planetRadiusUnits, items: [] };
        this.entries.set(sat.parentPlanetId, entry);
      }

      // Orbit trace in the planet-local frame (inclination about X, then RAAN about Y).
      const steps = 160;
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const E = (i / steps) * Math.PI * 2;
        const xp = a * (Math.cos(E) - e);
        const yp = b * Math.sin(E);
        const x1 = xp;
        const y1 = yp * Math.sin(incRad);
        const z1 = yp * Math.cos(incRad);
        pts.push(new THREE.Vector3(
          x1 * Math.cos(raanRad) - z1 * Math.sin(raanRad),
          y1,
          x1 * Math.sin(raanRad) + z1 * Math.cos(raanRad),
        ));
      }
      const traceGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const traceMat = new THREE.LineBasicMaterial({
        color: sat.color ?? 0x38bdf8,
        transparent: true,
        opacity: 0.7,
      });
      const orbitTrace = new THREE.Line(traceGeo, traceMat);
      orbitTrace.visible = false;
      entry.group.add(orbitTrace);

      const model = createOrbiterMesh(sat);
      entry.group.add(model.group);

      // Screen-space coloured dot so the orbiter can be found at any zoom level — the
      // tiny procedural bus simply vanishes once you pull back from the planet.
      const dotGeo = new THREE.BufferGeometry();
      const dotPos = new Float32Array(3);
      dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3));
      const dotMat = new THREE.PointsMaterial({
        size: DOT_PIXELS,
        sizeAttenuation: false,
        color: sat.color ?? 0x38bdf8,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const dot = new THREE.Points(dotGeo, dotMat);
      dot.frustumCulled = false;
      entry.group.add(dot);

      // Auto ring: an analogue of the click-selection ring, shown automatically whenever
      // the orbiter is small on screen (you have pulled back a little) so it is not lost
      // among the dots. Hidden once the camera is close enough to fill the view.
      const ringGeo = new THREE.RingGeometry(0.85, 1.0, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: sat.color ?? 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
      });
      const autoRing = new THREE.Mesh(ringGeo, ringMat);
      autoRing.renderOrder = 998;
      autoRing.visible = false;
      entry.group.add(autoRing);

      entry.items.push({
        sat,
        mesh: model.group,
        orbitTrace,
        dot,
        dotPos,
        dotGeo,
        autoRing,
        ringGeo,
        ringMat,
        a,
        b,
        e,
        incRad,
        raanRad,
        phaseOffset: sat.phaseOffset ?? 0,
        periodMs: (sat.periodMin || 120) * 60 * 1000,
      });
    }
  }

  // Keplerian position on the ellipse for a given elapsed fraction of the period.
  _localPosition(item, timeMs) {
    const M = 2 * Math.PI * (((timeMs / item.periodMs) + item.phaseOffset) % 1.0);
    const E = solveEllipticKepler(M, item.e);
    const xp = item.a * (Math.cos(E) - item.e);
    const yp = item.b * Math.sin(E);
    const x1 = xp;
    const y1 = yp * Math.sin(item.incRad);
    const z1 = yp * Math.cos(item.incRad);
    return {
      x: x1 * Math.cos(item.raanRad) - z1 * Math.sin(item.raanRad),
      y: y1,
      z: x1 * Math.sin(item.raanRad) + z1 * Math.cos(item.raanRad),
    };
  }

  update(date, camera, selectedSatId = null, showAllOrbits = false, showOrbiterRings = true) {
    const timeMs = date ? date.getTime() : Date.now();

    for (const [planetId, entry] of this.entries) {
      const planetPos = this.planetarySystem.getPositionOf(planetId);
      if (!planetPos) continue;
      entry.group.position.copy(planetPos);

      const camDistToPlanet = camera ? camera.position.distanceTo(planetPos) : Infinity;
      const isSelectedHere = entry.items.some(it => this._isSelected(it.sat, selectedSatId));
      const revealedByProximity = camDistToPlanet < entry.planetRadiusUnits * FLEET_REVEAL_FACTOR;
      entry.group.visible = Boolean(this.visible && (isSelectedHere || revealedByProximity));

      // Positions are advanced every frame even while the fleet is hidden. getPositionOf()
      // and the focus transition read the live mesh transform, so latching onto a stale
      // one (from the last frame the fleet happened to be visible) is what made a selected
      // orbiter appear detached from — "lost" relative to — its parent planet.
      for (const item of entry.items) {
        const local = this._localPosition(item, timeMs);
        item.mesh.position.set(local.x, local.y, local.z);

        item.dotPos[0] = local.x;
        item.dotPos[1] = local.y;
        item.dotPos[2] = local.z;
        item.dotGeo.attributes.position.needsUpdate = true;

        if (!entry.group.visible) continue;

        const isSelected = this._isSelected(item.sat, selectedSatId);
        // Show the orbit trace only when the orbiter is selected or "all orbits" mode is on —
        // the same rule the solar and deep-space probes follow. Drawing it purely because the
        // camera happens to sit near the planet left a permanent, non-interactive ellipse
        // cluttering the close-up view.
        item.orbitTrace.visible = Boolean(isSelected || showAllOrbits);

        let camDist = Infinity;
        if (camera) {
          item.mesh.getWorldPosition(this._tempV);
          camDist = camera.position.distanceTo(this._tempV);
        }

        // The selected orbiter draws its real NASA GLB through the shared close-up pass,
        // so hide its procedural bus here. The rest keep ballooning with distance so they
        // stay legible up to the point the coloured dot takes over.
        if (isSelected) {
          item.mesh.visible = false;
        } else {
          item.mesh.visible = true;
          const s = camDist < 10 ? 1 : Math.min(camDist * 0.03, 12);
          item.mesh.scale.setScalar(s);
        }

        // Coloured dot: on unless the selected real hull fills the view.
        item.dot.visible = !(isSelected && camDist < 0.005);

        // Auto ring: suppressed for the selected orbiter (the close-up pass draws its own)
        // and once the camera is close enough that the hull is large on screen.
        const showRing = showOrbiterRings && !isSelected && Boolean(camera) && camDist > RING_FROM_UNITS;
        item.autoRing.visible = showRing;
        if (showRing) {
          item.autoRing.position.set(local.x, local.y, local.z);
          item.autoRing.lookAt(camera.position);
          const rs = Math.min(Math.max(camDist * 0.02, RING_MIN_SCALE), RING_MAX_SCALE);
          item.autoRing.scale.set(rs, rs, rs);
        }
      }
    }
  }

  _isSelected(sat, selectedSatId) {
    if (!selectedSatId) return false;
    return sat.id === selectedSatId || sat.noradId === selectedSatId;
  }

  getPositionOf(satId) {
    for (const entry of this.entries.values()) {
      for (const item of entry.items) {
        if (item.sat.id === satId || item.sat.noradId === satId) {
          const worldPos = new THREE.Vector3();
          item.mesh.getWorldPosition(worldPos);
          return worldPos;
        }
      }
    }
    return null;
  }

  pick(ndcX, ndcY, camera) {
    if (!this.visible || !camera) return null;

    const clickNDC = new THREE.Vector2(ndcX, ndcY);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(clickNDC, camera);
    const ray = raycaster.ray;

    let bestSat = null;
    let minScore = Infinity;

    // A 6 px marker is a tiny target when the camera is pulled back to the reveal distance,
    // so keep a comfortably large hit radius (screen distance dominates; the world-space
    // ray tolerance only guards against off-screen false positives).

    for (const entry of this.entries.values()) {
      if (!entry.group.visible) continue;
      for (const item of entry.items) {
        item.mesh.getWorldPosition(this._tempV);
        const distToRay = ray.distanceToPoint(this._tempV);
        this._tempV.project(camera);
        if (this._tempV.z <= -1.0 || this._tempV.z >= 1.0) continue;

        const dx = this._tempV.x - clickNDC.x;
        const dy = this._tempV.y - clickNDC.y;
        const screenDistSq = dx * dx + dy * dy;

        if (screenDistSq < 0.005 && distToRay < 1.2) {
          if (screenDistSq < minScore) {
            minScore = screenDistSq;
            bestSat = item.sat;
          }
        }
      }
    }

    return bestSat;
  }

  setVisibility(visible) {
    this.visible = visible;
    this.group.visible = visible;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const entry of this.entries.values()) {
      for (const item of entry.items) {
        item.orbitTrace.geometry?.dispose();
        item.orbitTrace.material?.dispose();
        item.dotGeo?.dispose();
        item.dot?.material?.dispose?.();
        item.ringGeo?.dispose();
        item.ringMat?.dispose?.();
        item.mesh.traverse?.((child) => {
          child.geometry?.dispose?.();
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose?.());
          else child.material?.dispose?.();
        });
      }
    }
    this.entries.clear();
  }
}

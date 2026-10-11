import * as THREE from 'three';
import { DEEP_SPACE_PROBES } from '../utils/deepSpaceProbes';
import {
  heliocentricConicThreeJS,
  sampleConicTrajectory,
} from '../utils/conicPropagation';
import { helioEclipticToThreeJS } from '../utils/ephemeris';

// Interstellar / escape probes (Voyager 1-2, Pioneer 10-11, New Horizons).
//
// They are not bound to any planet, so they live in their own heliocentric group
// anchored at the Sun and propagated from their real JPL Horizons osculating
// hyperbolic elements. Because they are hundreds of millions of km away, this class
// owns only the screen-space marker and the escape trail; the detailed real NASA GLB
// hull is drawn by the shared close-up pass (SatelliteModel) when a probe is focused,
// so it gets the same tight-depth overlay treatment as every other spacecraft.
const MAX_TRAIL_AU = 340;
const MARKER_PIXELS = 8;
const REVEAL_FROM_EARTH_UNITS = 80.0;
// Once the camera is this close (scene units) to a focused probe, hide its screen-space
// marker so the glowing dot does not sit on top of the real 3D hull. Matches the
// SatelliteModel close-up threshold (camDist < 0.005 units) so marker and hull swap cleanly.
const MARKER_HIDE_UNITS = 0.005;

export class DeepSpaceFleet {
  constructor(scene) {
    this.scene = scene;
    this.visible = true;

    this.group = new THREE.Group();
    this.group.name = 'deep_space_fleet';
    this.scene.add(this.group);

    this.items = DEEP_SPACE_PROBES.map((probe, index) => {
      // Escape trail: outbound branch of the hyperbola, converted to scene units.
      const eclipticPts = sampleConicTrajectory(probe.elements, MAX_TRAIL_AU, 600, true);
      const trailPts = eclipticPts.map(([xEcl, yEcl, zEcl]) => {
        const rel = helioEclipticToThreeJS(xEcl, yEcl, zEcl);
        return new THREE.Vector3(rel.x, rel.y, rel.z);
      });
      const trailGeo = new THREE.BufferGeometry().setFromPoints(trailPts);
      const trailMat = new THREE.LineBasicMaterial({
        color: probe.color ?? 0xffffff,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
      });
      const trail = new THREE.Line(trailGeo, trailMat);
      trail.visible = false;
      this.group.add(trail);

      // Per-probe marker: its own Points/geometry so it can be hidden independently
      // (only the focused probe is ever close enough for the real hull to be visible).
      const markerPos = new Float32Array(3);
      const markerGeo = new THREE.BufferGeometry();
      markerGeo.setAttribute('position', new THREE.BufferAttribute(markerPos, 3));
      const markerMat = new THREE.PointsMaterial({
        size: MARKER_PIXELS,
        sizeAttenuation: false,
        color: probe.color ?? 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const marker = new THREE.Points(markerGeo, markerMat);
      marker.frustumCulled = false;
      this.group.add(marker);

      return {
        probe,
        index,
        marker,
        markerGeo,
        markerMat,
        markerPos,
        position: new THREE.Vector3(),
        trail,
      };
    });

    this._tempV = new THREE.Vector3();
  }

  update(date, sunPos, camera, selectedSatId = null, showAllOrbits = false, showProbes = false) {
    this.group.position.copy(sunPos);

    const camDistFromEarth = camera ? camera.position.length() : Infinity;

    for (const item of this.items) {
      const { rel } = heliocentricConicThreeJS(item.probe.elements, date);
      item.position.set(rel.x, rel.y, rel.z);

      item.markerPos[0] = rel.x;
      item.markerPos[1] = rel.y;
      item.markerPos[2] = rel.z;
      item.markerGeo.attributes.position.needsUpdate = true;
      item.markerGeo.computeBoundingSphere();

      const isSelected = this._isSelected(item.probe, selectedSatId);
      item.trail.visible = Boolean(isSelected || showAllOrbits);

      // World position (Sun-anchored group) for the close-up marker suppression.
      this._tempV.set(sunPos.x + rel.x, sunPos.y + rel.y, sunPos.z + rel.z);
      const camDist = camera ? camera.position.distanceTo(this._tempV) : Infinity;
      item.marker.visible = !(isSelected && camDist < MARKER_HIDE_UNITS);
    }

    const anySelected = this.items.some(it => this._isSelected(it.probe, selectedSatId));
    // These probes coast hundreds of millions of km out, so their markers read as stray dots far
    // from any planet. They stay off by default and only reappear past the reveal threshold once
    // the user enables them; selecting one still shows it (and its hull) regardless of the toggle.
    const revealMarkers = anySelected || (showProbes && camDistFromEarth >= REVEAL_FROM_EARTH_UNITS);
    this.group.visible = Boolean(this.visible && revealMarkers);
  }

  _isSelected(probe, selectedSatId) {
    if (!selectedSatId) return false;
    return probe.id === selectedSatId || probe.noradId === selectedSatId;
  }

  getPositionOf(satId) {
    const item = this.items.find(it => it.probe.id === satId || it.probe.noradId === satId);
    if (!item) return null;
    return new THREE.Vector3().copy(item.position).add(this.group.position);
  }

  pick(ndcX, ndcY, camera) {
    if (!this.visible || !camera || !this.group.visible) return null;

    const clickNDC = new THREE.Vector2(ndcX, ndcY);
    let bestSat = null;
    let minScore = Infinity;

    for (const item of this.items) {
      this._tempV.set(
        this.group.position.x + item.position.x,
        this.group.position.y + item.position.y,
        this.group.position.z + item.position.z,
      );
      const projected = this._tempV.clone().project(camera);
      if (projected.z <= -1.0 || projected.z >= 1.0) continue;

      const dx = projected.x - clickNDC.x;
      const dy = projected.y - clickNDC.y;
      const screenDistSq = dx * dx + dy * dy;
      // An 8 px marker is tiny on screen; allow a comfortable click radius.
      if (screenDistSq < 0.002) {
        if (screenDistSq < minScore) {
          minScore = screenDistSq;
          bestSat = item.probe;
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
    for (const item of this.items) {
      item.trail.geometry?.dispose();
      item.trail.material?.dispose();
      item.markerGeo.dispose();
      item.markerMat.dispose();
    }
    this.items = [];
  }
}

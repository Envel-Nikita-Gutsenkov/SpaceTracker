import * as THREE from 'three';
import * as satjs from 'satellite.js';
import { eciToThreeJS } from '../utils/astronomy';
import { getCategoryColor, getCategoryColorRGB } from '../utils/categories';

const ORBIT_POINTS = 1440;
const MULTI_ORBIT_POINTS = 256;
const MAX_MULTI_ORBITS = 180;

const ORBIT_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec4 aColor;
  varying vec4 vColor;

  void main() {
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const ORBIT_FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  varying vec4 vColor;
  void main() {
    #include <logdepthbuf_fragment>
    gl_FragColor = vColor;
  }
`;

export class OrbitLine {
  constructor(scene) {
    this.scene = scene;
    this.line = null;
    this.allOrbitsMesh = null;
    this._currentId = null;
    this._currentSatrec = null;
    this._currentPeriod = 0;
    this._baseEpochMs = 0;
    this._lastAllOrbitsHash = '';
  }

  updateSelected(sat, dateMs, visible = true) {
    if (!visible || !sat?.tle1 || !sat?.tle2) {
      this.hideSelected();
      return;
    }

    try {
      // Rebuild orbit geometry ONLY when selecting a new satellite, or every ~10 minutes
      // In inertial ECI space, Keplerian/SGP4 orbits are stationary fixed ellipses!
      // Recomputing geometry every frame from dateMs caused vertices to shift and create a swimming/teleporting illusion.
      const needsRebuild = !this.line ||
        this._currentId !== sat.id ||
        Math.abs(dateMs - this._baseEpochMs) > 10 * 60 * 1000;

      if (needsRebuild) {
        const satrec = satjs.twoline2satrec(sat.tle1, sat.tle2);
        const isEscape = satrec.ecco >= 1.0;
        const period = (!isEscape && satrec.no > 0)
          ? (2 * Math.PI / satrec.no) * 60 * 1000
          : 12 * 3600 * 1000;

        this._currentSatrec = satrec;
        this._currentPeriod = period;
        this._baseEpochMs = dateMs;

        const n = ORBIT_POINTS;
        const positions = new Float32Array((n + 1) * 3);
        const colors = new Float32Array((n + 1) * 4); // RGBA per vertex
        const phases = new Float32Array(n + 1);

        const baseRgb = getCategoryColorRGB(sat.category);

        // Propagate orbit geometry from fixed reference epoch
        const rawPoints = [];
        for (let i = 0; i <= n; i++) {
          const fraction = i / n;
          const t = new Date(this._baseEpochMs + fraction * period);
          const pv = satjs.propagate(satrec, t);
          if (pv?.position && !isNaN(pv.position.x)) {
            rawPoints.push(pv.position);
          } else {
            rawPoints.push(rawPoints[rawPoints.length - 1] || { x: 0, y: 0, z: 0 });
          }
        }

        const endP = rawPoints[n];
        const startP = rawPoints[0];
        const driftX = isEscape ? 0 : (endP.x - startP.x);
        const driftY = isEscape ? 0 : (endP.y - startP.y);
        const driftZ = isEscape ? 0 : (endP.z - startP.z);

        for (let i = 0; i <= n; i++) {
          const fraction = i / n;
          const raw = rawPoints[i];
          const smoothX = raw.x - fraction * driftX;
          const smoothY = raw.y - fraction * driftY;
          const smoothZ = raw.z - fraction * driftZ;

          const p = eciToThreeJS(smoothX, smoothY, smoothZ);
          positions[i * 3]     = p.x;
          positions[i * 3 + 1] = p.y;
          positions[i * 3 + 2] = p.z;

          colors[i * 4]     = baseRgb.r;
          colors[i * 4 + 1] = baseRgb.g;
          colors[i * 4 + 2] = baseRgb.b;
          colors[i * 4 + 3] = 1.0;

          phases[i] = fraction;
        }

        if (!this.line) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          geo.setAttribute('aColor',   new THREE.BufferAttribute(colors, 4));
          const mat = new THREE.ShaderMaterial({
            vertexShader:   ORBIT_VERT,
            fragmentShader: ORBIT_FRAG,
            transparent:    true,
            depthWrite:     false,
            blending:       THREE.AdditiveBlending,
          });
          this.line = new THREE.Line(geo, mat);
          this.line.frustumCulled = false;
          this.scene.add(this.line);
        } else {
          this.line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          this.line.geometry.setAttribute('aColor',   new THREE.BufferAttribute(colors, 4));
          this.line.geometry.attributes.position.needsUpdate = true;
          this.line.geometry.attributes.aColor.needsUpdate = true;
        }

        this._currentId = sat.id;
      }

      if (this.line) {
        this.line.visible = true;
      }
    } catch (err) {
      console.warn('OrbitLine.updateSelected error:', err.message);
      this.hideSelected();
    }
  }

  hideSelected() {
    if (this.line) this.line.visible = false;
    this._currentId = null;
    this._baseEpochMs = 0;
  }

  updateAllOrbits(sats, dateMs, enabled, visibleCategories) {
    if (!enabled || !sats || sats.length === 0) {
      if (this.allOrbitsMesh) this.allOrbitsMesh.visible = false;
      return;
    }

    // Rebuild only when category filter changes or mesh not built yet
    const catKey = Array.from(visibleCategories || []).sort().join(',');
    const hash = `${catKey}_${sats.length}`;

    if (this._lastAllOrbitsHash === hash && this.allOrbitsMesh) {
      this.allOrbitsMesh.visible = true;
      return;
    }

    this._lastAllOrbitsHash = hash;
    this._buildAllOrbitsMesh(sats, dateMs, visibleCategories);
  }

  _buildAllOrbitsMesh(sats, dateMs, visibleCategories) {
    if (this.allOrbitsMesh) {
      this.scene.remove(this.allOrbitsMesh);
      this.allOrbitsMesh.geometry.dispose();
      this.allOrbitsMesh.material.dispose();
      this.allOrbitsMesh = null;
    }

    // Sample representative satellites across visible categories
    const matchingSats = sats.filter(s =>
      s.tle1 && s.tle2 && (!visibleCategories || visibleCategories.has(s.category))
    );

    if (matchingSats.length === 0) return;

    // Pick evenly spaced sample up to MAX_MULTI_ORBITS
    const step = Math.max(1, Math.floor(matchingSats.length / MAX_MULTI_ORBITS));
    const selectedSats = [];
    for (let i = 0; i < matchingSats.length && selectedSats.length < MAX_MULTI_ORBITS; i += step) {
      selectedSats.push(matchingSats[i]);
    }

    const n = MULTI_ORBIT_POINTS;
    // Each orbit has n segments = 2 * n vertices
    const totalVertices = selectedSats.length * n * 2;
    const positions = new Float32Array(totalVertices * 3);
    const colors = new Float32Array(totalVertices * 3);

    let vIdx = 0;

    selectedSats.forEach(sat => {
      try {
        const satrec = satjs.twoline2satrec(sat.tle1, sat.tle2);
        if (!satrec || satrec.error) return;
        const period = (2 * Math.PI / satrec.no) * 60 * 1000;
        const rgb = getCategoryColorRGB(sat.category);

        const loopPoints = [];
        for (let i = 0; i < n; i++) {
          const t = new Date(dateMs + (i / n) * period);
          const pv = satjs.propagate(satrec, t);
          if (pv?.position && !isNaN(pv.position.x)) {
            loopPoints.push(eciToThreeJS(pv.position.x, pv.position.y, pv.position.z));
          } else {
            return;
          }
        }

        for (let i = 0; i < n; i++) {
          const p1 = loopPoints[i];
          const p2 = loopPoints[(i + 1) % n];
          const frac1 = i / n;
          const frac2 = ((i + 1) % n) / n;

          // Head is brightest white near sat, tail fades gently
          const b1 = Math.max(0.2, 1.0 - frac1 * 0.8);
          const b2 = Math.max(0.2, 1.0 - frac2 * 0.8);

          // Vertex 1
          positions[vIdx * 3]     = p1.x;
          positions[vIdx * 3 + 1] = p1.y;
          positions[vIdx * 3 + 2] = p1.z;
          colors[vIdx * 3]        = THREE.MathUtils.lerp(rgb.r, 1.0, 1.0 - frac1) * b1;
          colors[vIdx * 3 + 1]    = THREE.MathUtils.lerp(rgb.g, 1.0, 1.0 - frac1) * b1;
          colors[vIdx * 3 + 2]    = THREE.MathUtils.lerp(rgb.b, 1.0, 1.0 - frac1) * b1;
          vIdx++;

          // Vertex 2
          positions[vIdx * 3]     = p2.x;
          positions[vIdx * 3 + 1] = p2.y;
          positions[vIdx * 3 + 2] = p2.z;
          colors[vIdx * 3]        = THREE.MathUtils.lerp(rgb.r, 1.0, 1.0 - frac2) * b2;
          colors[vIdx * 3 + 1]    = THREE.MathUtils.lerp(rgb.g, 1.0, 1.0 - frac2) * b2;
          colors[vIdx * 3 + 2]    = THREE.MathUtils.lerp(rgb.b, 1.0, 1.0 - frac2) * b2;
          vIdx++;
        }
      } catch (e) {
        // Skip invalid orbit
      }
    });

    const activePositions = positions.subarray(0, vIdx * 3);
    const activeColors = colors.subarray(0, vIdx * 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(activePositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(activeColors, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.allOrbitsMesh = new THREE.LineSegments(geo, mat);
    this.allOrbitsMesh.frustumCulled = false;
    this.scene.add(this.allOrbitsMesh);
  }

  hide() {
    this.hideSelected();
    if (this.allOrbitsMesh) this.allOrbitsMesh.visible = false;
  }

  dispose() {
    if (this.line) {
      this.scene.remove(this.line);
      this.line.geometry.dispose();
      this.line.material.dispose();
      this.line = null;
    }
    if (this.allOrbitsMesh) {
      this.scene.remove(this.allOrbitsMesh);
      this.allOrbitsMesh.geometry.dispose();
      this.allOrbitsMesh.material.dispose();
      this.allOrbitsMesh = null;
    }
  }
}

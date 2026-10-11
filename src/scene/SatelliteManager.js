import * as THREE from 'three';
import * as satjs from 'satellite.js';
import { CATEGORIES, getCategoryColorRGB } from '../utils/categories';
import { eciToThreeJS } from '../utils/astronomy';
import { useSatStore } from '../store/useSatStore';

const WORKER_COUNT      = 4;
const UPDATE_INTERVAL   = 1000; // ms between propagation ticks
const LABEL_MAX_COUNT   = 60;   // max labels shown at once
const LABEL_MIN_CAMERA_DIST = 1.6; // only label when zoomed in enough

// Satellite point shader — renders crisp glowing dots
const SAT_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float aSize;
  attribute float aSelected;
  attribute float aSatId;
  uniform float   uScale;
  uniform float   uHideSelectedId;
  varying vec3    vColor;
  varying float   vSel;
  varying float   vHide;

  void main() {
    vColor = color;
    vSel   = aSelected;

    // Check if this point belongs to the hidden selected satellite (with 3D model active)
    float isHidden = (uHideSelectedId > 0.0 && abs(aSatId - uHideSelectedId) < 0.5) ? 1.0 : 0.0;
    vHide = isHidden;

    if (isHidden > 0.5 || aSize <= 0.001) {
      gl_PointSize = 0.0;
      gl_Position  = vec4(999999.0, 999999.0, 999999.0, 1.0);
      return;
    }

    vec4 mvPos    = modelViewMatrix * vec4(position, 1.0);
    float camDist = length(mvPos.xyz);
    float sizePx  = (aSize * 0.8 * uScale) + (aSelected * 3.5);
    gl_PointSize  = sizePx * (180.0 / camDist);
    gl_PointSize  = clamp(gl_PointSize, 1.0, 9.0);
    gl_Position   = projectionMatrix * mvPos;
    // Depth is written in the same logarithmic encoding as every other object (see
    // SceneManager's logarithmicDepthBuffer), so points occlude against the Earth correctly.
    #include <logdepthbuf_vertex>
  }
`;

const SAT_FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform float uOpacity;
  varying vec3  vColor;
  varying float vSel;
  varying float vHide;

  void main() {
    #include <logdepthbuf_fragment>
    if (vHide > 0.5) discard;
    float d     = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.18, d);
    // Glow halo for selected
    float glow  = vSel * smoothstep(0.5, 0.0, d) * 0.6;
    vec3 col    = vColor + glow;
    gl_FragColor = vec4(col, alpha * (0.85 + glow * 0.15) * uOpacity);
  }
`;

export class SatelliteManager {
  constructor(scene, camera) {
    this.scene    = scene;
    this.camera   = camera;
    this.sats     = [];           // all satellite metadata
    this.catData  = {};           // catId → { points, items[], positions, sizes, selected }
    this.workers  = [];
    this.assigns  = [];           // per-worker { start, items[] }
    this.master   = new Float32Array(0); // global ECI positions [x,y,z per sat]
    this.idToIdx  = new Map();
    this.labels   = [];           // { sprite, satIdx } pool
    this.labelPool= [];
    this.selectedId = null;
    this.timer    = null;
    this._filterCache = { cats: null, query: '' };
    this._workersPending = 0;
  }

  _getGlobalIndex(satId) {
    if (satId === null || satId === undefined) return undefined;
    const direct = this.idToIdx.get(satId);
    if (direct !== undefined) return direct;
    const asNum = this.idToIdx.get(Number(satId));
    if (asNum !== undefined) return asNum;
    return this.idToIdx.get(String(satId));
  }

  load(sats) {
    this.sats = sats.filter(s => s.tle1 && s.tle2);
    useSatStore.getState().setSatelliteCount(this.sats.length);
    this.master = new Float32Array(this.sats.length * 3);

    // Map id → global index (both number and string forms for reliable lookup)
    this.sats.forEach((s, i) => {
      this.idToIdx.set(s.id, i);
      this.idToIdx.set(Number(s.id), i);
      this.idToIdx.set(String(s.id), i);
    });

    // Group by category
    const groups = {};
    CATEGORIES.forEach(c => { groups[c.id] = []; });
    this.sats.forEach((s, i) => {
      const cid = s.category || 'other';
      if (!groups[cid]) groups[cid] = [];
      groups[cid].push({ sat: s, gi: i });
    });

    // Create one Points per category
    CATEGORIES.forEach(cat => {
      const items = groups[cat.id] || [];
      if (!items.length) return;
      const n         = items.length;
      const positions = new Float32Array(n * 3);
      const colors    = new Float32Array(n * 3);
      const sizes     = new Float32Array(n).fill(cat.dotSize ?? 2);
      const selected  = new Float32Array(n);
      const satIds    = new Float32Array(n);
      const rgb       = getCategoryColorRGB(cat.id);

      for (let i = 0; i < n; i++) {
        colors[i*3]=rgb.r; colors[i*3+1]=rgb.g; colors[i*3+2]=rgb.b;
        satIds[i] = items[i].sat.id || 0;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));
      geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes,     1));
      geo.setAttribute('aSelected',new THREE.BufferAttribute(selected,  1).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aSatId',   new THREE.BufferAttribute(satIds,    1));

      const mat = new THREE.ShaderMaterial({
        vertexShader:   SAT_VERT,
        fragmentShader: SAT_FRAG,
        vertexColors:   true,
        transparent:    true,
        depthWrite:     false,
        blending:       THREE.AdditiveBlending,
        uniforms: {
          uScale:           { value: 1.0 },
          uOpacity:         { value: 1.0 },
          uHideSelectedId:  { value: 0.0 },
        },
      });

      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;

      // Ensure initial visibility matches the store filters (e.g. starlink and oneweb off by default)
      const store = useSatStore.getState();
      if (store.visibleCategories && !store.visibleCategories.has(cat.id)) {
        points.visible = false;
      }

      this.scene.add(points);

      this.catData[cat.id] = { points, items, activeItems: [...items], positions, colors, sizes, selected, satIds };
    });

    // Apply any initial filters from store immediately
    const store = useSatStore.getState();
    this.setFilters(
      store.visibleCategories,
      store.searchQuery,
      store.operatorFilter,
      store.orbitRegimeFilter
    );

    this._initWorkers();
    this._initLabels();
  }

  _initWorkers() {
    const allSats  = this.sats;
    const chunk    = Math.ceil(allSats.length / WORKER_COUNT);
    this.workers   = [];
    this.assigns   = [];

    for (let w = 0; w < WORKER_COUNT; w++) {
      const start = w * chunk;
      const end   = Math.min(start + chunk, allSats.length);
      if (start >= allSats.length) break;

      const items = allSats.slice(start, end).map((s, i) => ({
        id: s.id, tle1: s.tle1, tle2: s.tle2, gi: start + i,
      }));

      const worker = new Worker(
        new URL('../workers/propagator.worker.js', import.meta.url),
        { type: 'module' }
      );
      worker.onmessage = (e) => this._onWorkerMsg(w, e.data);
      worker.onerror   = (e) => console.error('Propagator worker error:', e.message);
      worker.postMessage({ type: 'init', data: items });

      this.workers.push(worker);
      this.assigns.push({ start, items });
    }

    this.timer = setInterval(() => this._tick(), UPDATE_INTERVAL);
    setTimeout(() => this._tick(), 200);
  }

  _initLabels() {
    // Pre-build label sprite pool (canvas-based text sprites)
    this.labelPool = [];
    for (let i = 0; i < LABEL_MAX_COUNT; i++) {
      const sprite = this._makeLabel('');
      sprite.visible = false;
      this.scene.add(sprite);
      this.labelPool.push({ sprite, satIdx: -1 });
    }
  }

  _makeLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width  = 256;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 40);
    ctx.font         = '600 13px Inter, sans-serif';
    ctx.fillStyle    = 'rgba(255,255,255,0.92)';
    ctx.shadowColor  = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur   = 4;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 4, 20);
    const tex    = new THREE.CanvasTexture(canvas);
    const mat    = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.5, 0.08, 1);
    sprite.userData.canvas = canvas;
    sprite.userData.ctx    = ctx;
    sprite.userData.text   = '';
    return sprite;
  }

  _updateLabel(poolItem, satIdx, text, pos) {
    const { sprite } = poolItem;
    if (poolItem.satIdx !== satIdx || sprite.userData.text !== text) {
      const ctx    = sprite.userData.ctx;
      const canvas = sprite.userData.canvas;
      ctx.clearRect(0, 0, 256, 40);
      ctx.font         = '600 13px Inter, sans-serif';
      ctx.fillStyle    = 'rgba(255,255,255,0.92)';
      ctx.shadowColor  = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur   = 5;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 4, 20);
      sprite.material.map.needsUpdate = true;
      sprite.userData.text = text;
      poolItem.satIdx = satIdx;
    }
    sprite.position.set(pos.x + 0.04, pos.y + 0.04, pos.z);
    sprite.visible = true;
  }

  _tick() {
    const timeMs = useSatStore.getState().simTime;
    this._lastPropagatedSim = timeMs;
    this._workersPending = this.workers.length;
    this.workers.forEach(w => w.postMessage({ type: 'propagate', data: { timeMs } }));
  }

  _onWorkerMsg(workerIdx, msg) {
    if (msg.type !== 'positions') return;
    const { positions } = msg;
    const assign = this.assigns[workerIdx];
    const selGi = this.selectedId !== null ? this._getGlobalIndex(this.selectedId) : -1;

    // Write into master array by global index
    assign.items.forEach((item, i) => {
      // Never overwrite the selected satellite with stale 1-second worker data!
      if (item.gi === selGi && this._liveSelectedPos) return;

      this.master[item.gi * 3]     = positions[i * 3];
      this.master[item.gi * 3 + 1] = positions[i * 3 + 1];
      this.master[item.gi * 3 + 2] = positions[i * 3 + 2];
    });

    this._workersPending--;
    // Update GPU geometry once per tick instead of 4 separate GPU buffer uploads per second
    if (this._workersPending <= 0) {
      this._syncGeometry();
    }
  }

  _syncGeometry() {
    const camDist = this.camera.position.length();
    const store = useSatStore.getState();
    const selSat = store.selectedSat;
    const showLabels = store.showLabels;
    const hiddenIdStr = this._hiddenSelectedId !== null && this._hiddenSelectedId !== undefined ? String(this._hiddenSelectedId) : null;
    const selIdStr = (selSat?.id !== null && selSat?.id !== undefined) ? String(selSat.id) : (this.selectedId !== null ? String(this.selectedId) : null);

    const labelCandidates = [];

    Object.values(this.catData).forEach(data => {
      if (!data.points.visible) return;
      const list = data.activeItems || data.items;
      const { positions } = data;
      const drawRange = data.points.geometry.drawRange;
      const visCount  = drawRange.count === Infinity ? list.length : Math.min(drawRange.count, list.length);

      for (let i = 0; i < visCount; i++) {
        const item = list[i];
        if (!item) continue;
        const gi   = item.gi;
        const itemIdStr = String(item.sat.id);
        const isHidden = hiddenIdStr !== null && itemIdStr === hiddenIdStr;
        const isSelected = selIdStr !== null && itemIdStr === selIdStr;

        let x, y, z;
        if (isHidden) {
          x = 1e8; y = 1e8; z = 1e8;
          data.sizes[i] = 0.0;
          data.selected[i] = 0.0;
        } else if (isSelected && this._liveSelectedPos) {
          x = this._liveSelectedPos.x;
          y = this._liveSelectedPos.y;
          z = this._liveSelectedPos.z;
        } else {
          x = this.master[gi * 3];
          y = this.master[gi * 3 + 1];
          z = this.master[gi * 3 + 2];
        }

        positions[i * 3]     = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        // 1. If user clicked a satellite, label it
        // 2. If user explicitly enabled Satellite Labels toggle in sidebar, show labels for visible satellites
        const isGeneralLabel = showLabels && (item.sat.category === 'iss' || item.gi % 25 === 0) && camDist < 3.2;

        if (isSelected || isGeneralLabel) {
          const dx = x - this.camera.position.x;
          const dy = y - this.camera.position.y;
          const dz = z - this.camera.position.z;
          const d2 = dx*dx + dy*dy + dz*dz;
          labelCandidates.push({ satIdx: gi, sat: item.sat, x, y, z, d2, priority: isSelected ? 0 : 1 });
        }
      }
      data.points.geometry.attributes.position.needsUpdate = true;
    });

    // Update labels cleanly
    this._updateLabels(labelCandidates);
  }

  _updateLabels(candidates) {
    // Hide all labels first
    this.labelPool.forEach(p => { p.sprite.visible = false; });

    if (!candidates.length) return;

    const store = useSatStore.getState();
    const maxLabels = store.showLabels ? 10 : (store.selectedSat ? 1 : 0);
    if (maxLabels === 0) return;

    // Sort by priority (selected first), then distance to camera
    candidates.sort((a, b) => a.priority - b.priority || a.d2 - b.d2);

    // Screen-space anti-collision algorithm: prevent overlapping text labels
    const projectedSlots = [];
    const w = window.innerWidth;
    const h = window.innerHeight;
    const tempProj = new THREE.Vector3();
    let assigned = 0;

    for (let c of candidates) {
      if (assigned >= maxLabels || assigned >= this.labelPool.length) break;

      tempProj.set(c.x, c.y, c.z).project(this.camera);
      // Ignore satellites behind camera
      if (tempProj.z <= -1.0 || tempProj.z >= 1.0) continue;

      const sx = (tempProj.x * 0.5 + 0.5) * w;
      const sy = (-tempProj.y * 0.5 + 0.5) * h;

      // Approximate label box size: 140px width x 24px height
      const boxW = 140;
      const boxH = 26;

      let overlaps = false;
      for (const slot of projectedSlots) {
        if (Math.abs(sx - slot.x) < boxW && Math.abs(sy - slot.y) < boxH) {
          overlaps = true;
          break;
        }
      }

      // If this candidate overlaps an already rendered higher-priority label, skip it!
      if (overlaps && c.priority !== 0) continue;

      projectedSlots.push({ x: sx, y: sy });

      const name = c.sat.name.length > 22
        ? c.sat.name.slice(0, 20) + '…'
        : c.sat.name;

      this._updateLabel(
        this.labelPool[assigned], c.satIdx, name,
        { x: c.x, y: c.y, z: c.z }
      );
      assigned++;
    }
  }

  setFilters(visibleCategories, searchQuery, operatorFilter = 'all', orbitRegimeFilter = 'all', bodyFilters = 'all') {
    const query = (searchQuery || '').toLowerCase().trim();
    const activeDomains = (bodyFilters instanceof Set)
      ? bodyFilters
      : (typeof bodyFilters === 'string'
          ? (bodyFilters === 'all' ? new Set(['earth', 'moon', 'sun', 'cislunar']) : new Set([bodyFilters]))
          : new Set(['earth', 'moon', 'sun', 'cislunar']));

    const allowEarth = activeDomains.has('earth');
    const allowCislunar = activeDomains.has('cislunar');

    Object.entries(this.catData).forEach(([catId, data]) => {
      if (!visibleCategories.has(catId)) {
        data.points.visible = false;
        data.points.userData.filterVisible = false;
        return;
      }
      data.points.userData.filterVisible = true;
      data.points.visible = this._earthFade !== undefined ? this._earthFade > 0.001 : true;

      const hasQuery = Boolean(query);
      const hasOpFilter = operatorFilter && operatorFilter !== 'all';
      const hasRegimeFilter = orbitRegimeFilter && orbitRegimeFilter !== 'all';
      const hasDomainCulling = !allowEarth || !allowCislunar;

      if (!hasQuery && !hasOpFilter && !hasRegimeFilter && !hasDomainCulling) {
        data.activeItems = [...data.items];
        data.points.geometry.setDrawRange(0, Infinity);
        return;
      }

      // Reorder positions: matching sats first, then setDrawRange
      const { items } = data;
      const tempPos = new Float32Array(items.length * 3);
      const activeItems = [];
      let write = 0;

      items.forEach((item) => {
        const sat = item.sat;
        const nameUpper = (sat.name || '').toUpperCase();
        const country = (sat.country || '').toUpperCase();

        // Query check
        if (hasQuery) {
          const matchQ = sat.name.toLowerCase().includes(query)
            || String(sat.id).includes(query)
            || (sat.intlDesignator || '').toLowerCase().includes(query);
          if (!matchQ) return;
        }

        // Operator / origin check
        if (hasOpFilter) {
          let opMatch = false;
          if (operatorFilter === 'nasa_usa') {
            opMatch = country === 'US' || nameUpper.includes('NASA') || nameUpper.includes('NAVSTAR') || nameUpper.includes('NOAA') || nameUpper.includes('USA');
          } else if (operatorFilter === 'russia') {
            opMatch = country === 'CIS' || country === 'RU' || country === 'SU' || nameUpper.includes('COSMOS') || nameUpper.includes('GLONASS') || nameUpper.includes('SOYUZ');
          } else if (operatorFilter === 'esa') {
            opMatch = country === 'ESA' || nameUpper.includes('GALILEO') || nameUpper.includes('METEOSAT') || nameUpper.includes('SENTINEL');
          } else if (operatorFilter === 'china') {
            opMatch = country === 'PRC' || country === 'CN' || nameUpper.includes('BEIDOU') || nameUpper.includes('TIANGONG') || nameUpper.includes('CZ-');
          } else if (operatorFilter === 'spacex') {
            opMatch = nameUpper.includes('STARLINK') || nameUpper.includes('DRAGON');
          }
          if (!opMatch) return;
        }

        // Orbit regime check
        if (hasRegimeFilter) {
          const mm = sat.meanMotion || 0;
          const ecc = sat.eccentricity || 0;
          let regimeMatch = false;
          if (orbitRegimeFilter === 'leo') {
            regimeMatch = mm >= 11.25 && ecc < 0.25;
          } else if (orbitRegimeFilter === 'meo') {
            regimeMatch = mm < 11.25 && mm > 1.5 && ecc < 0.25;
          } else if (orbitRegimeFilter === 'geo') {
            regimeMatch = mm >= 0.95 && mm <= 1.08;
          } else if (orbitRegimeFilter === 'heo') {
            regimeMatch = ecc >= 0.25;
          }
          if (!regimeMatch) return;
        }

        // Celestial Body / Domain filter (Earth / Cislunar)
        const apogee = sat.apogeeKm || 0;
        const isCislunar = apogee > 60000 || sat.isCislunar;
        if (!allowEarth && !isCislunar) return;
        if (!allowCislunar && isCislunar) return;

        const gi = item.gi;
        tempPos[write * 3]     = this.master[gi * 3];
        tempPos[write * 3 + 1] = this.master[gi * 3 + 1];
        tempPos[write * 3 + 2] = this.master[gi * 3 + 2];
        if (data.satIds) data.satIds[write] = item.sat.id || 0;
        if (data.selected) data.selected[write] = (this.selectedId && item.sat.id === this.selectedId) ? 1.0 : 0.0;
        activeItems.push(item);
        write++;
      });

      data.activeItems = activeItems;
      data.positions.set(tempPos);
      data.points.geometry.attributes.position.needsUpdate = true;
      if (data.points.geometry.attributes.aSatId) {
        data.points.geometry.attributes.aSatId.needsUpdate = true;
      }
      if (data.points.geometry.attributes.aSelected) {
        data.points.geometry.attributes.aSelected.needsUpdate = true;
      }
      data.points.geometry.setDrawRange(0, write);
    });
  }

  updateCameraDistance(camDistEarth) {
    const store = useSatStore.getState();
    const activeDomains = (store.bodyFilters instanceof Set)
      ? store.bodyFilters
      : new Set(store.bodyFilter === 'all' ? ['earth', 'moon', 'sun', 'cislunar'] : [store.bodyFilter]);

    const allowEarth = activeDomains.has('earth');
    const allowCislunar = activeDomains.has('cislunar');

    if (!allowEarth && !allowCislunar) {
      Object.values(this.catData).forEach(data => {
        data.points.visible = false;
      });
      this.labelPool.forEach(p => { p.sprite.visible = false; });
      return;
    }

    // Distance fade for Earth orbit satellites:
    // Fully visible up to 80 units (includes viewing from Moon orbit at 60.3 units).
    // Fades smoothly between 80 and 140 units.
    // Beyond 140 units (e.g. far out in deep space or near Sun at 23,481 units), completely culled!
    const fade = THREE.MathUtils.clamp((140.0 - camDistEarth) / 60.0, 0.0, 1.0);
    this._earthFade = fade;

    Object.values(this.catData).forEach(data => {
      if (data.points.userData.filterVisible === false) {
        data.points.visible = false;
        return;
      }
      if (fade <= 0.001) {
        data.points.visible = false;
        if (data.points.material.uniforms?.uOpacity) {
          data.points.material.uniforms.uOpacity.value = 0.0;
        }
      } else {
        data.points.visible = true;
        if (data.points.material.uniforms?.uOpacity) {
          data.points.material.uniforms.uOpacity.value = fade;
        }
      }
    });

    if (fade <= 0.05) {
      this.labelPool.forEach(p => { p.sprite.visible = false; });
    }
  }

  setSelectedId(satId) {
    // Clear previous selection highlight
    if (this.selectedId !== null) {
      this._setHighlight(this.selectedId, 0);
    }
    this.selectedId = satId;
    if (satId !== null) {
      this._setHighlight(satId, 1);
    }
  }

  setHiddenSelectedId(satId) {
    const prevHidden = this._hiddenSelectedId;
    this._hiddenSelectedId = satId;

    const idVal = satId ? Number(satId) : 0.0;
    Object.values(this.catData).forEach(data => {
      if (data.points?.material?.uniforms?.uHideSelectedId) {
        data.points.material.uniforms.uHideSelectedId.value = idVal;
      }
    });

    // 1. Hide the newly hidden satellite completely (move to 1e8 and size 0)
    if (satId !== null && satId !== undefined) {
      const gi = this._getGlobalIndex(satId);
      if (gi !== undefined) {
        const sat = this.sats[gi];
        const data = this.catData[sat?.category || 'other'];
        if (data) {
          const list = data.activeItems || data.items;
          const localIdx = list.findIndex(it => it.gi === gi);
          if (localIdx !== -1) {
            data.sizes[localIdx] = 0.0;
            data.selected[localIdx] = 0.0;
            data.positions[localIdx * 3]     = 1e8;
            data.positions[localIdx * 3 + 1] = 1e8;
            data.positions[localIdx * 3 + 2] = 1e8;
            if (data.points.geometry.attributes.aSize) {
              data.points.geometry.attributes.aSize.needsUpdate = true;
            }
            if (data.points.geometry.attributes.aSelected) {
              data.points.geometry.attributes.aSelected.needsUpdate = true;
            }
            if (data.points.geometry.attributes.position) {
              data.points.geometry.attributes.position.needsUpdate = true;
            }
          }
        }
      }
    }

    // 2. If unhiding the previous satellite, restore its position and size
    if (prevHidden !== null && prevHidden !== undefined && String(prevHidden) !== String(satId)) {
      const gi = this._getGlobalIndex(prevHidden);
      if (gi !== undefined) {
        const sat = this.sats[gi];
        const data = this.catData[sat?.category || 'other'];
        if (data) {
          const list = data.activeItems || data.items;
          const localIdx = list.findIndex(it => it.gi === gi);
          if (localIdx !== -1) {
            const cat = CATEGORIES.find(c => c.id === (sat?.category || 'other'));
            data.sizes[localIdx] = cat?.dotSize ?? 2.0;
            data.selected[localIdx] = (this.selectedId !== null && String(this.selectedId) === String(prevHidden)) ? 1.0 : 0.0;
            data.positions[localIdx * 3]     = this.master[gi * 3];
            data.positions[localIdx * 3 + 1] = this.master[gi * 3 + 1];
            data.positions[localIdx * 3 + 2] = this.master[gi * 3 + 2];
            if (data.points.geometry.attributes.aSize) {
              data.points.geometry.attributes.aSize.needsUpdate = true;
            }
            if (data.points.geometry.attributes.aSelected) {
              data.points.geometry.attributes.aSelected.needsUpdate = true;
            }
            if (data.points.geometry.attributes.position) {
              data.points.geometry.attributes.position.needsUpdate = true;
            }
          }
        }
      }
    }
  }

  _setHighlight(satId, val) {
    const gi = this._getGlobalIndex(satId);
    if (gi === undefined) return;
    const sat = this.sats[gi];
    const data = this.catData[sat?.category || 'other'];
    if (!data) return;
    const list = data.activeItems || data.items;
    const localIdx = list.findIndex(it => it.gi === gi);
    if (localIdx === -1) return;
    // Don't turn highlight on if currently suppressed by close-up 3D model
    const isHidden = (this._hiddenSelectedId !== null && String(this._hiddenSelectedId) === String(satId));
    if (val === 1 && isHidden) {
      data.selected[localIdx] = 0.0;
      data.sizes[localIdx] = 0.0;
    } else {
      data.selected[localIdx] = val;
      const cat = CATEGORIES.find(c => c.id === (sat?.category || 'other'));
      data.sizes[localIdx] = val === 1 ? (cat?.dotSize ?? 2.0) : (cat?.dotSize ?? 2.0);
    }
    data.points.geometry.attributes.aSelected.needsUpdate = true;
    if (data.points.geometry.attributes.aSize) {
      data.points.geometry.attributes.aSize.needsUpdate = true;
    }
  }

  getPositionOf(satId, timeMs = null) {
    const gi = this._getGlobalIndex(satId);
    if (gi === undefined) return null;

    // High precision real-time SGP4 propagation: if sim time is provided,
    // evaluate the exact position analytically on every single rendered frame.
    // This gives 100% butter-smooth motion at 60/144+ FPS without any 1Hz worker stutter!
    if (timeMs !== null) {
      if (!this._satrecCache) this._satrecCache = new Map();
      let rec = this._satrecCache.get(satId);
      if (rec === undefined) {
        const sat = this.sats[gi];
        if (sat && sat.tle1 && sat.tle2) {
          try {
            rec = satjs.twoline2satrec(sat.tle1, sat.tle2);
          } catch (_) {
            rec = null;
          }
        } else {
          rec = null;
        }
        this._satrecCache.set(satId, rec);
      }

      if (rec && !rec.error) {
        try {
          const date = new Date(timeMs);
          const pv = satjs.propagate(rec, date);
          if (pv && pv.position && !isNaN(pv.position.x)) {
            return eciToThreeJS(pv.position.x, pv.position.y, pv.position.z);
          }
        } catch (_) {}
      }
    }

    return {
      x: this.master[gi*3],
      y: this.master[gi*3+1],
      z: this.master[gi*3+2],
    };
  }

  pick(ndcX, ndcY) {
    const clickNDC = new THREE.Vector2(ndcX, ndcY);
    const tempV = new THREE.Vector3();
    let bestSat = null;
    let minScore = Infinity; // combined screen-space distance and depth preference

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(clickNDC, this.camera);
    const ray = raycaster.ray;

    // Pick from visible categories and active drawRange
    Object.values(this.catData).forEach(data => {
      if (!data.points.visible) return;
      const list = data.activeItems || data.items;
      const drawRange = data.points.geometry.drawRange;
      const visCount  = drawRange.count === Infinity ? list.length : Math.min(drawRange.count, list.length);

      for (let i = 0; i < visCount; i++) {
        const item = list[i];
        if (!item) continue;
        const gi = item.gi;
        const x = this.master[gi * 3];
        const y = this.master[gi * 3 + 1];
        const z = this.master[gi * 3 + 2];

        // 3D world position
        tempV.set(x, y, z);

        // Distance from ray in 3D
        const distToRay = ray.distanceToPoint(tempV);

        // Project to screen NDC
        tempV.project(this.camera);

        // Discard points behind camera or outside clip space
        if (tempV.z <= -1.0 || tempV.z >= 1.0) continue;

        // Screen-space 2D distance squared
        const dx = tempV.x - clickNDC.x;
        const dy = tempV.y - clickNDC.y;
        const screenDistSq = dx * dx + dy * dy;

        // Within click radius (~32 pixels in NDC space: 0.002)
        if (screenDistSq < 0.0022) {
          // Weight screen distance heavily + subtle depth factor so the closer front satellite wins
          const score = screenDistSq + (distToRay * 0.0001);
          if (score < minScore) {
            minScore = score;
            bestSat = item.sat;
          }
        }
      }
    });

    return bestSat;
  }

  setPointSize(scale) {
    Object.values(this.catData).forEach(d => {
      if (d.points?.material?.uniforms?.uScale) {
        d.points.material.uniforms.uScale.value = scale;
      }
    });
  }

  update(timeMs, focusedSatId = null) {
    // 1. Real-time per-frame analytical synchronization for active satellites (selected and/or focused):
    // Updates vertex positions at 60+ FPS so there is ZERO lag, ZERO backwards drifting, and ZERO stuttering
    const activeSatIds = new Set();
    if (this.selectedId !== null && this.selectedId !== undefined) activeSatIds.add(this.selectedId);
    if (focusedSatId !== null && focusedSatId !== undefined) activeSatIds.add(focusedSatId);

    activeSatIds.forEach(satId => {
      const isHidden = (this._hiddenSelectedId !== null && this._hiddenSelectedId !== undefined && String(this._hiddenSelectedId) === String(satId));
      const live = this.getPositionOf(satId, timeMs);
      if (!live) return;

      const gi = this._getGlobalIndex(satId);
      if (gi !== undefined) {
        this.master[gi * 3]     = live.x;
        this.master[gi * 3 + 1] = live.y;
        this.master[gi * 3 + 2] = live.z;

        if (this.selectedId !== null && String(this.selectedId) === String(satId)) {
          this._liveSelectedPos = live;
        }

        const sat = this.sats[gi];
        const data = this.catData[sat?.category || 'other'];
        if (data && data.points.visible) {
          const list = data.activeItems || data.items;
          const localIdx = list.findIndex(it => it.gi === gi);
          if (localIdx !== -1) {
            if (isHidden) {
              data.positions[localIdx * 3]     = 1e8;
              data.positions[localIdx * 3 + 1] = 1e8;
              data.positions[localIdx * 3 + 2] = 1e8;
              data.sizes[localIdx] = 0.0;
              data.selected[localIdx] = 0.0;
            } else {
              data.positions[localIdx * 3]     = live.x;
              data.positions[localIdx * 3 + 1] = live.y;
              data.positions[localIdx * 3 + 2] = live.z;
            }
            data.points.geometry.attributes.position.needsUpdate = true;
            if (data.points.geometry.attributes.aSize) {
              data.points.geometry.attributes.aSize.needsUpdate = true;
            }
          }
        }
      }
    });

    if (activeSatIds.size === 0) {
      this._liveSelectedPos = null;
    }

    // 2. If user changed time fast or timeScale is high (e.g. 10x, 60x, 3600x), propagate immediately
    if (this.workers.length > 0 && this._workersPending <= 0) {
      const simDelta = Math.abs(timeMs - (this._lastPropagatedSim || 0));
      // In fast-forward mode (>10x), trigger update whenever sim moves forward by >5 seconds
      if (simDelta > 5000) {
        this._tick();
      }
    }
  }

  destroy() {
    if (this.timer) clearInterval(this.timer);
    this.workers.forEach(w => w.terminate());
    Object.values(this.catData).forEach(({ points }) => {
      this.scene.remove(points);
      points.geometry.dispose();
      points.material.dispose();
    });
    this.labelPool.forEach(({ sprite }) => {
      this.scene.remove(sprite);
      sprite.material.map.dispose();
      sprite.material.dispose();
    });
  }
}

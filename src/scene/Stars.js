import * as THREE from 'three';
import { TextureLODManager } from './planets/TextureLODManager.js';
import { isMobileViewport } from '../utils/viewport.js';

// Skybox resolution tiers, coarsest → finest. Built from the NASA SVS "Deep Star Maps
// 2020" (SVS 4851) celestial master by tools/build_starmap.py; every tier shares one
// tone curve and polar mask, so a tier swap changes resolution only, never tone.
//
// Only the instant-paint base and the finest target are listed: the LOD promotes straight
// to the finest decoded tier, so an intermediate tier would stay resident without ever
// being shown.
const SKYBOX_BASE = { url: '/starmap_2020_2k.webp', distance: Infinity };
const SKYBOX_HIRES = { url: '/starmap_2020_8k.webp', distance: Infinity };

export class Stars {
  constructor(scene, renderer = null) {
    this.scene = scene;
    this.renderer = renderer;

    // The celestial sphere is locked to the camera every frame, so camera proximity is
    // meaningless: every tier activates at Infinity and the LOD simply settles on the
    // finest tier that has decoded. Phones fetch only the light 2K tier — the 4K/8K
    // masters are desktop-only. `preload` decodes and uploads the tiers behind the boot
    // gate (as Earth/Moon do), so no tier ever lands as a hitch on the first visible frame.
    const mobile = isMobileViewport();
    const levels = mobile ? [SKYBOX_BASE] : [SKYBOX_BASE, SKYBOX_HIRES];

    this.textureLod = new TextureLODManager(renderer);
    this._lod = this.textureLod.create(levels, { preload: true, evict: Infinity });

    // NASA SVS "Deep Star Maps 2020" (SVS 4851) celestial sphere, painted at constant infinity.
    // Credit: NASA/GSFC Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC.
    const geo = new THREE.SphereGeometry(5000, 64, 64);
    const mat = new THREE.MeshBasicMaterial({
      map:         this._lod.texture,
      side:        THREE.BackSide,
      depthTest:   false,
      depthWrite:  false,
      transparent: false,
      color:       new THREE.Color(1, 1, 1),
    });

    this.mesh = new THREE.Mesh(geo, mat);
    // Align celestial sphere with astronomical equatorial coordinates (vernal equinox)
    this.mesh.rotation.y = -Math.PI / 2;
    this.mesh.renderOrder = -100;

    // Lock celestial sphere center strictly to the camera every single frame right at render time,
    // completely eliminating any 1-frame lag, camera shaking, or parallax jitter at extreme distances.
    this.mesh.onBeforeRender = (_renderer, _scene, camera) => {
      if (camera) {
        this.mesh.position.copy(camera.position);
        this.mesh.updateMatrixWorld(true);
      }
    };

    this.scene.add(this.mesh);
  }

  update(camera) {
    // Promote to the finest decoded tier. Both tiers are non-null textures, so the swap
    // is a reference change to the material's map and never triggers a shader recompile.
    this._lod.update(0);
    if (this.mesh && this.mesh.material.map !== this._lod.texture) {
      this.mesh.material.map = this._lod.texture;
      this.mesh.material.needsUpdate = true;
    }

    if (this.mesh && camera) {
      this.mesh.position.copy(camera.position);
      this.mesh.updateMatrixWorld(true);
    }
  }

  setVisibility(visible) {
    if (this.mesh) this.mesh.visible = visible;
  }

  setBrightness(val) {
    if (this.mesh?.material) {
      const b = Math.max(0, val);
      this.mesh.material.color.setRGB(b, b, b);
    }
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      // The map is owned (and disposed) by the LOD manager; only the material is ours here.
      this.mesh.material.dispose();
      this.mesh = null;
    }
    this.textureLod?.dispose();
  }
}

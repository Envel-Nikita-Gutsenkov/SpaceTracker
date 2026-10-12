import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// These NASA Science GLBs use kilometre-like source coordinates: their measured
// bounds closely match the published Phobos/Deimos triaxial dimensions. The
// rotations align each model's long, middle and polar axes to the app's body
// frame (+X, +Z and +Y respectively).
export const SMALL_BODY_SHAPE_MODELS = Object.freeze({
  phobos: Object.freeze({
    url: '/models/phobos.glb',
    axisRotation: Object.freeze([0, Math.PI / 2, 0]),
    credit: 'NASA/JPL-Caltech',
  }),
  deimos: Object.freeze({
    url: '/models/deimos.glb',
    axisRotation: Object.freeze([-Math.PI / 2, 0, 0]),
    credit: 'NASA/JPL-Caltech',
  }),
});

function disposeObject3D(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  root.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of nodeMaterials) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
    }
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

export class SmallBodyShapeModels {
  constructor({ loader = new GLTFLoader(), logger = console } = {}) {
    this.loader = loader;
    this.logger = logger;
  }

  setBodyEnabled(bodyId, body, enabled) {
    const model = SMALL_BODY_SHAPE_MODELS[bodyId];
    if (!model || !body?.bodyMesh || !body?.bodyPivot) return false;

    body.shapeModelEnabled = Boolean(enabled);
    if (!body.shapeModelEnabled) {
      if (body.realisticShapeRoot) body.realisticShapeRoot.visible = false;
      body.bodyMesh.visible = true;
      return true;
    }

    if (body.realisticShapeRoot) {
      body.realisticShapeRoot.rotation.copy(body.bodyMesh.rotation);
      body.realisticShapeRoot.visible = true;
      body.bodyMesh.visible = false;
      return true;
    }

    body.bodyMesh.visible = true;
    if (body.shapeModelError || body.shapeModelDisposed) return false;

    if (!body.shapeModelPromise) {
      let loadedScene = null;
      body.shapeModelPromise = this.loader.loadAsync(model.url).then((gltf) => {
        loadedScene = gltf?.scene;
        if (!loadedScene) throw new Error(`3D model has no default scene (${bodyId})`);
        if (body.shapeModelDisposed) {
          disposeObject3D(loadedScene);
          loadedScene = null;
          return null;
        }

        loadedScene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(loadedScene);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        if (
          bounds.isEmpty() ||
          ![center.x, center.y, center.z, size.x, size.y, size.z].every(Number.isFinite) ||
          Math.min(size.x, size.y, size.z) <= 0
        ) {
          throw new Error(`3D model has invalid bounds (${bodyId})`);
        }

        const radiusKm = body.data?.radiusKm;
        const radiusUnits = body.radiusUnits;
        if (!(Number.isFinite(radiusKm) && radiusKm > 0 && Number.isFinite(radiusUnits) && radiusUnits > 0)) {
          throw new Error(`3D model body has invalid radius (${bodyId})`);
        }

        // Recentre the mesh at the ephemeris position, then convert source km to
        // the scene's Earth-radius units without distorting the measured shape.
        loadedScene.position.sub(center);
        const axisFrame = new THREE.Group();
        axisFrame.name = `shape_axes_${bodyId}`;
        axisFrame.rotation.set(...model.axisRotation);
        axisFrame.add(loadedScene);

        const spinRoot = new THREE.Group();
        spinRoot.name = `realistic_shape_${bodyId}`;
        spinRoot.scale.setScalar(radiusUnits / radiusKm);
        spinRoot.rotation.copy(body.bodyMesh.rotation);
        spinRoot.add(axisFrame);
        spinRoot.traverse((node) => {
          if (!node.isMesh) return;
          node.castShadow = true;
          node.receiveShadow = true;
        });

        body.bodyPivot.add(spinRoot);
        body.realisticShapeRoot = spinRoot;
        spinRoot.visible = Boolean(body.shapeModelEnabled);
        body.bodyMesh.visible = !body.shapeModelEnabled;
        loadedScene = null;
        return spinRoot;
      }).catch((error) => {
        if (loadedScene) disposeObject3D(loadedScene);
        body.shapeModelError = error;
        body.bodyMesh.visible = true;
        if (!body.shapeModelDisposed) {
          this.logger.warn?.(`Could not load NASA ${bodyId} shape model; using the existing body shape.`, error);
        }
        return null;
      });
    }

    return true;
  }

  disposeBody(body) {
    if (!body) return;
    body.shapeModelDisposed = true;
    body.shapeModelEnabled = false;
    body.bodyMesh.visible = true;
    if (!body.realisticShapeRoot) return;

    body.realisticShapeRoot.parent?.remove(body.realisticShapeRoot);
    disposeObject3D(body.realisticShapeRoot);
    body.realisticShapeRoot = null;
  }
}

import * as THREE from 'three';

// Procedural mesh for the planet-orbiter fleet (Mars/Jupiter/... artificial satellites),
// which — like the solar/lunar fleet in Sun.js/Moon.js — is drawn with a compact
// procedural bus so it reads as a spacecraft up-close while staying cheap.
//
// The interstellar probes no longer use this factory: they render the real NASA GLBs
// registered in spacecraftModels.js through the shared close-up pass. The mesh contract
// here stays `{ group, ringMesh, beaconMesh }`.

const BUS_GOLD = 0xd4af37;
const PANEL_BLUE = 0x1d4ed8;

function panel(width, height, depth = 0.004) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color: PANEL_BLUE, metalness: 0.6, roughness: 0.25 }),
  );
}

// Compact orbiter bus: central body, two deployed solar-array wings, a high-gain dish.
export function createOrbiterMesh(sat) {
  const group = new THREE.Group();

  const bus = new THREE.Mesh(
    new THREE.BoxGeometry(0.005, 0.005, 0.007),
    new THREE.MeshStandardMaterial({ color: BUS_GOLD, metalness: 0.85, roughness: 0.3 }),
  );
  group.add(bus);

  const left = panel(0.012, 0.005);
  left.position.set(-0.009, 0, 0);
  group.add(left);

  const right = panel(0.012, 0.005);
  right.position.set(0.009, 0, 0);
  group.add(right);

  const dish = new THREE.Mesh(
    new THREE.ConeGeometry(0.0035, 0.002, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }),
  );
  dish.rotation.x = -Math.PI / 2;
  dish.position.set(0, 0, 0.005);
  group.add(dish);

  return decorate(group, sat);
}


// Colour beacon (distance-scaled by the renderer) + selection ring shared by both shapes.
function decorate(group, sat) {
  const color = sat.color ?? 0x38bdf8;

  const beaconMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.0035, 8, 8),
    new THREE.MeshBasicMaterial({ color }),
  );
  group.add(beaconMesh);

  const ringMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.01, 0.012, 28),
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    }),
  );
  ringMesh.visible = false;
  group.add(ringMesh);

  return { group, ringMesh, beaconMesh };
}

export function isPlanetCloseUp(distance, radiusUnits) {
  return Number.isFinite(distance) && Number.isFinite(radiusUnits) &&
    distance >= 0 && radiusUnits > 0 && distance < radiusUnits * 15.0;
}

// Close-up multiplier per body type. A planet is "zoomed into" once the camera sits
// within this many body radii. The Sun uses a smaller factor because its radius is
// enormous (109 Earth radii), so a 15x shell would swallow the whole inner system.
export const DEFAULT_CLOSE_UP_FACTOR = 15.0;
export const SUN_CLOSE_UP_FACTOR = 6.0;

function bodyCloseUpFactor(body) {
  if (Number.isFinite(body.closeUpFactor) && body.closeUpFactor > 0) return body.closeUpFactor;
  return DEFAULT_CLOSE_UP_FACTOR;
}

export function getZoomedPlanetId(cameraPosition, bodies) {
  if (!cameraPosition || !Array.isArray(bodies)) return null;

  let closestPlanet = null;
  let closestDistance = Infinity;

  for (const body of bodies) {
    if (!body.isPlanet || !body.pos || !(body.radiusUnits > 0)) continue;

    const dx = body.pos.x - cameraPosition.x;
    const dy = body.pos.y - cameraPosition.y;
    const dz = body.pos.z - cameraPosition.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < closestDistance) {
      closestPlanet = body;
      closestDistance = distance;
    }
  }

  return closestPlanet && isPlanetCloseUp(closestDistance, closestPlanet.radiusUnits)
    ? closestPlanet.id
    : null;
}

// Which celestial body (Earth, Moon, Sun or any planet) the camera is currently
// inspecting up-close. When a body is returned, every *other* body's label is
// suppressed so distant planets never bleed their names over the body in view.
export function getZoomedBodyId(cameraPosition, bodies) {
  if (!cameraPosition || !Array.isArray(bodies)) return null;

  let closestBody = null;
  let closestDistance = Infinity;

  for (const body of bodies) {
    if (!body.pos || !(body.radiusUnits > 0)) continue;

    const dx = body.pos.x - cameraPosition.x;
    const dy = body.pos.y - cameraPosition.y;
    const dz = body.pos.z - cameraPosition.z;
    const distance = Math.hypot(dx, dy, dz);

    if (distance < body.radiusUnits * bodyCloseUpFactor(body) && distance < closestDistance) {
      closestBody = body;
      closestDistance = distance;
    }
  }

  return closestBody ? closestBody.id : null;
}

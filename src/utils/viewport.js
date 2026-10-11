// Single source of truth for the mobile breakpoint, shared by the initial
// minimal-UI decision, the isMobile matchMedia listener and the skybox tier choice.
export const MOBILE_QUERY = '(max-width: 768px)';

/** Whether the viewport is currently phone-sized (false outside a browser). */
export function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches;
}

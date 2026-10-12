import { create } from 'zustand';
import { CATEGORIES } from '../utils/categories';

// Mega-constellations and massive crowds are OFF by default as requested
const OFF_BY_DEFAULT = new Set(['starlink', 'oneweb', 'satnogs', 'cubesat', 'megaconst']);
const DEFAULT_VISIBLE = new Set(
   CATEGORIES.map(c => c.id).filter(id => !OFF_BY_DEFAULT.has(id))
);

export const useSatStore = create((set) => ({
  allSatellites: [],
  visibleCategories: DEFAULT_VISIBLE,
  searchQuery: '',
  selectedSat: null,
  simTime: Date.now(),
  timeScale: 1,
  fps: 60,
  satelliteCount: 0,
  activeBody: 'earth', // 'earth' | 'moon' (ready for 'mars', etc.)

  // Display options
  showLabels: false,
  showSelectedOrbit: true,
  showAllOrbits: false,
  showPlanetaryOrbits: true,
  showStars: true,
  starBrightness: 1.0,
  showAtmosphere: true,
  showSun: true,
  showMoon: true,
  showNightLights: true,
  showClouds: true,
  showVanAllen: false,
  showDwarfPlanets: true,  // IAU-designated dwarf planets (Ceres, Haumea, Makemake, Eris)
  showDwarfCandidates: true, // Probable/candidate dwarf planets (not IAU-ratified) — a separate
                             // category, so it gets its own toggle instead of riding the one above.
  showMoons: false,        // Natural satellites of other planets stay hidden until enabled
  showBodyPoints: false,   // Screen-space "there is something here" dots for planets + dwarfs (off by default)
  showMoonPoints: false,   // Separate point layer for every moon (off by default)
  showDeepSpaceProbes: false, // Interstellar probes (Voyager/Pioneer/New Horizons) markers stay hidden by default
  showGeographicLabels: false, // City / continent names on the Earth globe stay hidden by default
  showSat3DModel: true,
  satPointSize: 2.2,
  operatorFilter: 'all',
  orbitRegimeFilter: 'all',
  bodyFilter: 'all', // legacy 'all' | 'earth' | 'moon' | 'sun' | 'cislunar' | 'planetary' | 'deepspace'
  bodyFilters: new Set(['earth', 'moon', 'sun', 'cislunar', 'planetary', 'deepspace']),
  sidebarTab: 'domains', // 'domains' | 'categories' | 'display'

  // Camera input & responsive layout
  mouseSensitivity: 1.0, // multiplier over the base wheel-zoom speed (1.0 = shipped default)
  isMobile: false,       // true while the viewport is at or below the mobile breakpoint

  // Localization & Panel Visibility
  language: 'en', // 'en' (default) | 'ru'
  sidebarOpen: true,
  infoPanelOpen: true, // Collapsible right satellite details panel
  hudMetricsOpen: false, // Lean UI by default: extra metrics (FPS, RAM) are off by default

  setAllSatellites: (sats) => set({ allSatellites: sats, satelliteCount: sats.length }),
  setSatelliteCount: (n) => set({ satelliteCount: n }),
  setFps: (fps) => set({ fps }),
  setSimTime: (simTime) => set({ simTime }),
  setTimeScale: (timeScale) => set({ timeScale }),
  setSelectedSat: (sat) => set((state) => (
    state.isMobile && sat
      ? { selectedSat: sat, infoPanelOpen: false }
      : { selectedSat: sat }
  )),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setActiveBody: (activeBody) => set({ activeBody }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setMouseSensitivity: (mouseSensitivity) => set({ mouseSensitivity }),
  setIsMobile: (isMobile) => set({ isMobile }),
  setBodyFilters: (bodyFilters) => set({ bodyFilters }),
  toggleBodyFilter: (bodyId) => set((state) => {
    const next = new Set(state.bodyFilters);
    if (next.has(bodyId)) {
      next.delete(bodyId);
    } else {
      next.add(bodyId);
    }
    return {
      bodyFilters: next,
      bodyFilter: next.size === 6 ? 'all' : (next.size === 1 ? Array.from(next)[0] : 'custom')
    };
  }),
  setAllBodyFilters: (enabled) => set(() => {
    const next = enabled ? new Set(['earth', 'moon', 'sun', 'cislunar', 'planetary', 'deepspace']) : new Set();
    return {
      bodyFilters: next,
      bodyFilter: enabled ? 'all' : 'none'
    };
  }),
  setBodyFilter: (bodyFilter) => set(() => {
    let next;
    if (bodyFilter === 'all') next = new Set(['earth', 'moon', 'sun', 'cislunar', 'planetary', 'deepspace']);
    else if (bodyFilter === 'earth') next = new Set(['earth']);
    else if (bodyFilter === 'moon') next = new Set(['moon']);
    else if (bodyFilter === 'cislunar') next = new Set(['cislunar']);
    else if (bodyFilter === 'sun') next = new Set(['sun']);
    else if (bodyFilter === 'planetary') next = new Set(['planetary']);
    else if (bodyFilter === 'deepspace') next = new Set(['deepspace']);
    else next = new Set(['earth', 'moon', 'sun', 'cislunar', 'planetary', 'deepspace']);
    return { bodyFilter, bodyFilters: next };
  }),
  setLanguage: (language) => set({ language }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebarOpen: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setInfoPanelOpen: (infoPanelOpen) => set({ infoPanelOpen }),
  toggleInfoPanelOpen: () => set((state) => ({ infoPanelOpen: !state.infoPanelOpen })),
  setHudMetricsOpen: (hudMetricsOpen) => set({ hudMetricsOpen }),
  toggleHudMetricsOpen: () => set((state) => ({ hudMetricsOpen: !state.hudMetricsOpen })),

  // Display setters & toggles
  setShowLabels: (showLabels) => set({ showLabels }),
  toggleShowLabels: () => set((state) => ({ showLabels: !state.showLabels })),

  setShowSelectedOrbit: (v) => set({ showSelectedOrbit: v }),
  toggleShowSelectedOrbit: () => set((state) => ({ showSelectedOrbit: !state.showSelectedOrbit })),

  setShowAllOrbits: (v) => set({ showAllOrbits: v }),
  toggleShowAllOrbits: () => set((state) => ({ showAllOrbits: !state.showAllOrbits })),

  setShowPlanetaryOrbits: (v) => set({ showPlanetaryOrbits: v }),
  toggleShowPlanetaryOrbits: () => set((state) => ({ showPlanetaryOrbits: !state.showPlanetaryOrbits })),

  setShowStars: (v) => set({ showStars: v }),
  toggleShowStars: () => set((state) => ({ showStars: !state.showStars })),

  setStarBrightness: (starBrightness) => set({ starBrightness }),

  setShowAtmosphere: (v) => set({ showAtmosphere: v }),
  toggleShowAtmosphere: () => set((state) => ({ showAtmosphere: !state.showAtmosphere })),

  setShowSun: (v) => set({ showSun: v }),
  toggleShowSun: () => set((state) => ({ showSun: !state.showSun })),

  setShowMoon: (v) => set({ showMoon: v }),
  toggleShowMoon: () => set((state) => ({ showMoon: !state.showMoon })),

  setShowNightLights: (v) => set({ showNightLights: v }),
  toggleShowNightLights: () => set((state) => ({ showNightLights: !state.showNightLights })),

  setShowClouds: (v) => set({ showClouds: v }),
  toggleShowClouds: () => set((state) => ({ showClouds: !state.showClouds })),

  setShowVanAllen: (v) => set({ showVanAllen: v }),
  toggleShowVanAllen: () => set((state) => ({ showVanAllen: !state.showVanAllen })),

  setShowDwarfPlanets: (v) => set({ showDwarfPlanets: v }),
  toggleShowDwarfPlanets: () => set((state) => ({ showDwarfPlanets: !state.showDwarfPlanets })),

  setShowDwarfCandidates: (v) => set({ showDwarfCandidates: v }),
  toggleShowDwarfCandidates: () => set((state) => ({ showDwarfCandidates: !state.showDwarfCandidates })),

  setShowMoons: (v) => set({ showMoons: v }),
  toggleShowMoons: () => set((state) => ({ showMoons: !state.showMoons })),

  setShowBodyPoints: (v) => set({ showBodyPoints: v }),
  toggleShowBodyPoints: () => set((state) => ({ showBodyPoints: !state.showBodyPoints })),

  setShowMoonPoints: (v) => set({ showMoonPoints: v }),
  toggleShowMoonPoints: () => set((state) => ({ showMoonPoints: !state.showMoonPoints })),

  setShowDeepSpaceProbes: (v) => set({ showDeepSpaceProbes: v }),
  toggleShowDeepSpaceProbes: () => set((state) => ({ showDeepSpaceProbes: !state.showDeepSpaceProbes })),

  setShowGeographicLabels: (v) => set({ showGeographicLabels: v }),
  toggleShowGeographicLabels: () => set((state) => ({ showGeographicLabels: !state.showGeographicLabels })),

  setShowSat3DModel: (v) => set({ showSat3DModel: v }),
  toggleShowSat3DModel: () => set((state) => ({ showSat3DModel: !state.showSat3DModel })),

  setSatPointSize: (satPointSize) => set({ satPointSize }),
  setOperatorFilter: (operatorFilter) => set({ operatorFilter }),
  setOrbitRegimeFilter: (orbitRegimeFilter) => set({ orbitRegimeFilter }),

  toggleCategory: (id) => set((state) => {
    const next = new Set(state.visibleCategories);
    if (next.has(id)) next.delete(id); else next.add(id);
    return { visibleCategories: next };
  }),

  showAllCategories: () => set({ visibleCategories: new Set(CATEGORIES.map(c => c.id)) }),
  hideAllCategories: () => set({ visibleCategories: new Set() }),
}));

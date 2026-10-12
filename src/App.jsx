import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SceneManager } from './scene/SceneManager';
import { DataService }  from './services/DataService';
import { CloudService } from './services/CloudService';
import { useSatStore }  from './store/useSatStore';
import Sidebar          from './components/Sidebar';
import InfoPanel        from './components/InfoPanel';
import HUD              from './components/HUD';
import SearchBar        from './components/SearchBar';
import PlanetBar        from './components/PlanetBar';
import CelestialLabels  from './components/CelestialLabels';
import GeographyLabels  from './components/GeographyLabels';
import { SOLAR_SATS, LUNAR_SATS } from './utils/celestialFleet';
import { PLANETARY_ORBITERS } from './utils/planetaryFleet';
import { DEEP_SPACE_PROBES } from './utils/deepSpaceProbes';
import { MOBILE_QUERY } from './utils/viewport';

// Merge the curated celestial fleet (solar probes, lunar orbiters, other-planet orbiters and the
// interstellar/escape probes) into the catalogued satellites. These curated objects carry a
// bespoke ephemeris, so they win over a TLE object that happens to reuse the same NORAD id
// (ids get recycled upstream).
function mergeCelestial(satellites) {
  const combined = [...satellites];
  const indexById = new Map(combined.map((s, i) => [s.id, i]));
  [...SOLAR_SATS, ...LUNAR_SATS, ...PLANETARY_ORBITERS, ...DEEP_SPACE_PROBES].forEach(sat => {
    const existing = indexById.get(sat.id);
    if (existing === undefined) {
      indexById.set(sat.id, combined.length);
      combined.push(sat);
    } else {
      console.warn(
        `Celestial fleet id ${sat.id} (${sat.name}) overrides catalogued "${combined[existing].name}"`
      );
      combined[existing] = sat;
    }
  });
  return combined;
}

// Minimalist mode toggle button (always visible)
function MinimalistToggle({ minimalist, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={minimalist ? 'Show UI' : 'Minimal mode'}
      style={{
        position: 'fixed', bottom: '1.25rem', right: '1.25rem',
        zIndex: 300,
        width: 38, height: 38,
        borderRadius: '50%',
        background: 'rgba(4,12,24,0.7)',
        border: '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(12px)',
        color: minimalist ? 'var(--accent)' : 'rgba(255,255,255,0.45)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1rem',
        transition: 'color 0.2s, border-color 0.2s',
      }}
    >
      {minimalist ? '⊞' : '⊟'}
    </button>
  );
}

export default function App() {
  const canvasRef  = useRef(null);
  const sceneRef   = useRef(null);
  const [loading, setLoading] = useState({ active: true, progress: 0, message: 'Initializing…' });
  const [error,   setError]   = useState(null);
  // On phones the scene is the point of the app, so start in Minimal Mode: the whole
  // chrome stays folded away behind the ⊞ toggle and never competes with the view.
  // Desktop is untouched and keeps the full UI on by default.
  const [minimalist, setMinimalist] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
  );

  const {
    visibleCategories, searchQuery,
    selectedSat,
    operatorFilter, orbitRegimeFilter, bodyFilter, bodyFilters,
  } = useSatStore(useShallow((s) => ({
    visibleCategories: s.visibleCategories,
    searchQuery:       s.searchQuery,
    selectedSat:       s.selectedSat,
    operatorFilter:    s.operatorFilter,
    orbitRegimeFilter: s.orbitRegimeFilter,
    bodyFilter:        s.bodyFilter,
    bodyFilters:       s.bodyFilters,
  })));

  const isMobile       = useSatStore((s) => s.isMobile);
  const sidebarOpen    = useSatStore((s) => s.sidebarOpen);
  const setSidebarOpen = useSatStore((s) => s.setSidebarOpen);

  // Init Three.js scene once
  useEffect(() => {
    const canvas = canvasRef.current;
    const scene  = new SceneManager(canvas);
    sceneRef.current = scene;
    scene.init();

    // Stream the near-real-time cloud map (EUMETSAT via clouds.matteason.co.uk) in the
    // background. Fail-safe: on any problem the bundled static cloud map stays bound.
    CloudService.resolveCloudTiers()
      .then(tiers => { if (tiers) sceneRef.current?.setLiveClouds(tiers); })
      .catch(() => {});

    setLoading({ active: true, progress: 5, message: 'Fetching satellite data…' });

    DataService.loadAll(
      (progress, message) => {
        // Reserve the last stretch of the bar for the boot-time texture decode + GPU upload.
        setLoading({ active: true, progress: Math.round(progress * 0.85), message });
      },
      // Background refresh: a fresher catalogue arrived while the app was already running on
      // cached data. Update the searchable list so the sidebar and search see the new objects;
      // the 3D layer keeps its boot-time TLEs until the next reload (rebuilding it mid-session
      // would re-create every propagator worker and marker for a negligible position change).
      (fresh) => {
        useSatStore.getState().setAllSatellites(mergeCelestial(fresh));
      }
    )
      .then(async satellites => {
        useSatStore.getState().setAllSatellites(mergeCelestial(satellites));
        scene.loadSatellites(satellites);

        // Keep the overlay up while the heavy first-paint textures (8K Earth/Moon/Pluto maps,
        // 4K planet maps, the star map) decode and upload, so they never land as a multi-second
        // stutter the moment the scene becomes visible. Poll so the bar still advances.
        setLoading({ active: true, progress: 85, message: 'Preparing textures…' });
        const poll = setInterval(() => {
          const p = sceneRef.current?.textureProgress ?? 0;
          setLoading({ active: true, progress: 85 + Math.round(p * 14), message: 'Preparing textures…' });
        }, 150);
        try {
          await scene.whenTexturesReady();
        } finally {
          clearInterval(poll);
        }

        setLoading({ active: false, progress: 100, message: 'Ready' });
      })
      .catch(err => {
        console.error('Data load failed:', err);
        setError(err.message || 'Failed to load satellite data');
        setLoading({ active: false, progress: 0, message: '' });
      });

    // Reset activeBody to 'earth' on startup to prevent stale UI desync with camera
    useSatStore.getState().setActiveBody('earth');

    return () => scene.destroy();
  }, []);

  // Responsive layout: track the mobile breakpoint and start with the sidebar collapsed
  // on small screens, so it never covers the planet selector or the search bar.
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const apply = () => {
      const mobile = mq.matches;
      const store = useSatStore.getState();
      store.setIsMobile(mobile);
      if (mobile) store.setSidebarOpen(false);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);


  // Sync filters to scene
  useEffect(() => {
    sceneRef.current?.setFilters(visibleCategories, searchQuery, operatorFilter, orbitRegimeFilter, bodyFilters || bodyFilter);
  }, [visibleCategories, searchQuery, operatorFilter, orbitRegimeFilter, bodyFilter, bodyFilters]);

  // Canvas click → pick satellite (differentiate click from drag)
  const pointerStart = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleFocus = useCallback((sat) => {
    if (sat?.isPlanet) {
      sceneRef.current?.focusPlanet(sat.id);
    } else {
      sceneRef.current?.focusSat(sat);
    }
  }, []);

  const handlePointerUp = useCallback((e) => {
    const dx = Math.abs(e.clientX - pointerStart.current.x);
    const dy = Math.abs(e.clientY - pointerStart.current.y);
    // If user dragged more than 12px, it's orbit camera rotation, not a click
    if (dx > 12 || dy > 12) return;

    if (!sceneRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const ndcX =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    const ndcY = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    const sat  = sceneRef.current.pick(ndcX, ndcY);
    if (sat) {
      useSatStore.getState().setSelectedSat(sat);
      handleFocus(sat);
    }
  }, [handleFocus]);

  const handleFocusPlanet = useCallback((planetId) => {
    sceneRef.current?.focusPlanet(planetId);
  }, []);

  const handleFocusMoon = useCallback(() => {
    sceneRef.current?.focusMoon();
  }, []);

  const handleFocusEarth = useCallback(() => {
    sceneRef.current?.focusEarth();
  }, []);

  const handleFocusSun = useCallback(() => {
    sceneRef.current?.focusSun();
  }, []);

  const toggleMinimalist = () => setMinimalist(p => !p);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      {/* 3D canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'pointer' }}
      />

      {/* Loading screen */}
      {loading.active && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="loading-title">SPACE TRACKER</div>
            <div className="loading-subtitle">Real-Time 3D Solar System &amp; Satellite Visualization</div>
            <div className="loading-creator">Created by Nikita Gutsenkov</div>
            <div className="loading-message">{loading.message}</div>
            <div className="loading-bar">
              <div className="loading-fill" style={{ width: `${loading.progress}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Error screen */}
      {error && (
        <div className="error-overlay">
          <div className="error-content">
            <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>⚠️</div>
            <div style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Data Load Failed</div>
            <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', marginBottom: '1rem' }}>
              {error}
            </div>
            <button onClick={() => window.location.reload()}>↺ Retry</button>
          </div>
        </div>
      )}

      {/* UI — only when loaded */}
      {!loading.active && !error && (
        <>
          {isMobile && sidebarOpen && (
            <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
          )}

          <Sidebar
            minimalist={minimalist}
            onToggleMinimalist={toggleMinimalist}
            onFocusMoon={handleFocusMoon}
            onFocusEarth={handleFocusEarth}
            onFocusSun={handleFocusSun}
          />

          <PlanetBar
            minimalist={minimalist}
            onSelectBody={(bodyId) => {
              if (bodyId === 'moon') handleFocusMoon();
              else if (bodyId === 'sun') handleFocusSun();
              else if (bodyId === 'earth') handleFocusEarth();
              else handleFocusPlanet(bodyId);
            }}
          />

          <CelestialLabels
            sceneRef={sceneRef}
            onFocusEarth={handleFocusEarth}
            onFocusMoon={handleFocusMoon}
            onFocusSun={handleFocusSun}
            onFocusPlanet={handleFocusPlanet}
          />

          <GeographyLabels sceneRef={sceneRef} />

          <SearchBar minimalist={minimalist} onFocus={handleFocus} />

          <HUD minimalist={minimalist} />

          {selectedSat && (
            <InfoPanel onFocus={handleFocus} />
          )}

          <MinimalistToggle minimalist={minimalist} onToggle={toggleMinimalist} />
        </>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSatStore } from '../store/useSatStore';
import { CATEGORIES } from '../utils/categories';
import { getTranslation } from '../utils/i18n';
import { PLANETARY_ORBITERS } from '../utils/planetaryFleet';
import { DEEP_SPACE_PROBES } from '../utils/deepSpaceProbes';

const TIME_SCALES = [
  { label: '1×',    value: 1      },
  { label: '10×',   value: 10     },
  { label: '60×',   value: 60     },
  { label: '600×',  value: 600    },
  { label: '3600×', value: 3600   },
];

function Toggle({ on, onChange }) {
  return (
    <button
      className={`cat-toggle ${on ? 'on' : 'off'}`}
      onClick={e => { e.stopPropagation(); onChange(!on); }}
      title={on ? 'Hide' : 'Show'}
    >
      <div className="cat-toggle-thumb" />
    </button>
  );
}

function CategoryRow({ cat, label, count, visible, onToggle }) {
  return (
    <div className="cat-item" onClick={() => onToggle(cat.id)}>
      <span className="cat-dot" style={{ background: cat.color, boxShadow: `0 0 6px ${cat.color}88` }} />
      <span className="cat-name">{label}</span>
      <span className="cat-count">{count.toLocaleString()}</span>
      <Toggle on={visible} onChange={() => onToggle(cat.id)} />
    </div>
  );
}

// Isolated clock so the heavy Sidebar tree does not re-render as the sim time ticks.
function UtcClock() {
  const simTime = useSatStore((s) => s.simTime);
  return <>{new Date(simTime).toUTCString().replace('GMT', 'UTC')}</>;
}

export default function Sidebar({ minimalist, onToggleMinimalist, onFocusMoon, onFocusEarth, onFocusSun }) {
  const {
    language, setLanguage,
    sidebarOpen, toggleSidebarOpen,
    allSatellites, visibleCategories, toggleCategory,
    timeScale, setTimeScale,
    showAllCategories, hideAllCategories, satelliteCount,
    showLabels, toggleShowLabels,
    showSelectedOrbit, toggleShowSelectedOrbit,
    showAllOrbits, toggleShowAllOrbits,
    showPlanetaryOrbits, toggleShowPlanetaryOrbits,
    showStars, toggleShowStars,
    starBrightness, setStarBrightness,
    showAtmosphere, toggleShowAtmosphere,
    showSun, toggleShowSun,
    showMoon, toggleShowMoon,
    showNightLights, toggleShowNightLights,
    showClouds, toggleShowClouds,
    showVanAllen, toggleShowVanAllen,
    showDwarfPlanets, toggleShowDwarfPlanets,
    showDwarfCandidates, toggleShowDwarfCandidates,
    showMoons, toggleShowMoons,
    showRealisticShapeModels, toggleShowRealisticShapeModels,
    showBodyPoints, toggleShowBodyPoints,
    showMoonPoints, toggleShowMoonPoints,
    showPlanetaryOrbiterRings, toggleShowPlanetaryOrbiterRings,
    showDeepSpaceProbes, toggleShowDeepSpaceProbes,
    showGeographicLabels, toggleShowGeographicLabels,
    showSat3DModel, toggleShowSat3DModel,
    satPointSize, setSatPointSize,
    mouseSensitivity, setMouseSensitivity,
    bodyFilter, setBodyFilter,
    bodyFilters, toggleBodyFilter, setAllBodyFilters,
    sidebarTab, setSidebarTab,
  } = useSatStore(useShallow((s) => ({
    language: s.language, setLanguage: s.setLanguage,
    sidebarOpen: s.sidebarOpen, toggleSidebarOpen: s.toggleSidebarOpen,
    allSatellites: s.allSatellites, visibleCategories: s.visibleCategories, toggleCategory: s.toggleCategory,
    timeScale: s.timeScale, setTimeScale: s.setTimeScale,
    showAllCategories: s.showAllCategories, hideAllCategories: s.hideAllCategories, satelliteCount: s.satelliteCount,
    showLabels: s.showLabels, toggleShowLabels: s.toggleShowLabels,
    showSelectedOrbit: s.showSelectedOrbit, toggleShowSelectedOrbit: s.toggleShowSelectedOrbit,
    showAllOrbits: s.showAllOrbits, toggleShowAllOrbits: s.toggleShowAllOrbits,
    showPlanetaryOrbits: s.showPlanetaryOrbits, toggleShowPlanetaryOrbits: s.toggleShowPlanetaryOrbits,
    showStars: s.showStars, toggleShowStars: s.toggleShowStars,
    starBrightness: s.starBrightness, setStarBrightness: s.setStarBrightness,
    showAtmosphere: s.showAtmosphere, toggleShowAtmosphere: s.toggleShowAtmosphere,
    showSun: s.showSun, toggleShowSun: s.toggleShowSun,
    showMoon: s.showMoon, toggleShowMoon: s.toggleShowMoon,
    showNightLights: s.showNightLights, toggleShowNightLights: s.toggleShowNightLights,
    showClouds: s.showClouds, toggleShowClouds: s.toggleShowClouds,
    showVanAllen: s.showVanAllen, toggleShowVanAllen: s.toggleShowVanAllen,
    showDwarfPlanets: s.showDwarfPlanets, toggleShowDwarfPlanets: s.toggleShowDwarfPlanets,
    showDwarfCandidates: s.showDwarfCandidates, toggleShowDwarfCandidates: s.toggleShowDwarfCandidates,
    showMoons: s.showMoons, toggleShowMoons: s.toggleShowMoons,
    showRealisticShapeModels: s.showRealisticShapeModels, toggleShowRealisticShapeModels: s.toggleShowRealisticShapeModels,
    showBodyPoints: s.showBodyPoints, toggleShowBodyPoints: s.toggleShowBodyPoints,
    showMoonPoints: s.showMoonPoints, toggleShowMoonPoints: s.toggleShowMoonPoints,
    showPlanetaryOrbiterRings: s.showPlanetaryOrbiterRings, toggleShowPlanetaryOrbiterRings: s.toggleShowPlanetaryOrbiterRings,
    showDeepSpaceProbes: s.showDeepSpaceProbes, toggleShowDeepSpaceProbes: s.toggleShowDeepSpaceProbes,
    showGeographicLabels: s.showGeographicLabels, toggleShowGeographicLabels: s.toggleShowGeographicLabels,
    showSat3DModel: s.showSat3DModel, toggleShowSat3DModel: s.toggleShowSat3DModel,
    satPointSize: s.satPointSize, setSatPointSize: s.setSatPointSize,
    mouseSensitivity: s.mouseSensitivity, setMouseSensitivity: s.setMouseSensitivity,
    bodyFilter: s.bodyFilter, setBodyFilter: s.setBodyFilter,
    bodyFilters: s.bodyFilters, toggleBodyFilter: s.toggleBodyFilter, setAllBodyFilters: s.setAllBodyFilters,
    sidebarTab: s.sidebarTab, setSidebarTab: s.setSidebarTab,
  })));

  const isMobile = useSatStore((s) => s.isMobile);

  const [expanded, setExpanded] = useState({ categories: true, time: false, display: true, legal: false });
  const [catSearch, setCatSearch] = useState('');

  const t = (key, fallback) => getTranslation(language, key, fallback);

  // Count per category
  const counts = {};
  CATEGORIES.forEach(c => { counts[c.id] = 0; });
  allSatellites.forEach(s => { counts[s.category] = (counts[s.category] || 0) + 1; });

  const filteredCategories = CATEGORIES.filter(c => {
    const localizedName = t(`cat_${c.id}`, c.name);
    return localizedName.toLowerCase().includes(catSearch.toLowerCase()) ||
      c.name.toLowerCase().includes(catSearch.toLowerCase()) ||
      c.id.toLowerCase().includes(catSearch.toLowerCase());
  });

  const earthCount = allSatellites.filter(s => !s.isSolar && !s.isLunar && (s.apogeeKm || 0) <= 60000 && !s.isCislunar).length;
  const cislunarCount = allSatellites.filter(s => (s.apogeeKm || 0) > 60000 || s.isCislunar).length;
  const moonCount = 4;
  const sunCount = 5;
  const planetaryCount = PLANETARY_ORBITERS.length;
  const deepSpaceCount = DEEP_SPACE_PROBES.length;

  const DOMAINS = [
    {
      id: 'earth',
      title: t('domain_earth', 'Earth Orbit'),
      desc: t('domain_earth_desc', 'LEO, MEO, GEO satellites (fades beyond Moon orbit)'),
      count: earthCount,
      focusFn: onFocusEarth,
    },
    {
      id: 'moon',
      title: t('domain_moon', 'Lunar Fleet'),
      desc: t('domain_moon_desc', 'Orbiters around the Moon (LRO, Chandrayaan-2, Danuri, CAPSTONE)'),
      count: moonCount,
      focusFn: onFocusMoon,
    },
    {
      id: 'sun',
      title: t('domain_sun', 'Heliophysics Fleet'),
      desc: t('domain_sun_desc', 'Solar probes: Parker Solar Probe, Solar Orbiter, SOHO, STEREO, Aditya-L1'),
      count: sunCount,
      focusFn: onFocusSun,
    },
    {
      id: 'cislunar',
      title: t('domain_cislunar', 'Cislunar & Lagrange'),
      desc: t('domain_cislunar_desc', 'High-apogee orbits (>60,000 km) and Sun-Earth L1/L2 orbits'),
      count: cislunarCount,
      focusFn: null,
    },
    {
      id: 'planetary',
      title: t('domain_planetary', 'Planetary Orbiters'),
      desc: t('domain_planetary_desc', 'Artificial satellites around Mars, Jupiter, Venus & Mercury (real mission data)'),
      count: planetaryCount,
      focusFn: null,
    },
    {
      id: 'deepspace',
      title: t('domain_deepspace', 'Interstellar Probes'),
      desc: t('domain_deepspace_desc', 'Voyager 1-2, Pioneer 10-11 & New Horizons on hyperbolic escape trajectories'),
      count: deepSpaceCount,
      focusFn: null,
    },
  ];

  const resetTime = () => {
    setTimeScale(1);
    useSatStore.getState().setSimTime(Date.now());
  };

  const toggleSection = (key) =>
    setExpanded(p => ({ ...p, [key]: !p[key] }));

  if (minimalist) return null;

  if (!sidebarOpen) {
    return (
      <button
        onClick={toggleSidebarOpen}
        title={t('sidebar_expand', 'Show Sidebar')}
        style={{
          position: 'fixed',
          top: '1rem',
          left: '1rem',
          zIndex: 250,
          background: 'rgba(0, 10, 20, 0.82)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: '10px',
          color: '#fff',
          padding: isMobile ? '0 0.6rem' : '0 0.8rem',
          height: '36px',
          boxSizing: 'border-box',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          fontFamily: "'Space Mono', monospace",
          fontSize: '0.78rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
          transition: 'all 0.15s ease',
        }}
      >
        <span style={{ fontSize: '0.9rem' }}>◨</span>
        {!isMobile && <span style={{ fontWeight: 600 }}>{t('app_title', 'Space Tracker')}</span>}
      </button>
    );
  }

  return (
    <aside className="sidebar">
      {/* Header with Title, Language Toggle and Sidebar Collapse */}
      <div style={{ padding: '0.25rem 0.25rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="sidebar-header">{t('app_title', 'Space Tracker')}</div>
          <div className="sidebar-count">
            {satelliteCount.toLocaleString()} {t('satellites_tracked', 'satellites tracked')}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {/* Language Selector */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', padding: '2px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <button
              onClick={() => setLanguage('en')}
              style={{
                background: language === 'en' ? 'var(--accent)' : 'transparent',
                color: language === 'en' ? '#000' : 'rgba(255,255,255,0.6)',
                fontWeight: language === 'en' ? 700 : 400,
                border: 'none',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '0.65rem',
                cursor: 'pointer',
              }}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('ru')}
              style={{
                background: language === 'ru' ? 'var(--accent)' : 'transparent',
                color: language === 'ru' ? '#000' : 'rgba(255,255,255,0.6)',
                fontWeight: language === 'ru' ? 700 : 400,
                border: 'none',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '0.65rem',
                cursor: 'pointer',
              }}
            >
              RU
            </button>
          </div>

          {/* Sidebar Collapse Button */}
          <button
            onClick={toggleSidebarOpen}
            title={t('sidebar_collapse', 'Hide Sidebar')}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              color: 'rgba(255,255,255,0.7)',
              padding: '2px 7px',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            ◧
          </button>
        </div>
      </div>

      {/* Clean Segmented Navigation Tabs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '2px',
        background: 'rgba(255,255,255,0.04)',
        padding: '3px',
        borderRadius: '8px',
        marginBottom: '0.65rem',
        border: '1px solid rgba(255,255,255,0.08)',
        boxSizing: 'border-box',
        width: '100%',
      }}>
        <button
          onClick={() => setSidebarTab('domains')}
          style={{
            padding: '0.45rem 0.2rem',
            fontSize: '0.72rem',
            fontWeight: sidebarTab === 'domains' ? 600 : 400,
            letterSpacing: '0.04em',
            borderRadius: '6px',
            border: 'none',
            background: sidebarTab === 'domains' ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
            color: sidebarTab === 'domains' ? 'var(--accent)' : 'rgba(255,255,255,0.6)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            textAlign: 'center',
            textTransform: 'uppercase',
          }}
        >
          {t('tab_domains', 'Domains')}
        </button>
        <button
          onClick={() => setSidebarTab('categories')}
          style={{
            padding: '0.45rem 0.2rem',
            fontSize: '0.72rem',
            fontWeight: sidebarTab === 'categories' ? 600 : 400,
            letterSpacing: '0.04em',
            borderRadius: '6px',
            border: 'none',
            background: sidebarTab === 'categories' ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
            color: sidebarTab === 'categories' ? 'var(--accent)' : 'rgba(255,255,255,0.6)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            textAlign: 'center',
            textTransform: 'uppercase',
          }}
        >
          {t('tab_categories', 'Categories')}
        </button>
        <button
          onClick={() => setSidebarTab('display')}
          style={{
            padding: '0.45rem 0.2rem',
            fontSize: '0.72rem',
            fontWeight: sidebarTab === 'display' ? 600 : 400,
            letterSpacing: '0.04em',
            borderRadius: '6px',
            border: 'none',
            background: sidebarTab === 'display' ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
            color: sidebarTab === 'display' ? 'var(--accent)' : 'rgba(255,255,255,0.6)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            textAlign: 'center',
            textTransform: 'uppercase',
          }}
        >
          {t('tab_display', 'Display')}
        </button>
      </div>

      {/* 1. Celestial Domains Tab */}
      {sidebarTab === 'domains' && (
        <div className="panel glass" style={{ marginBottom: '0.6rem' }}>
          <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <span>{t('domain_filter', 'Celestial Domains')}</span>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                className="time-btn"
                style={{ padding: '2px 6px', fontSize: '0.65rem' }}
                onClick={() => setAllBodyFilters(true)}
              >
                {t('select_all', 'Select All')}
              </button>
              <button
                className="time-btn"
                style={{ padding: '2px 6px', fontSize: '0.65rem' }}
                onClick={() => setAllBodyFilters(false)}
              >
                {t('clear_all', 'Clear')}
              </button>
            </div>
          </div>

          <div style={{
            maxHeight: 'calc(100vh - 220px)',
            overflowY: 'auto',
            paddingRight: '0.2rem',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.15) transparent',
          }}>
            {DOMAINS.map(domain => {
              const isChecked = bodyFilters instanceof Set
                ? bodyFilters.has(domain.id)
                : (bodyFilter === 'all' || bodyFilter === domain.id);

              return (
                <div
                  key={domain.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.3rem',
                    background: isChecked ? 'rgba(0, 255, 136, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                    border: isChecked ? '1px solid rgba(0, 255, 136, 0.25)' : '1px solid rgba(255, 255, 255, 0.07)',
                    borderRadius: '8px',
                    padding: '0.55rem 0.65rem',
                    marginBottom: '0.5rem',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleBodyFilter(domain.id)}
                        style={{
                          width: '15px',
                          height: '15px',
                          accentColor: 'var(--accent)',
                          cursor: 'pointer',
                        }}
                      />
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: isChecked ? '#fff' : 'rgba(255,255,255,0.65)' }}>
                        {domain.title}
                      </span>
                    </label>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{
                        fontSize: '0.65rem',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: isChecked ? 'var(--accent)' : 'rgba(255, 255, 255, 0.45)',
                        fontFamily: "'Space Mono', monospace",
                      }}>
                        {domain.count.toLocaleString()}
                      </span>
                      {domain.focusFn && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            domain.focusFn();
                          }}
                          title={t('fly_to', 'Focus')}
                          style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '4px',
                            color: '#fff',
                            padding: '2px 5px',
                            fontSize: '0.65rem',
                            cursor: 'pointer',
                          }}
                        >
                          🎯
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: '0.66rem', color: 'rgba(255, 255, 255, 0.45)', paddingLeft: '1.45rem', lineHeight: '1.35' }}>
                    {domain.desc}
                  </div>
                </div>
              );
            })}

            {/* Distance Culling Info Badge */}

          </div>
        </div>
      )}

      {/* 2. Categories Tab */}
      {sidebarTab === 'categories' && (
        <div className="panel glass">
          <div
            className="panel-title"
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => toggleSection('categories')}
          >
            <span>{t('categories', 'Categories')} ({CATEGORIES.length})</span>
            <span style={{ opacity: 0.4, fontSize: '0.8rem' }}>{expanded.categories ? '▾' : '▸'}</span>
          </div>

          {expanded.categories && (
            <>
              {/* Category Search Input */}
              <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  placeholder={t('search_categories', 'Search categories…')}
                  value={catSearch}
                  onChange={e => setCatSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.35rem 1.6rem 0.35rem 0.55rem',
                    fontSize: '0.72rem',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    color: '#fff',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {catSearch && (
                  <button
                    onClick={() => setCatSearch('')}
                    style={{
                      position: 'absolute', right: '0.35rem', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                      cursor: 'pointer', fontSize: '0.8rem', padding: 0,
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem' }}>
                <button className="time-btn" style={{ flex: 1 }} onClick={showAllCategories}>{t('all', 'All')}</button>
                <button className="time-btn" style={{ flex: 1 }} onClick={hideAllCategories}>{t('none', 'None')}</button>
              </div>

              {/* Scrollable category list */}
              <div style={{
                maxHeight: 'calc(100vh - 280px)',
                overflowY: 'auto',
                paddingRight: '0.2rem',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(255,255,255,0.15) transparent',
              }}>
                {filteredCategories.map(cat => (
                  <CategoryRow
                    key={cat.id}
                    cat={cat}
                    label={t(`cat_${cat.id}`, cat.name)}
                    count={counts[cat.id] || 0}
                    visible={visibleCategories.has(cat.id)}
                    onToggle={toggleCategory}
                  />
                ))}
                {filteredCategories.length === 0 && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textAlign: 'center', padding: '0.5rem' }}>
                    {t('no_matching_categories', 'No matching categories')}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* 3. Display, Time & Legal Tab */}
      {sidebarTab === 'display' && (
        <div style={{
          maxHeight: 'calc(100vh - 200px)',
          overflowY: 'auto',
          paddingRight: '0.2rem',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.15) transparent',
        }}>
          {/* Display Options */}
          <div className="panel glass" style={{ marginBottom: '0.6rem' }}>
            <div
              className="panel-title"
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => toggleSection('display')}
            >
              <span>{t('display_settings', 'Display Settings')}</span>
              <span style={{ opacity: 0.4, fontSize: '0.8rem' }}>{expanded.display ? '▾' : '▸'}</span>
            </div>

            {expanded.display && (
              <div className="display-group">
                <div className="display-subhead">{t('overlays_orbits', 'Overlays & Orbits')}</div>

                {/* Labels toggle */}
                <div className="cat-item" onClick={toggleShowLabels}>
                  <span style={{ fontSize: '0.9rem' }}>🏷️</span>
                  <span className="cat-name">{t('satellite_labels', 'Satellite Labels')}</span>
                  <Toggle on={showLabels} onChange={toggleShowLabels} />
                </div>

                {/* Selected Satellite Orbit */}
                <div className="cat-item" onClick={toggleShowSelectedOrbit}>
                  <span style={{ fontSize: '0.9rem' }}>🛰️</span>
                  <span className="cat-name">{t('selected_orbit', 'Selected Orbit')}</span>
                  <Toggle on={showSelectedOrbit} onChange={toggleShowSelectedOrbit} />
                </div>

                {/* All Orbits Constellation Web */}
                <div className="cat-item" onClick={toggleShowAllOrbits}>
                  <span style={{ fontSize: '0.9rem' }}>🌐</span>
                  <span className="cat-name">{t('all_orbits_web', 'All Orbits Web')}</span>
                  <Toggle on={showAllOrbits} onChange={toggleShowAllOrbits} />
                </div>

                {/* Planetary & Lunar Orbits */}
                <div className="cat-item" onClick={toggleShowPlanetaryOrbits}>
                  <span className="cat-dot" style={{ background: '#f59e0b' }} />
                  <span className="cat-name">{t('planetary_orbits', 'Planetary & Lunar Orbits')}</span>
                  <Toggle on={showPlanetaryOrbits} onChange={toggleShowPlanetaryOrbits} />
                </div>

                {/* IAU-designated dwarf planets (shown by default) */}
                <div className="cat-item" onClick={toggleShowDwarfPlanets}>
                  <span className="cat-dot" style={{ background: '#a8a29e' }} />
                  <span className="cat-name">{t('dwarf_planets', 'Dwarf Planets')}</span>
                  <Toggle on={showDwarfPlanets} onChange={toggleShowDwarfPlanets} />
                </div>

                {/* Probable/candidate dwarf planets — a distinct, unratified category, so it has
                    its own switch rather than riding the IAU dwarf-planet one. */}
                <div className="cat-item" onClick={toggleShowDwarfCandidates}>
                  <span className="cat-dot" style={{ background: '#78716c' }} />
                  <span className="cat-name">{t('dwarf_candidates', 'Dwarf Planet Candidates')}</span>
                  <Toggle on={showDwarfCandidates} onChange={toggleShowDwarfCandidates} />
                </div>

                {/* Natural satellites of other planets (hidden until enabled) */}
                <div className="cat-item" onClick={toggleShowMoons}>
                  <span className="cat-dot" style={{ background: '#c7bfae' }} />
                  <span className="cat-name">{t('natural_moons', 'Natural Moons')}</span>
                  <Toggle on={showMoons} onChange={toggleShowMoons} />
                </div>

                {/* NASA meshes replace the current shape only for bodies with a verified asset. */}
                <div
                  className="cat-item"
                  title={t('realistic_shape_models_help', 'Uses NASA/JPL-Caltech meshes where available; other bodies keep their current shape.')}
                  onClick={toggleShowRealisticShapeModels}
                >
                  <span className="cat-dot" style={{ background: '#38bdf8' }} />
                  <span className="cat-name">{t('realistic_shape_models', 'NASA Shape Models (Phobos & Deimos)')}</span>
                  <Toggle on={showRealisticShapeModels} onChange={toggleShowRealisticShapeModels} />
                </div>

                {/* Screen-space dots for every planet and dwarf (locate bodies at any zoom) */}
                <div className="cat-item" onClick={toggleShowBodyPoints}>
                  <span className="cat-dot" style={{ background: '#7dd3fc' }} />
                  <span className="cat-name">{t('body_points', 'Planet & Dwarf Points')}</span>
                  <Toggle on={showBodyPoints} onChange={toggleShowBodyPoints} />
                </div>

                {/* Separate point layer for every moon (opt-in) */}
                <div className="cat-item" onClick={toggleShowMoonPoints}>
                  <span className="cat-dot" style={{ background: '#fcd34d' }} />
                  <span className="cat-name">{t('moon_points', 'Moon Points')}</span>
                  <Toggle on={showMoonPoints} onChange={toggleShowMoonPoints} />
                </div>

                {/* Automatic colored rings around artificial orbiters of other planets */}
                <div className="cat-item" onClick={toggleShowPlanetaryOrbiterRings}>
                  <span className="cat-dot" style={{ background: '#f59e0b' }} />
                  <span className="cat-name">{t('planetary_orbiter_rings', 'Planetary Orbiter Rings')}</span>
                  <Toggle on={showPlanetaryOrbiterRings} onChange={toggleShowPlanetaryOrbiterRings} />
                </div>

                {/* Interstellar / escape probes (Voyager, Pioneer, New Horizons) — hidden until enabled */}
                <div className="cat-item" onClick={toggleShowDeepSpaceProbes}>
                  <span className="cat-dot" style={{ background: '#f59e0b' }} />
                  <span className="cat-name">{t('deep_space_probes', 'Deep-Space Probes')}</span>
                  <Toggle on={showDeepSpaceProbes} onChange={toggleShowDeepSpaceProbes} />
                </div>

                {/* City / continent names on the Earth globe — hidden until enabled */}
                <div className="cat-item" onClick={toggleShowGeographicLabels}>
                  <span className="cat-dot" style={{ background: '#22d3ee' }} />
                  <span className="cat-name">{t('geographic_labels', 'City & Continent Names')}</span>
                  <Toggle on={showGeographicLabels} onChange={toggleShowGeographicLabels} />
                </div>

                <div className="display-subhead">{t('celestial_stars', 'Celestial & Stars')}</div>

                {/* Stars & Galaxy */}
                <div className="cat-item" onClick={toggleShowStars}>
                  <span className="cat-dot" style={{ background: '#93c5fd' }} />
                  <span className="cat-name">{t('stars_galaxy', 'Stars & Galaxy')}</span>
                  <Toggle on={showStars} onChange={toggleShowStars} />
                </div>

                {/* Star brightness slider */}
                {showStars && (
                  <div className="display-slider-row">
                    <div className="display-slider-header">
                      <span>{t('star_brightness', 'Star Brightness')}</span>
                      <span className="display-slider-val">{Math.round(starBrightness * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      className="display-range"
                      min="0.2"
                      max="2.5"
                      step="0.05"
                      value={starBrightness}
                      onChange={e => setStarBrightness(parseFloat(e.target.value))}
                    />
                  </div>
                )}

                {/* Sun & Flares */}
                <div className="cat-item" onClick={toggleShowSun}>
                  <span className="cat-dot" style={{ background: '#fbbf24' }} />
                  <span className="cat-name">{t('sun_lens_flare', 'Sun & Lens Flare')}</span>
                  <Toggle on={showSun} onChange={toggleShowSun} />
                </div>

                {/* Moon & Orbit */}
                <div className="cat-item" onClick={toggleShowMoon}>
                  <span className="cat-dot" style={{ background: '#cbd5e1' }} />
                  <span className="cat-name">{t('moon_lroc', 'The Moon (LROC)')}</span>
                  <Toggle on={showMoon} onChange={toggleShowMoon} />
                </div>

                <div className="display-subhead">{t('earth_visuals', 'Earth & Visuals')}</div>

                {/* Atmosphere */}
                <div className="cat-item" onClick={toggleShowAtmosphere}>
                  <span style={{ fontSize: '0.9rem' }}>🌍</span>
                  <span className="cat-name">{t('atmosphere_glow', 'Atmosphere Glow')}</span>
                  <Toggle on={showAtmosphere} onChange={toggleShowAtmosphere} />
                </div>

                {/* Clouds */}
                <div className="cat-item" onClick={toggleShowClouds}>
                  <span style={{ fontSize: '0.9rem' }}>☁️</span>
                  <span className="cat-name">{t('earth_clouds', 'Earth Clouds')}</span>
                  <Toggle on={showClouds} onChange={toggleShowClouds} />
                </div>

                {/* Van Allen Radiation Belts */}
                <div className="cat-item" onClick={toggleShowVanAllen}>
                  <span style={{ fontSize: '0.9rem' }}>🧲</span>
                  <span className="cat-name">{t('van_allen_belts', 'Van Allen Belts')}</span>
                  <Toggle on={showVanAllen} onChange={toggleShowVanAllen} />
                </div>

                {/* 3D Satellite Model */}
                <div className="cat-item" onClick={toggleShowSat3DModel}>
                  <span style={{ fontSize: '0.9rem' }}>🛰️</span>
                  <span className="cat-name">{t('sat_3d_model', '3D Satellite Model')}</span>
                  <Toggle on={showSat3DModel} onChange={toggleShowSat3DModel} />
                </div>

                {/* City Lights */}
                <div className="cat-item" onClick={toggleShowNightLights}>
                  <span style={{ fontSize: '0.9rem' }}>🌃</span>
                  <span className="cat-name">{t('city_night_lights', 'City Night Lights')}</span>
                  <Toggle on={showNightLights} onChange={toggleShowNightLights} />
                </div>

                {/* Satellite dot size */}
                <div className="display-slider-row">
                  <div className="display-slider-header">
                    <span>{t('satellite_size', 'Satellite Size')}</span>
                    <span className="display-slider-val">{satPointSize.toFixed(1)} px</span>
                  </div>
                  <input
                    type="range"
                    className="display-range"
                    min="1.0"
                    max="4.5"
                    step="0.1"
                    value={satPointSize}
                    onChange={e => setSatPointSize(parseFloat(e.target.value))}
                  />
                </div>

                {/* Wheel-zoom (mouse) sensitivity */}
                <div className="display-subhead">{t('interaction', 'Interaction')}</div>
                <div className="display-slider-row">
                  <div className="display-slider-header">
                    <span>{t('mouse_sensitivity', 'Mouse Zoom Speed')}</span>
                    <span className="display-slider-val">{Math.round(mouseSensitivity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    className="display-range"
                    min="0.25"
                    max="4"
                    step="0.05"
                    value={mouseSensitivity}
                    onChange={e => setMouseSensitivity(parseFloat(e.target.value))}
                  />
                </div>

                {/* Minimal Mode */}
                <div className="cat-item" onClick={onToggleMinimalist} style={{ marginTop: '0.3rem' }}>
                  <span style={{ fontSize: '0.9rem' }}>🔲</span>
                  <span className="cat-name">{t('minimal_mode', 'Minimal Mode')}</span>
                  <Toggle on={minimalist} onChange={onToggleMinimalist} />
                </div>
              </div>
            )}
          </div>

          {/* Time controls */}
          <div className="panel glass" style={{ marginBottom: '0.6rem' }}>
            <div
              className="panel-title"
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => toggleSection('time')}
            >
              <span>{t('time_control', 'Time Control')}</span>
              <span style={{ opacity: 0.4, fontSize: '0.8rem' }}>{expanded.time ? '▾' : '▸'}</span>
            </div>

            {expanded.time && (
              <>
                <div className="time-controls">
                  {TIME_SCALES.map(ts => (
                    <button
                      key={ts.value}
                      className={`time-btn ${timeScale === ts.value ? 'active' : ''}`}
                      onClick={() => setTimeScale(ts.value)}
                    >
                      {ts.label}
                    </button>
                  ))}
                  <button
                    className={`time-btn ${timeScale < 0 ? 'active' : ''}`}
                    onClick={() => setTimeScale(timeScale < 0 ? 1 : -Math.abs(timeScale || 60))}
                    title={t('reverse', 'Reverse')}
                  >
                    ◀◀
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                  <button className="time-btn danger" style={{ flex: 1 }} onClick={resetTime}>
                    {t('reset_now', '↺ Now')}
                  </button>
                </div>

                <div style={{
                  marginTop: '0.6rem', textAlign: 'center',
                  fontFamily: "'Space Mono', monospace", fontSize: '0.68rem',
                  color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em',
                }}>
                  <UtcClock />
                </div>
              </>
            )}
          </div>

          {/* Legal & Open-Source Attributions */}
          <div className="panel glass">
            <div
              className="panel-title"
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => toggleSection('legal')}
            >
              <span>⚖️ {t('legal_attributions', 'Legal & Attributions')}</span>
              <span style={{ opacity: 0.4, fontSize: '0.8rem' }}>{expanded.legal ? '▾' : '▸'}</span>
            </div>

            {expanded.legal && (
              <div style={{
                fontSize: '0.67rem',
                lineHeight: '1.45',
                color: 'rgba(255, 255, 255, 0.65)',
                padding: '0.4rem 0.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
              }}>
                <div>
                  <strong style={{ color: '#fff' }}>{t('imagery_credit', 'Astronomical Imagery & Textures')}:</strong>
                  <div style={{ whiteSpace: 'pre-line' }}>{t('imagery_details', '')}</div>
                </div>
                <div>
                  <strong style={{ color: '#fff' }}>{t('models_credit', '3D Models')}:</strong>
                  <div style={{ whiteSpace: 'pre-line' }}>{t('models_details', '')}</div>
                </div>
                <div>
                  <strong style={{ color: '#fff' }}>{t('orbital_credit', 'Orbital & Ephemeris Data')}:</strong>
                  <div style={{ whiteSpace: 'pre-line' }}>{t('orbital_details', '')}</div>
                </div>
                <div>
                  <strong style={{ color: '#fff' }}>{t('libraries_credit', 'Fonts & Open-Source Libraries')}:</strong>
                  <div style={{ whiteSpace: 'pre-line' }}>{t('libraries_details', '')}</div>
                </div>
                <div>
                  <strong style={{ color: '#fff' }}>{t('licenses_credit', 'License Texts')}:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.15rem' }}>
                    <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>CC BY 4.0</a>
                    <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>CC BY-SA 4.0</a>
                    <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>CC BY-SA 3.0</a>
                    <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>CC0 1.0</a>
                    <a href="https://opensource.org/license/mit" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>MIT</a>
                    <a href="https://openfontlicense.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>OFL 1.1</a>
                  </div>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.62rem' }}>
                  {t('legal_scope', '')}
                </div>

                <div style={{
                  marginTop: '0.5rem',
                  paddingTop: '0.4rem',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.55)', fontFamily: "'Space Mono', monospace" }}>
                    {t('created_by', 'Created by Nikita Gutsenkov')}
                  </span>
                  <a
                    href="mailto:n.gucenkov@gmail.com"
                    title="n.gucenkov@gmail.com"
                    style={{
                      color: 'var(--accent)',
                      border: '1px solid rgba(56,189,248,0.4)',
                      borderRadius: '4px',
                      padding: '0.1rem 0.45rem',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ✉ {t('hire_me', 'Hire Me')}
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: '0.25rem' }}>
        <div style={{
          fontSize: '0.62rem', color: 'rgba(255,255,255,0.2)',
          textAlign: 'center', fontFamily: "'Space Mono', monospace",
          letterSpacing: '0.05em',
        }}>
          {t('mit_license', 'Space Tracker · MIT License')}
        </div>
      </div>
    </aside>
  );
}

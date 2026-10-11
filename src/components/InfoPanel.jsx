import React, { useState, useEffect, useRef } from 'react';
import * as satjs from 'satellite.js';
import { useShallow } from 'zustand/react/shallow';
import { useSatStore } from '../store/useSatStore';
import { getCategoryById } from '../utils/categories';
import {
  getGMST, eciToGeodetic, eciToAltitudeKm, orbitalVelocity, orbitRegime,
} from '../utils/astronomy';
import { resolveSatelliteInfo } from '../utils/missionDatabase';
import { WikiService } from '../services/WikiService';
import { getTranslation } from '../utils/i18n';
import { PLANETARY_ELEMENTS_J2000 } from '../utils/planetaryData';
import { getBodyData } from '../utils/smallBodies';
import { heliocentricConicEcliptic } from '../utils/conicPropagation';

const MU_SUN_KM3_S2 = 1.32712440018e11;

function Row({ label, value, highlight }) {
  return (
    <div className="info-row">
      <span className="info-row-label">{label}</span>
      <span className={`info-row-value${highlight ? ' highlight' : ''}`}>{value}</span>
    </div>
  );
}

function deg(n, digits = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toFixed(digits) + '°';
}
function km(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' km';
}
function num(n, d = 4) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toFixed(d);
}

export default function InfoPanel({ onFocus }) {
  const {
    selectedSat: sat,
    language,
    infoPanelOpen,
  } = useSatStore(useShallow((s) => ({
    selectedSat:   s.selectedSat,
    language:      s.language,
    infoPanelOpen: s.infoPanelOpen,
  })));
  const setSelectedSat      = useSatStore((s) => s.setSelectedSat);
  const toggleInfoPanelOpen = useSatStore((s) => s.toggleInfoPanelOpen);
  const isMobile            = useSatStore((s) => s.isMobile);
  const [pos, setPos] = useState(null);
  const [showTle, setShowTle] = useState(false);
  const [missionInfo, setMissionInfo] = useState({
    loading: false,
    text: '',
    officialUrl: null,
    sourceName: null,
    wikiUrl: null,
    wikiTitle: null,
  });
  const satrec = useRef(null);

  useEffect(() => {
    if (!sat?.tle1 || !sat?.tle2) { setPos(null); return; }
    try {
      satrec.current = satjs.twoline2satrec(sat.tle1, sat.tle2);
    } catch (_) { satrec.current = null; }
  }, [sat?.id]);

  // Load mission details strictly matching the active language
  useEffect(() => {
    if (!sat) {
      setMissionInfo({
        loading: false,
        text: '',
        officialUrl: null,
        sourceName: null,
        wikiUrl: null,
        wikiTitle: null,
      });
      return;
    }

    const resolved = resolveSatelliteInfo(sat);
    const isRu = language === 'ru';
    const initialText = isRu
      ? (resolved?.defaultDescRu || resolved?.defaultDescEn || '')
      : (resolved?.defaultDescEn || resolved?.defaultDescRu || '');

    setMissionInfo({
      loading: !initialText,
      text: initialText,
      officialUrl: resolved?.officialUrl || null,
      sourceName: resolved?.sourceName || null,
      wikiUrl: null,
      wikiTitle: null,
    });

    let active = true;

    const fetchKnowledge = async () => {
      const primaryLang   = isRu ? 'ru' : 'en';
      const secondaryLang = isRu ? 'en' : 'ru';
      const primaryTitle = isRu
        ? (resolved?.wikiTitleRu || resolved?.wikiTitle || sat.name)
        : (resolved?.wikiTitle || resolved?.wikiTitleRu || sat.name);
      const secondaryTitle = isRu
        ? (resolved?.wikiTitle || sat.name)
        : (resolved?.wikiTitleRu || sat.name);

      const result = await WikiService.getExtract({
        satId: sat.id ?? sat.name,
        primaryLang,
        secondaryLang,
        primaryTitle,
        secondaryTitle,
        // A guessed title (uncurated fallback) must clear the relevance check;
        // a hand-checked database title is trusted as-is.
        curated: !resolved?.uncurated,
      });

      if (!active) return;

      setMissionInfo({
        loading: false,
        text: initialText || result?.text || '',
        officialUrl: resolved?.officialUrl || null,
        sourceName: resolved?.sourceName || null,
        wikiUrl: result?.wikiUrl || null,
        wikiTitle: result?.wikiTitle || null,
      });
    };

    fetchKnowledge();
    return () => { active = false; };
  }, [sat?.id, language]);

  // Update live position every second
  useEffect(() => {
    if (!sat) { setPos(null); return; }
    if (sat.isSolar) {
      setPos({
        lat: sat.incDeg || 0,
        lon: 0,
        alt: (sat.perihelionUnits || 28) * 149597870.7 / 100, // Distance in km
        vel: parseFloat(sat.speedKmS) || 635,
      });
      return;
    }
    if (sat.isPlanetary) {
      // Mean altitude above the parent body's surface (periapsis..apoapsis midpoint).
      setPos({
        lat: 0,
        lon: 0,
        alt: ((sat.periapsisKm ?? 0) + (sat.apoapsisKm ?? sat.periapsisKm ?? 0)) / 2,
        vel: null,
      });
      return;
    }
    if (sat.isDeepSpace && sat.elements) {
      // Live heliocentric distance and speed from the real JPL Horizons osculating elements.
      const jd = useSatStore.getState().simTime / 86400000 + 2440587.5;
      const { rKm } = heliocentricConicEcliptic(sat.elements, jd);
      const speed = Math.sqrt(Math.max(0, MU_SUN_KM3_S2 * (2 / rKm - 1 / sat.elements.aKm)));
      setPos({ lat: 0, lon: 0, alt: rKm, vel: speed });
      return;
    }
    if (!satrec.current) { setPos(null); return; }
    const compute = () => {
      try {
        const date = new Date(useSatStore.getState().simTime);
        const pv   = satjs.propagate(satrec.current, date);
        if (!pv?.position) return;
        const gmst = getGMST(date);
        const geo  = eciToGeodetic(pv.position.x, pv.position.y, pv.position.z, gmst);
        const alt  = geo.alt; // Exact WGS-84 ellipsoidal height
        const vel  = orbitalVelocity(pv); // Exact instantaneous magnitude ||v|| from SGP4 state vector
        setPos({ lat: geo.lat, lon: geo.lon, alt, vel });
      } catch (_) {}
    };
    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, [sat?.id]);

  if (!sat) return null;

  const isPlanet = !!sat.isPlanet;
  const isDwarf = sat.bodyClass === 'dwarf';
  const isMoonBody = sat.bodyClass === 'moon';
  const isPlanetary = !!sat.isPlanetary;
  const isDeepSpace = !!sat.isDeepSpace;
  const pData = sat.data || (isPlanet ? PLANETARY_ELEMENTS_J2000[sat.id] : null);
  const parentPlanet = isPlanetary ? PLANETARY_ELEMENTS_J2000[sat.parentPlanetId] : null;
  const moonParent = isMoonBody ? getBodyData(sat.parentId) : null;
  const parentName = moonParent
    ? (language === 'ru' ? moonParent.nameRu : moonParent.nameEn)
    : parentPlanet
    ? (language === 'ru' ? parentPlanet.nameRu : parentPlanet.nameEn)
    : '';
  const orbitEcc = isPlanetary && parentPlanet
    ? (() => {
        const rp = parentPlanet.radiusKm + (sat.periapsisKm ?? 0);
        const ra = parentPlanet.radiusKm + (sat.apoapsisKm ?? 0);
        return ra + rp > 0 ? (ra - rp) / (ra + rp) : 0;
      })()
    : null;

  const cat    = isPlanet
    ? { id: 'planet', name: 'Planet', color: '#38bdf8' }
    : isDeepSpace
    ? { id: 'deepspace', name: 'Deep Space', color: '#a855f7' }
    : isPlanetary
    ? { id: 'planetary', name: 'Planetary Orbiter', color: '#22c55e' }
    : getCategoryById(sat.category);
  const semiA = pData?.a ?? pData?.elements?.aAU;
  const period = isMoonBody && pData?.elements?.periodDays
    ? `${pData.elements.periodDays.toFixed(2)} ${language === 'ru' ? 'дней' : 'days'}`
    : isPlanet
    ? `${(semiA ? Math.sqrt(Math.pow(semiA, 3)) * 365.25 : 365).toFixed(1)} ${language === 'ru' ? 'дней' : 'days'}`
    : isDeepSpace
    ? (language === 'ru' ? 'Гиперболический уход' : 'Hyperbolic escape')
    : sat.isSolar
    ? `${Math.round((sat.periodMin || 88 * 1440) / 1440)} days`
    : isPlanetary
    ? (sat.periodMin >= 1440
        ? `${(sat.periodMin / 1440).toFixed(1)} ${language === 'ru' ? 'дней' : 'days'}`
        : `${Math.round(sat.periodMin)} min`)
    : (sat.meanMotion > 0 ? `${(1440 / sat.meanMotion).toFixed(1)} min` : '—');

  const regime = isPlanet
    ? (isMoonBody
        ? (language === 'ru' ? `Естественный спутник: ${parentName || '—'}` : `Natural satellite of ${parentName || '—'}`)
        : isDwarf
        ? (language === 'ru' ? 'Карликовая планета (гелиоцентрическая орбита)' : 'Dwarf planet (heliocentric orbit)')
        : (language === 'ru' ? `${pData?.typeRu || 'Планета'} (Орбита вокруг Солнца)` : `${pData?.typeEn || 'Planet'} (Heliocentric Orbit)`))
    : sat.isSolar
    ? (language === 'ru' ? 'Гелиоцентрическая солнечная орбита' : 'Heliocentric Solar Orbit')
    : isDeepSpace
    ? (language === 'ru' ? 'Гелиоцентрическая гиперболическая траектория ухода (межзвёздная)' : 'Heliocentric hyperbolic escape trajectory (interstellar)')
    : isPlanetary
    ? (language === 'ru' ? `Искусственная орбита вокруг ${parentName || 'планеты'}` : `Artificial orbit around ${parentName || 'planet'}`)
    : sat.isLunar
    ? (language === 'ru' ? 'Селеноцентрическая окололунная орбита' : 'Selenocentric Lunar Orbit')
    : (pos ? orbitRegime(pos.alt, sat.eccentricity, sat.perigee, sat.apogee) : '—');

  const latStr = pos
    ? `${Math.abs(pos.lat).toFixed(3)}° ${pos.lat >= 0 ? 'N' : 'S'}`
    : '—';
  const lonStr = pos
    ? `${Math.abs(pos.lon).toFixed(3)}° ${pos.lon >= 0 ? 'E' : 'W'}`
    : '—';

  // If user collapsed the panel, render a sleek floating toggle pill button
  if (!infoPanelOpen) {
    return (
      <div
        className="glass"
        style={{
          position: 'fixed',
          ...(isMobile
            ? { left: '50%', bottom: '4.5rem', transform: 'translateX(-50%)', zIndex: 300 }
            : { top: '1rem', right: '18.5rem' }),
          height: '36px',
          boxSizing: 'border-box',
          zIndex: 120,
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '0 0.8rem',
          borderRadius: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={toggleInfoPanelOpen}
        title={language === 'ru' ? 'Развернуть карточку спутника' : 'Expand satellite details'}
      >
        <span style={{ fontSize: '0.9rem' }}>🛰️</span>
        <span style={{
          color: '#fff',
          fontFamily: "'Space Mono', monospace",
          fontSize: '0.78rem',
          fontWeight: 600,
          maxWidth: '140px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {language === 'ru' && sat.nameRu ? sat.nameRu : sat.name}
        </span>
        <button
          className="info-minimize-btn"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: 'none',
            borderRadius: '50%',
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.8)',
            cursor: 'pointer',
            fontSize: '0.75rem',
            padding: 0,
            marginLeft: '0.2rem',
          }}
          title={language === 'ru' ? 'Развернуть панель' : 'Expand panel'}
        >
          ◀
        </button>
        <button
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer',
            fontSize: '0.9rem',
            padding: '0 0.1rem',
            lineHeight: 1,
          }}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedSat(null);
          }}
          title={language === 'ru' ? 'Снять выделение со спутника' : 'Deselect satellite'}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div
      className="info-panel glass"
      style={isMobile ? {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        top: 'auto',
        width: 'auto',
        maxHeight: '62vh',
        overflowY: 'auto',
        zIndex: 420,
        borderRadius: '16px 16px 0 0',
        padding: '0.85rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px))',
      } : {
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        width: '320px',
        maxHeight: 'calc(100vh - 2rem)',
        overflowY: 'auto',
        zIndex: 120,
        padding: '1.1rem',
      }}
    >
      {isMobile && (
        <div style={{
          width: '40px', height: '4px', borderRadius: '2px',
          background: 'rgba(255,255,255,0.25)', margin: '0 auto 0.7rem',
        }} />
      )}
      <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <button
          className="info-header-btn"
          onClick={toggleInfoPanelOpen}
          title={language === 'ru' ? 'Свернуть панель (сохраняя просмотр спутника)' : 'Collapse panel (keep tracking)'}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            fontSize: '0.75rem',
            padding: '0.2rem 0.45rem',
            lineHeight: 1,
            transition: 'all 0.15s',
          }}
        >
          ▶
        </button>
        <button
          className="info-close"
          onClick={() => setSelectedSat(null)}
          title={language === 'ru' ? 'Снять выделение и вернуться к Земле' : 'Deselect and return to planet'}
          style={{ position: 'static' }}
        >
          ✕
        </button>
      </div>

      {/* Header */}
      <div className="info-name" style={{ paddingRight: '3.5rem' }}>
        {language === 'ru' && sat.nameRu ? sat.nameRu : sat.name}
      </div>
      <div className="info-norad">
        {isPlanet
          ? (isMoonBody
              ? (language === 'ru' ? `Естественный спутник: ${parentName || ''}` : `Moon of ${parentName || ''}`)
              : isDwarf
              ? (language === 'ru' ? 'Карликовая планета' : 'Dwarf Planet')
              : (language === 'ru' ? 'Планета Солнечной системы' : 'Solar System Planet'))
          : isDeepSpace
          ? (language === 'ru' ? 'Межзвёздный / межпланетный зонд' : 'Interstellar / escape probe')
          : isPlanetary
          ? (language === 'ru' ? `Искусственный спутник: ${parentName || ''}` : `Artificial satellite: ${parentName || ''}`)
          : `NORAD #${sat.noradId || sat.id}`}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0 0.875rem' }}>
        <span
          className="info-badge"
          style={{
            background: cat.color + '22',
            border:     `1px solid ${cat.color}55`,
            color:      cat.color,
          }}
        >
          {isPlanet ? (pData?.typeRu && language === 'ru' ? pData.typeRu : (pData?.typeEn || 'Planet')) : getTranslation(language, `cat_${cat.id}`, cat.name)}
        </span>
        {sat.country && sat.country !== '?' && !isPlanet && (
          <span style={{
            fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)',
            fontFamily: "'Space Mono', monospace",
          }}>
            {sat.country}
          </span>
        )}
      </div>

      {/* Live position or Planetary telemetry */}
      {isPlanet ? (
        <div className="info-section">
          <div className="info-section-title">{language === 'ru' ? 'Параметры тела' : 'Physical Properties'}</div>
          <Row label={language === 'ru' ? 'Экваториальный радиус' : 'Equatorial Radius'} value={km(pData?.radiusKm || sat.radiusKm)} highlight />
          <Row label={language === 'ru' ? 'Масса' : 'Mass'} value={pData?.massKg ? `${pData.massKg.toExponential(3)} kg` : '—'} />
          <Row label={language === 'ru' ? 'Период вращения' : 'Rotation Period'} value={pData?.rotPeriodHours ? `${Math.abs(pData.rotPeriodHours).toFixed(1)} h` : '—'} />
          <Row label={language === 'ru' ? 'Наклон оси' : 'Axial Tilt'} value={deg(pData?.axialTiltDeg)} />
        </div>
      ) : isPlanetary ? (
        <div className="info-section">
          <div className="info-section-title">{getTranslation(language, 'live_position')}</div>
          <Row label={language === 'ru' ? 'Родительское тело' : 'Parent Body'} value={parentName || '—'} highlight />
          <Row label={language === 'ru' ? 'Средняя высота орбиты' : 'Mean Orbit Altitude'} value={pos ? km(pos.alt) : km(((sat.periapsisKm ?? 0) + (sat.apoapsisKm ?? 0)) / 2)} />
          <Row label={language === 'ru' ? 'Наклонение' : 'Inclination'} value={deg(sat.incDeg)} />
          <Row label={getTranslation(language, 'period')} value={period} />
        </div>
      ) : isDeepSpace ? (
        <div className="info-section">
          <div className="info-section-title">{getTranslation(language, 'live_position')}</div>
          <Row label={language === 'ru' ? 'Гелиоцентрическое расстояние' : 'Heliocentric Distance'} value={pos ? `${(pos.alt / 149597870.7).toFixed(2)} AU` : '—'} highlight />
          <Row label={language === 'ru' ? 'Скорость относительно Солнца' : 'Speed (heliocentric)'} value={pos && Number.isFinite(pos.vel) ? `${pos.vel.toFixed(2)} km/s` : '—'} />
          <Row label={language === 'ru' ? 'Скорость на бесконечности' : 'Hyperbolic Excess (v∞)'} value={sat.vInfinityKmS ? `${sat.vInfinityKmS} km/s` : '—'} />
        </div>
      ) : (
        <div className="info-section">
          <div className="info-section-title">{getTranslation(language, 'live_position')}</div>
          <Row label={getTranslation(language, 'latitude')}  value={latStr} />
          <Row label={getTranslation(language, 'longitude')} value={lonStr} />
          <Row label={getTranslation(language, 'altitude')}  value={pos ? km(pos.alt) : '—'} highlight />
          <Row label={getTranslation(language, 'speed')}     value={pos && Number.isFinite(pos.vel) ? `${pos.vel.toFixed(2)} km/s` : '—'} />
        </div>
      )}

      {/* Orbit type banner */}
      {(pos || sat.isSolar || sat.isLunar) && (
        <div className="orbit-type">
          <span>{sat.isSolar ? '☀️' : sat.isLunar ? '🌕' : isDeepSpace ? '🛰️' : isPlanetary ? '🛰️' : '🛸'}</span>
          <span style={{ fontSize: '0.75rem' }}>{regime}</span>
        </div>
      )}

      {/* Orbital elements */}
      <div className="info-section" style={{ marginTop: '0.75rem' }}>
        <div className="info-section-title">{getTranslation(language, 'orbital_elements')}</div>
        {isPlanet ? (
          isMoonBody ? (
            <>
              <Row label={language === 'ru' ? 'Большая полуось (a)' : 'Semi-Major Axis (a)'} value={`${Math.round(pData?.elements?.aKm || 0).toLocaleString()} km`} highlight />
              <Row label={language === 'ru' ? 'Период обращения' : 'Orbital Period'} value={period} />
              <Row label={getTranslation(language, 'eccentricity')} value={num(pData?.elements?.e, 4)} />
              <Row label={getTranslation(language, 'inclination')} value={deg(pData?.elements?.iDeg)} />
              <Row label={language === 'ru' ? 'Родительское тело' : 'Parent Body'} value={parentName || '—'} />
            </>
          ) : (
            <>
              <Row label={language === 'ru' ? 'Большая полуось (a)' : 'Semi-Major Axis (a)'} value={`${(pData?.a ?? pData?.elements?.aAU ?? 1.0).toFixed(4)} AU`} highlight />
              <Row label={language === 'ru' ? 'Период обращения' : 'Orbital Period'} value={period} />
              <Row label={getTranslation(language, 'eccentricity')} value={num(pData?.e ?? pData?.elements?.e, 5)} />
              <Row label={getTranslation(language, 'inclination')} value={deg(pData?.I ?? pData?.elements?.iDeg)} />
              <Row label={language === 'ru' ? 'Перигелий' : 'Perihelion'} value={`${(((pData?.a ?? pData?.elements?.aAU) || 1.0) * (1 - ((pData?.e ?? pData?.elements?.e) || 0))).toFixed(3)} AU`} />
              <Row label={language === 'ru' ? 'Афелий' : 'Aphelion'} value={`${(((pData?.a ?? pData?.elements?.aAU) || 1.0) * (1 + ((pData?.e ?? pData?.elements?.e) || 0))).toFixed(3)} AU`} />
            </>
          )
        ) : isDeepSpace ? (
          <>
            <Row label={getTranslation(language, 'eccentricity')} value={num(sat.elements?.e, 5)} highlight />
            <Row label={getTranslation(language, 'inclination')} value={deg(sat.elements?.iDeg)} />
            <Row label={language === 'ru' ? 'Перигелий (расстояние)' : 'Perihelion Distance'} value={`${((sat.elements?.qKm || 0) / 149597870.7).toFixed(2)} AU`} />
            <Row label={language === 'ru' ? 'Большая полуось (a)' : 'Semi-Major Axis (a)'} value={`${((sat.elements?.aKm || 0) / 149597870.7).toFixed(2)} AU`} />
            <Row label={language === 'ru' ? 'Скорость ухода (v∞)' : 'Hyperbolic Excess (v∞)'} value={sat.vInfinityKmS ? `${sat.vInfinityKmS} km/s` : '—'} />
          </>
        ) : isPlanetary ? (
          <>
            <Row label={getTranslation(language, 'inclination')} value={deg(sat.incDeg)} />
            <Row label={getTranslation(language, 'period')} value={period} />
            <Row label={language === 'ru' ? 'Высота перицентра' : 'Periapsis Altitude'} value={km(sat.periapsisKm)} />
            <Row label={language === 'ru' ? 'Высота апоцентра' : 'Apoapsis Altitude'} value={km(sat.apoapsisKm)} />
            <Row label={getTranslation(language, 'eccentricity')} value={num(orbitEcc, 4)} />
          </>
        ) : (
          <>
            <Row label={getTranslation(language, 'inclination')}  value={deg(sat.inclination || sat.incDeg)} />
            <Row label={getTranslation(language, 'period')}       value={period} />
            {sat.meanMotion && <Row label={getTranslation(language, 'mean_motion')}  value={`${sat.meanMotion.toFixed(4)} rev/day`} />}
            <Row label={getTranslation(language, 'eccentricity')} value={num(sat.eccentricity, 4)} />
            {sat.isSolar ? (
              <>
                <Row label="Aphelion" value={`${((sat.aphelionUnits || 0) / 23481.0).toFixed(3)} AU`} />
                <Row label="Perihelion" value={`${((sat.perihelionUnits || 0) / 23481.0).toFixed(3)} AU`} />
              </>
            ) : (
              <>
                <Row label={getTranslation(language, 'apogee')}       value={km(sat.apogeeKm || sat.altKm)} />
                <Row label={getTranslation(language, 'perigee')}      value={km(sat.perigeeKm || sat.altKm)} />
              </>
            )}
            {sat.raan != null && <Row label={getTranslation(language, 'raan')}         value={deg(sat.raan || sat.raanDeg)} />}
            {sat.argPerigee != null && <Row label={getTranslation(language, 'arg_perigee')}  value={deg(sat.argPerigee)} />}
          </>
        )}
      </div>

      {/* Identity / Planetary Metadata */}
      <div className="info-section">
        <div className="info-section-title">{getTranslation(language, 'identity')}</div>
        {isPlanet ? (
          <>
            <Row label={language === 'ru' ? 'Тип' : 'Classification'} value={language === 'ru' ? pData?.typeRu : pData?.typeEn} />
            <Row label={language === 'ru' ? 'Кольцевая система' : 'Rings System'} value={pData?.hasRings ? (language === 'ru' ? 'Есть (кольца)' : 'Yes (Rings)') : (language === 'ru' ? 'Нет' : 'None')} />
            <Row label={language === 'ru' ? 'Атмосфера' : 'Atmosphere'} value={pData?.atmosphere ? (language === 'ru' ? 'Есть' : 'Present') : (language === 'ru' ? 'Разрежённая / нет' : 'Tenuous / None')} />
            <Row label={language === 'ru' ? 'Осевой наклон' : 'Obliquity to Orbit'} value={deg(pData?.axialTiltDeg)} />
          </>
        ) : (
          <>
            <Row label={getTranslation(language, 'intl_designator')} value={sat.intlDesignator || '—'} />
            <Row label={getTranslation(language, 'object_type')}     value={sat.objectType || '—'} />
            <Row label={getTranslation(language, 'country')}         value={sat.country || '—'} />
            <Row label={getTranslation(language, 'launch_date')}     value={sat.launchDate || '—'} />
            {sat.epoch && <Row label={getTranslation(language, 'tle_epoch')} value={sat.epoch.split('T')[0]} />}
          </>
        )}
      </div>

      {/* Focus button */}
      {onFocus && (
        <button
          className="time-btn active"
          style={{ width: '100%', marginBottom: '0.75rem', padding: '0.5rem' }}
          onClick={() => onFocus(sat)}
        >
          {getTranslation(language, 'focus_camera')}
        </button>
      )}

      {/* External Links & Wiki */}
      <div className="info-section">
        <div className="info-section-title">{getTranslation(language, 'mission_knowledge')}</div>

        {missionInfo.text && (
          <div style={{
            fontSize: '0.72rem',
            lineHeight: '1.45',
            color: 'rgba(255,255,255,0.75)',
            background: 'rgba(255,255,255,0.03)',
            borderLeft: '2px solid var(--accent)',
            padding: '0.5rem 0.65rem',
            borderRadius: '0 6px 6px 0',
            marginBottom: '0.6rem',
          }}>
            {missionInfo.text}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
          {/* NASA Solar System official link for planets */}
          {isPlanet && (
            <a
              href={`https://science.nasa.gov/${sat.id}/`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.45rem 0.65rem',
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: 6,
                color: '#38bdf8',
                textDecoration: 'none',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              <span>🪐 {language === 'ru' ? 'NASA Обзор планеты' : 'NASA Planetary Fact Sheet'}</span>
              <span style={{ opacity: 0.7 }}>↗</span>
            </a>
          )}

          {/* 1. Official Agency Link (NASA, ESA, ISRO, Roscosmos, SpaceX, etc.) */}
          {missionInfo.officialUrl && !isPlanet && (
            <a
              href={missionInfo.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.45rem 0.65rem',
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: 6,
                color: '#38bdf8',
                textDecoration: 'none',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              <span>🚀 {missionInfo.sourceName || 'Official Mission Page'}</span>
              <span style={{ opacity: 0.7 }}>↗</span>
            </a>
          )}

          {/* 2. Verified Wikipedia Article (only shown if a valid article was actually found) */}
          {missionInfo.wikiUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <a
                href={missionInfo.wikiUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.45rem 0.65rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  color: 'var(--text)',
                  textDecoration: 'none',
                  fontSize: '0.75rem',
                }}
              >
                <span>📖 {missionInfo.wikiTitle || getTranslation(language, 'wikipedia_article')}</span>
                <span style={{ opacity: 0.4 }}>↗</span>
              </a>
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}
              >
                {getTranslation(language, 'wiki_license')}
              </a>
            </div>
          )}

          {/* 3. Live Radar / Satellite Tracking (only for valid Earth NORAD IDs) */}
          {sat.id && !sat.isLunar && !sat.isPlanetary && !sat.isDeepSpace && !isPlanet && (
            <a
              href={`https://www.n2yo.com/satellite/?s=${sat.noradId || sat.id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.45rem 0.65rem',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                color: 'var(--text)',
                textDecoration: 'none',
                fontSize: '0.75rem',
              }}
            >
              <span>🛰️ {getTranslation(language, 'live_radar')}</span>
              <span style={{ opacity: 0.4 }}>↗</span>
            </a>
          )}
        </div>
      </div>

      {/* Raw TLE for Earth satellites only */}
      {!isPlanet && !sat.isPlanetary && !sat.isDeepSpace && (
        <div className="info-section">
          <div className="info-section-title">{getTranslation(language, 'tle_data')}</div>
          <button className="tle-toggle" onClick={() => setShowTle(p => !p)}>
            {showTle ? getTranslation(language, 'hide_tle') : getTranslation(language, 'show_tle')}
          </button>
          {showTle && sat.tle1 && (
            <div className="tle-block">
              <div style={{ color: 'rgba(56,189,248,0.6)', marginBottom: '0.3rem', fontSize: '0.58rem' }}>LINE 0</div>
              <div style={{ marginBottom: '0.4rem' }}>{sat.name}</div>
              <div style={{ color: 'rgba(56,189,248,0.6)', marginBottom: '0.3rem', fontSize: '0.58rem' }}>LINE 1</div>
              <div style={{ marginBottom: '0.4rem' }}>{sat.tle1}</div>
              <div style={{ color: 'rgba(56,189,248,0.6)', marginBottom: '0.3rem', fontSize: '0.58rem' }}>LINE 2</div>
              <div>{sat.tle2}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

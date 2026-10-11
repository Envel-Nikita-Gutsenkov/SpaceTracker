import React, { useState, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSatStore } from '../store/useSatStore';
import { getTranslation } from '../utils/i18n';
import { PLANETARY_ELEMENTS_J2000, ORDERED_PLANET_KEYS } from '../utils/planetaryData';
import { DWARF_PLANETS, ORDERED_DWARF_KEYS, MOONS, ORDERED_MOON_KEYS } from '../utils/smallBodies';

export default function PlanetBar({ onSelectBody, minimalist }) {
  const { activeBody, language, sidebarOpen, showDwarfPlanets, showMoons } = useSatStore(useShallow((s) => ({
    activeBody:  s.activeBody,
    language:    s.language,
    sidebarOpen: s.sidebarOpen,
    showDwarfPlanets: s.showDwarfPlanets,
    showMoons:        s.showMoons,
  })));
  const setActiveBody = useSatStore((s) => s.setActiveBody);
  const isMobile = useSatStore((s) => s.isMobile);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const isRu = language === 'ru';

  // Dwarf planets and moons are only rendered while their category toggle is on, so they are only
  // offered in the selector while visible — a hidden body has no place in the list.
  const dwarfItems = ORDERED_DWARF_KEYS.map(k => {
    const p = DWARF_PLANETS[k];
    return {
      id: k,
      name: isRu ? p.nameRu : p.nameEn,
      color: p.orbitColor || '#888888',
      type: isRu ? p.typeRu : p.typeEn,
      desc: isRu ? p.descRu : p.descEn,
    };
  });

  const moonItems = ORDERED_MOON_KEYS.map(k => {
    const m = MOONS[k];
    return {
      id: k,
      name: isRu ? m.nameRu : m.nameEn,
      color: m.orbitColor || '#888888',
      type: isRu ? m.typeRu : m.typeEn,
      desc: isRu ? m.descRu : m.descEn,
    };
  });

  const CELESTIAL_BODIES = [
    {
      id: 'sun',
      name: getTranslation(language, 'body_sun'),
      color: '#facc15', // Bright yellow
      type: getTranslation(language, 'type_star'),
      desc: getTranslation(language, 'body_sun_desc'),
    },
    {
      id: 'earth',
      name: getTranslation(language, 'body_earth'),
      color: '#38bdf8', // Earth blue
      type: getTranslation(language, 'type_planet'),
      desc: getTranslation(language, 'body_earth_desc'),
    },
    {
      id: 'moon',
      name: getTranslation(language, 'body_moon'),
      color: '#cbd5e1', // Moon gray
      type: getTranslation(language, 'type_satellite'),
      desc: getTranslation(language, 'body_moon_desc'),
    },
    ...ORDERED_PLANET_KEYS.filter(k => k !== 'earth').map(k => {
      const p = PLANETARY_ELEMENTS_J2000[k];
      return {
        id: k,
        name: isRu ? p.nameRu : p.nameEn,
        color: p.orbitColor || '#888888',
        type: isRu ? p.typeRu : p.typeEn,
        desc: isRu ? p.descRu : p.descEn,
      };
    }),
    ...dwarfItems,
    ...moonItems,
  ];

  // Dropdown is rendered as labelled sections so the growing body catalogue stays navigable.
  // Hidden categories drop out entirely rather than showing as disabled rows.
  const visibleDwarfs = showDwarfPlanets ? dwarfItems : [];
  const visibleMoons  = showMoons ? moonItems : [];
  const SECTIONS = [
    { label: getTranslation(language, 'section_system', 'CELESTIAL SYSTEM'), items: CELESTIAL_BODIES.slice(0, 3) },
    { label: getTranslation(language, 'section_planets', 'PLANETS'), items: CELESTIAL_BODIES.slice(3, 3 + ORDERED_PLANET_KEYS.filter(k => k !== 'earth').length) },
    ...(visibleDwarfs.length ? [{ label: getTranslation(language, 'section_dwarfs', 'DWARF PLANETS'), items: visibleDwarfs }] : []),
    ...(visibleMoons.length ? [{ label: getTranslation(language, 'section_moons', 'MOONS'), items: visibleMoons }] : []),
  ];

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleClickOutside);
    return () => window.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  if (minimalist) return null;

  const currentBody = CELESTIAL_BODIES.find(b => b.id === activeBody) || CELESTIAL_BODIES[1];

  const handleSelect = (body) => {
    setActiveBody(body.id);
    setIsOpen(false);
    if (onSelectBody) {
      onSelectBody(body.id);
    }
  };

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: '1rem',
        left: isMobile ? '3.4rem' : (sidebarOpen ? '336px' : '11.2rem'),
        zIndex: isMobile ? 260 : 150,
        transition: 'left 0.25s ease',
      }}
    >
      {/* Compact Main Selector Button */}
      <button
        onClick={() => setIsOpen(p => !p)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '0 0.8rem',
          height: '36px',
          boxSizing: 'border-box',
          borderRadius: '10px',
          background: 'rgba(0, 10, 20, 0.82)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          color: '#ffffff',
          cursor: 'pointer',
          fontFamily: "'Space Mono', monospace",
          fontSize: '0.78rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
          transition: 'all 0.15s ease',
        }}
        title="Switch Celestial Body"
      >
        <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: currentBody.color, boxShadow: `0 0 8px ${currentBody.color}66` }} />
        <span style={{ fontWeight: 600 }}>{currentBody.name}</span>
        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginLeft: '0.2rem' }}>
          {isOpen ? '▴' : '▾'}
        </span>
      </button>

      {/* Expandable Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.4rem)',
            left: 0,
            width: isMobile ? 'min(78vw, 320px)' : undefined,
            minWidth: isMobile ? undefined : '240px',
            background: 'rgba(2, 8, 16, 0.94)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '10px',
            padding: '0.35rem',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.65)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            maxHeight: isMobile ? '58vh' : '70vh',
            overflowY: 'auto',
          }}
        >
          {SECTIONS.map((section) => (
            <React.Fragment key={section.label}>
              <div style={{
                fontSize: '0.62rem',
                color: 'rgba(255, 255, 255, 0.35)',
                padding: '0.45rem 0.5rem 0.2rem',
                fontFamily: "'Space Mono', monospace",
                letterSpacing: '0.08em',
              }}>
                {section.label}
              </div>

              {section.items.map(body => {
                const isActive = activeBody === body.id;
                return (
                  <div
                    key={body.id}
                    onClick={() => handleSelect(body)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      padding: '0.5rem 0.65rem',
                      borderRadius: '7px',
                      background: isActive ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                      border: isActive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                      cursor: body.disabled ? 'not-allowed' : 'pointer',
                      opacity: body.disabled ? 0.35 : 1.0,
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: body.color, flexShrink: 0, marginLeft: '0.2rem', boxShadow: `0 0 8px ${body.color}66` }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        color: isActive ? '#38bdf8' : '#ffffff',
                        fontFamily: "'Space Mono', monospace",
                      }}>
                        {body.name}
                      </div>
                      <div style={{
                        fontSize: '0.63rem',
                        color: 'rgba(255, 255, 255, 0.45)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {body.desc}
                      </div>
                    </div>
                    {isActive && (
                      <span style={{ color: '#38bdf8', fontSize: '0.75rem' }}>✓</span>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

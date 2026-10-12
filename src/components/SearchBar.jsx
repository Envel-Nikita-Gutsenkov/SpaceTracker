import React, { useState, useEffect, useRef } from 'react';
import { useSatStore } from '../store/useSatStore';
import { getTranslation } from '../utils/i18n';
import { PLANETARY_ELEMENTS_J2000, ORDERED_PLANET_KEYS } from '../utils/planetaryData';
import { DWARF_PLANETS, ORDERED_DWARF_KEYS, OFFICIAL_DWARF_KEYS, isOfficialDwarf, MOONS, ORDERED_MOON_KEYS } from '../utils/smallBodies';

export default function SearchBar({ minimalist, onFocus }) {
  const allSatellites = useSatStore((s) => s.allSatellites);
  const language      = useSatStore((s) => s.language);
  const selectedSat   = useSatStore((s) => s.selectedSat);
  const infoPanelOpen = useSatStore((s) => s.infoPanelOpen);
  const sidebarOpen   = useSatStore((s) => s.sidebarOpen);
  const showDwarfPlanets = useSatStore((s) => s.showDwarfPlanets);
  const showDwarfCandidates = useSatStore((s) => s.showDwarfCandidates);
  const showMoons        = useSatStore((s) => s.showMoons);
  const isMobile         = useSatStore((s) => s.isMobile);
  const [value, setValue] = useState('');
  const [results, setResults] = useState([]);
  const [isFocused, setIsFocused] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      useSatStore.getState().setSearchQuery(value);
      if (value.trim()) {
        const q = value.toLowerCase().trim();
        const makeItem = (id, p, bodyClass, parentId) => ({
          id,
          name: language === 'ru' ? p.nameRu : p.nameEn,
          nameEn: p.nameEn,
          nameRu: p.nameRu,
          isPlanet: true,
          bodyClass,
          parentId: parentId || null,
          radiusKm: p.radiusKm,
          recognition: p.recognition || null,
          category: bodyClass,
          desc: language === 'ru' ? p.descRu : p.descEn,
          data: p,
        });
        const planetItems = ORDERED_PLANET_KEYS.map(k => makeItem(k, PLANETARY_ELEMENTS_J2000[k], 'planet'));
        // Hidden categories are not searchable: a body that is not rendered (its toggle is off)
        // must not surface as a selectable result. The IAU-designated dwarf planets and the
        // unratified candidates are gated separately and listed as two blocks.
        const dwarfKeys = [
          ...(showDwarfPlanets ? OFFICIAL_DWARF_KEYS : []),
          ...(showDwarfCandidates ? ORDERED_DWARF_KEYS.filter(k => !isOfficialDwarf(k)) : []),
        ];
        const dwarfItems = dwarfKeys.map(k => makeItem(k, DWARF_PLANETS[k], 'dwarf'));
        const moonItems = showMoons
          ? ORDERED_MOON_KEYS.map(k => makeItem(k, MOONS[k], 'moon', MOONS[k].parentId))
          : [];
        const allBodyItems = [...planetItems, ...dwarfItems, ...moonItems];

        const satMatches = allSatellites.filter(s =>
          (s.name || '').toLowerCase().includes(q) ||
          String(s.id).includes(q) ||
          String(s.noradId || '').includes(q) ||
          (s.intlDesignator || '').toLowerCase().includes(q) ||
          (s.keywords || '').toLowerCase().includes(q) ||
          (s.agency || '').toLowerCase().includes(q) ||
          (s.desc || '').toLowerCase().includes(q) ||
          (s.descRu || '').toLowerCase().includes(q)
        );

        const planetMatches = allBodyItems.filter(p =>
          p.nameEn.toLowerCase().includes(q) ||
          p.nameRu.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q)
        );

        const matches = [...planetMatches, ...satMatches];
        setResults(matches);

        // If user typed exact NORAD ID or exact name, automatically select and focus it!
        const { selectedSat, setSelectedSat } = useSatStore.getState();
        const exactMatch = matches.find(s => String(s.id).toLowerCase() === q || (s.name || '').toLowerCase() === q || (s.nameEn || '').toLowerCase() === q);
        if (exactMatch && (!selectedSat || selectedSat.id !== exactMatch.id)) {
          setSelectedSat(exactMatch);
          if (onFocus) onFocus(exactMatch);
        } else if (matches.length === 1 && (!selectedSat || selectedSat.id !== matches[0].id)) {
          setSelectedSat(matches[0]);
          if (onFocus) onFocus(matches[0]);
        }
      } else {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(timerRef.current);
  }, [value, allSatellites, language, showDwarfPlanets, showDwarfCandidates, showMoons]);

  const handleSelect = (sat) => {
    const { setSelectedSat, setSearchQuery } = useSatStore.getState();
    setSelectedSat(sat);
    setValue(sat.name);
    setSearchQuery(sat.name);
    setIsFocused(false);
    if (onFocus) onFocus(sat);
  };

  if (minimalist && !value) return null;

  // When the satellite info panel opens, the HUD shifts left of it (right:345px)
  // and would collide with the centred search bar. Re-centre the search inside
  // the free band between the planet bar / sidebar (left) and the shifted
  // HUD + info panel (right) so nothing overlaps at any viewport width.
  const panelOpen = Boolean(selectedSat && infoPanelOpen) && !isMobile;
  let wrapStyle;
  if (panelOpen) {
    const leftReserve  = minimalist ? 0 : (sidebarOpen ? 480 : 330);
    const rightReserve = 620; // shifted HUD (≈256px @ right:345) + info panel
    const gap = 16;
    wrapStyle = {
      '--search-left':  `calc(${leftReserve}px + (100vw - ${leftReserve + rightReserve}px) / 2)`,
      '--search-width': `min(320px, calc(100vw - ${leftReserve + rightReserve + gap}px))`,
    };
  }

  return (
    <div className="search-wrap" style={wrapStyle}>
      <div className="search-input-wrap">
        <span style={{
          position: 'absolute', left: '0.7rem', top: '50%',
          transform: 'translateY(-50%)', opacity: 0.35, pointerEvents: 'none', fontSize: '0.85rem',
        }}>🔍</span>
        <input
          className="search-input glass"
          style={{ paddingLeft: '2rem' }}
          type="text"
          placeholder={getTranslation(language, 'search_placeholder')}
          value={value}
          onFocus={() => setIsFocused(true)}
          onChange={e => { setValue(e.target.value); setIsFocused(true); }}
        />
        {value && (
          <button className="search-clear" onClick={() => { setValue(''); useSatStore.getState().setSearchQuery(''); setResults([]); }}>
            ×
          </button>
        )}
      </div>

      {value && results.length > 0 && isFocused && (
        <div className="search-dropdown glass" style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '0.4rem',
          maxHeight: '260px', overflowY: 'auto', borderRadius: '8px', zIndex: 300,
          background: 'rgba(8, 14, 28, 0.95)', border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)', padding: '0.3rem',
        }}>
          {results.slice(0, 10).map(sat => (
            <div
              key={sat.id}
              onClick={() => handleSelect(sat)}
              style={{
                padding: '0.45rem 0.65rem', borderRadius: '5px', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: '0.78rem', color: '#e2e8f0', transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(56,189,248,0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sat.name}
              </span>
              <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', marginLeft: '0.5rem', fontFamily: 'monospace' }}>
                {sat.isPlanet
                  ? (sat.bodyClass === 'dwarf'
                      ? (sat.recognition === 'official' ? 'DWARF' : 'CANDIDATE')
                      : sat.bodyClass === 'moon' ? 'MOON' : 'PLANET')
                  : typeof sat.id === 'number'
                    ? `#${sat.id}`
                    : (sat.agency || '')}
              </span>
            </div>
          ))}
          {results.length > 10 && (
            <div style={{ textAlign: 'center', fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', padding: '0.3rem' }}>
              +{results.length - 10} more
            </div>
          )}
        </div>
      )}

      {value.trim() && (
        <div className="search-results">
          {results.length === 0
            ? getTranslation(language, 'no_results')
            : `${results.length.toLocaleString()} ${getTranslation(language, 'results_found')}`}
        </div>
      )}
    </div>
  );
}

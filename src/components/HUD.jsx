import React, { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSatStore } from '../store/useSatStore';
import { getTranslation } from '../utils/i18n';

function pad(n, len = 2) { return String(Math.floor(n)).padStart(len, '0'); }

function formatUTC(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} `
       + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

export default function HUD({ minimalist }) {
  const {
    fps, satelliteCount, simTime, timeScale, selectedSat,
    language, hudMetricsOpen,
  } = useSatStore(useShallow((s) => ({
    fps:            s.fps,
    satelliteCount: s.satelliteCount,
    simTime:        s.simTime,
    timeScale:      s.timeScale,
    selectedSat:    s.selectedSat,
    language:       s.language,
    hudMetricsOpen: s.hudMetricsOpen,
  })));
  const toggleHudMetricsOpen = useSatStore((s) => s.toggleHudMetricsOpen);
  const infoPanelOpen = useSatStore((s) => s.infoPanelOpen);
  const isMobile = useSatStore((s) => s.isMobile);
  const [mem, setMem] = useState(null);

  useEffect(() => {
    const id = setInterval(() => {
      if (performance.memory) {
        setMem((performance.memory.usedJSHeapSize / 1048576).toFixed(0));
      }
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const fpsClass = fps >= 50 ? 'hud-fps-good' : fps >= 30 ? 'hud-fps-ok' : 'hud-fps-bad';
  const tsLabel  = timeScale === 1
    ? getTranslation(language, 'real_time')
    : timeScale < 0
      ? `${Math.abs(timeScale)}× ◀`
      : `${timeScale}× ▶`;

  if (minimalist) {
    return null;
  }

  const isShifted = Boolean(selectedSat && infoPanelOpen) && !isMobile;

  return (
    <div className={`hud glass ${isShifted ? 'shifted' : ''}`} style={{ transition: 'all 0.25s ease' }}>
      {/* Top Bar: Always shows pristine UTC Clock + quick toggle for developer metrics */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem' }}>
        <div className="hud-clock" style={{ margin: 0, fontSize: '0.72rem' }}>{formatUTC(simTime)}</div>
        {!isMobile && (
          <button
            onClick={toggleHudMetricsOpen}
            style={{
              background: hudMetricsOpen ? 'rgba(56,189,248,0.2)' : 'none',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '4px',
              color: hudMetricsOpen ? 'var(--accent)' : 'var(--text-dim)',
              cursor: 'pointer',
              fontSize: '0.65rem',
              padding: '0.15rem 0.35rem',
              fontFamily: "'Space Mono', monospace",
            }}
            title={getTranslation(language, 'hud_toggle_metrics')}
          >
            {hudMetricsOpen ? '▲ Hide' : '📊 Stats'}
          </button>
        )}
      </div>

      {/* Heavy metrics are strictly hidden unless user explicitly opened them */}
      {hudMetricsOpen && (
        <div style={{ marginTop: '0.45rem', paddingTop: '0.35rem', borderTop: '1px solid var(--border)' }}>
          <div className="hud-row">
            <span className="hud-label">{getTranslation(language, 'hud_fps')}</span>
            <span className={`hud-value ${fpsClass}`}>{fps}</span>
          </div>
          <div className="hud-row">
            <span className="hud-label">{getTranslation(language, 'hud_objects')}</span>
            <span className="hud-value">{satelliteCount.toLocaleString()}</span>
          </div>
          <div className="hud-row">
            <span className="hud-label">{getTranslation(language, 'hud_speed')}</span>
            <span className="hud-value" style={{ color: timeScale !== 1 ? '#ffcc00' : undefined }}>{tsLabel}</span>
          </div>
          {mem && (
            <div className="hud-row">
              <span className="hud-label">{getTranslation(language, 'hud_mem')}</span>
              <span className="hud-value">{mem} MB</span>
            </div>
          )}

          <div
            style={{
              marginTop: '0.4rem',
              paddingTop: '0.35rem',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span style={{
              fontSize: '0.58rem',
              color: 'var(--text-dim)',
              fontFamily: "'Space Mono', monospace",
              whiteSpace: 'nowrap',
            }}>
              {getTranslation(language, 'created_by')}
            </span>
            <a
              href="mailto:n.gucenkov@gmail.com"
              title="n.gucenkov@gmail.com"
              style={{
                fontSize: '0.6rem',
                fontFamily: "'Space Mono', monospace",
                color: 'var(--accent)',
                border: '1px solid rgba(56,189,248,0.4)',
                borderRadius: '4px',
                padding: '0.1rem 0.4rem',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              ✉ {getTranslation(language, 'hire_me')}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

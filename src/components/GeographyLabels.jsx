import React, { useEffect, useRef, useState } from 'react';
import { useSatStore } from '../store/useSatStore';

// Surface labels for the Earth globe: city dots when the camera is down near the surface,
// continent names once it pulls back. Placement, far-side culling and anti-collision all
// happen in SceneManager.getGeographyScreenPositions(); this component only paints them.
export default function GeographyLabels({ sceneRef }) {
  const [labels, setLabels] = useState([]);
  const labelsRef = useRef([]);
  const language = useSatStore((s) => s.language);

  useEffect(() => {
    let animId;
    let last = 0;
    const updateLoop = (t) => {
      animId = requestAnimationFrame(updateLoop);
      // Same ~30 fps cadence as the celestial labels: text does not need per-frame placement.
      if (t - last < 33) return;
      last = t;
      if (!sceneRef.current) return;
      const next = sceneRef.current.getGeographyScreenPositions();
      const prev = labelsRef.current;
      const unchanged = next.length === prev.length &&
        next.every((label, i) => {
          const p = prev[i];
          return p.id === label.id &&
            Math.abs(p.x - label.x) < 1 &&
            Math.abs(p.y - label.y) < 1;
        });
      if (!unchanged) {
        labelsRef.current = next;
        setLabels(next);
      }
    };
    animId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animId);
  }, [sceneRef]);

  if (!labels.length) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 11 }}>
      {labels.map((b) => {
        const text = language === 'ru' ? b.nameRu : b.name;

        if (b.kind === 'continent') {
          return (
            <div
              key={b.id}
              style={{
                position: 'absolute',
                left: `${b.x}px`,
                top: `${b.y}px`,
                transform: 'translate(-50%, -50%)',
                color: '#ffffff',
                fontFamily: "'Space Mono', -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace",
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                textShadow: '0 0 12px rgba(0,0,0,0.95), 0 2px 5px rgba(0,0,0,1)',
                opacity: 0.82,
                userSelect: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {text}
            </div>
          );
        }

        // City: a glowing dot exactly on the surface point, name to its right.
        return (
          <div
            key={b.id}
            style={{
              position: 'absolute',
              left: `${b.x - 3}px`,
              top: `${b.y}px`,
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              userSelect: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#e0f2fe',
                boxShadow: '0 0 6px rgba(56,189,248,0.95), 0 0 2px rgba(255,255,255,1)',
                flex: '0 0 auto',
              }}
            />
            <span
              style={{
                color: '#ffffff',
                fontFamily: "'Space Mono', -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace",
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textShadow: '0 0 9px rgba(0,0,0,0.95), 0 1px 4px rgba(0,0,0,1)',
                opacity: 0.92,
              }}
            >
              {text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

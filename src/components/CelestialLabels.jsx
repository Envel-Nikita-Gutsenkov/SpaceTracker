import React, { useEffect, useRef, useState } from 'react';
import { useSatStore } from '../store/useSatStore';

export default function CelestialLabels({ sceneRef, onFocusEarth, onFocusMoon, onFocusSun, onFocusPlanet }) {
  const [labels, setLabels] = useState([]);
  const labelsRef = useRef([]);
  const language = useSatStore((s) => s.language);

  useEffect(() => {
    let animId;
    let last = 0;
    const updateLoop = (t) => {
      animId = requestAnimationFrame(updateLoop);
      // Text labels do not need to be repositioned every frame (~30 fps is plenty),
      // and each tick triggers a React render, so throttle it.
      if (t - last < 33) return;
      last = t;
      if (sceneRef.current) {
        const nextLabels = sceneRef.current.getCelestialScreenPositions();
        const previousLabels = labelsRef.current;
        const unchanged = nextLabels.length === previousLabels.length &&
          nextLabels.every((label, index) => {
            const previous = previousLabels[index];
            return previous.id === label.id &&
              previous.name === label.name &&
              previous.nameRu === label.nameRu &&
              Math.abs(previous.x - label.x) < 1 &&
              Math.abs(previous.y - label.y) < 1;
          });

        // Avoid reconciling the label DOM at 30 Hz while the view is static or moving
        // by less than one pixel.
        if (!unchanged) {
          labelsRef.current = nextLabels;
          setLabels(nextLabels);
        }
      }
    };
    animId = requestAnimationFrame(updateLoop);

    return () => cancelAnimationFrame(animId);
  }, [sceneRef]);

  if (!labels.length) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 12 }}>
      {labels.map((b) => {
        const rawText = language === 'ru' ? b.nameRu : b.name;
        const text = rawText.toUpperCase();

        return (
          <div
            key={b.id}
            onClick={() => {
              if (b.id === 'earth') onFocusEarth();
              else if (b.id === 'moon') onFocusMoon();
              else if (b.id === 'sun') onFocusSun();
              else if (onFocusPlanet) onFocusPlanet(b.id);
            }}
            style={{
              position: 'absolute',
              left: `${b.x + 16}px`,
              top: `${b.y}px`,
              transform: 'translateY(-50%)',
              pointerEvents: 'auto',
              cursor: 'pointer',
              color: '#ffffff',
              fontFamily: "'Space Mono', -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace",
              fontSize: '15px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textShadow: '0 0 10px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.95)',
              userSelect: 'none',
              transition: 'opacity 0.2s ease, text-shadow 0.2s ease',
              opacity: 0.95,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1.0';
              e.currentTarget.style.textShadow = '0 0 12px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.95';
              e.currentTarget.style.textShadow = '0 0 10px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.95)';
            }}
          >
            {text}
          </div>
        );
      })}
    </div>
  );
}

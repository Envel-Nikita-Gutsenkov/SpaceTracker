// Opt-in performance probe. Enable it with `?perf=1` in the URL.
//
// It measures the main-thread cost of each subsystem inside the render loop, the real frame
// interval, and browser long tasks, then draws a small live overlay and exposes `window.__perf`
// for a console report. When disabled every hook is a single boolean check, so it costs nothing
// in a normal session.
//
// Why this exists: most "freezes" are not slow code but work done at the wrong time (a texture
// upload or an O(n) rebuild inside a frame). Timing each subsystem per frame is the fastest way
// to see which one owns the spike — `?perf=1`, reproduce the stutter, read the worst avg/max row.

const ENABLED =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('perf') === '1';

const OVERLAY_UPDATE_MS = 250;
const LONG_FRAME_MS = 50; // matches the browser's long-task threshold

class PerfProbe {
  constructor() {
    this.enabled = ENABLED;
    this._stack = [];
    this._sections = new Map(); // name -> { total, count, max }
    this._frames = 0;
    this._frameTotal = 0;
    this._frameMax = 0;
    this._frameMin = Infinity;
    this._longFrames = 0;
    this._lastTick = 0;
    this._longTasks = 0;
    this._longestTask = 0;
    this._longestTaskAt = 0; // start time (ms since navigationStart) of the worst long task
    this._visibleSince = 0;  // performance.now() when the tab last became visible
    this._overlay = null;
    this._lastOverlay = 0;
    if (this.enabled) this._install();
  }

  _install() {
    if (typeof window !== 'undefined') window.__perf = this;

    // A hidden tab suspends requestAnimationFrame, so the first frame after the tab comes back
    // carries the whole pause as its interval (seen as a ~113 s "frame"), and the catch-up work
    // reads as a multi-second long task. Neither is work this app chose to do, so both are
    // dropped — otherwise the max columns are pure noise and hide the real spikes.
    if (typeof document !== 'undefined') {
      this._visibleSince = performance.now();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        this._visibleSince = performance.now();
        this._lastTick = 0; // re-baseline: the resume frame is not a frame we rendered
      });
    }

    if (typeof PerformanceObserver !== 'undefined') {
      try {
        new PerformanceObserver((list) => {
          const since = this._visibleSince || 0;
          for (const e of list.getEntries()) {
            if (e.startTime < since) continue; // began while hidden: a pause / resume catch-up
            this._longTasks += 1;
            if (e.duration > this._longestTask) {
              this._longestTask = e.duration;
              // When the worst task happened tells us whether it was boot or an interaction.
              this._longestTaskAt = e.startTime;
            }
          }
        }).observe({ entryTypes: ['longtask'] });
      } catch { /* longtask unsupported in this browser */ }
    }
  }

  // Open a timed section. Nesting is allowed but must be balanced with end().
  begin(name) {
    if (!this.enabled) return;
    this._stack.push(name, performance.now());
  }

  end() {
    if (!this.enabled) return;
    const t0 = this._stack.pop();
    const name = this._stack.pop();
    if (name === undefined) return;
    this._add(name, performance.now() - t0);
  }

  // Record an out-of-band measurement that spans many frames (e.g. a model load).
  record(name, ms) {
    if (!this.enabled) return;
    if (Number.isFinite(ms) && ms >= 0) this._add(name, ms);
  }

  _add(name, ms) {
    let s = this._sections.get(name);
    if (!s) { s = { total: 0, count: 0, max: 0 }; this._sections.set(name, s); }
    s.total += ms;
    s.count += 1;
    if (ms > s.max) s.max = ms;
  }

  // Call once per animation frame with the frame's timestamp (performance.now()).
  tick(nowMs) {
    if (!this.enabled) return;
    // rAF is paused while the tab is hidden; whatever it delivers on return is a resume, not a
    // frame this app rendered — skip it so the interval stats stay honest.
    if (typeof document !== 'undefined' && document.hidden) return;
    if (this._lastTick) {
      const dt = nowMs - this._lastTick;
      this._frames += 1;
      this._frameTotal += dt;
      if (dt > this._frameMax) this._frameMax = dt;
      if (dt < this._frameMin) this._frameMin = dt;
      if (dt > LONG_FRAME_MS) this._longFrames += 1;
    }
    this._lastTick = nowMs;
    if (nowMs - this._lastOverlay >= OVERLAY_UPDATE_MS) {
      this._lastOverlay = nowMs;
      this._renderOverlay();
    }
  }

  snapshot() {
    const rows = [];
    for (const [name, s] of this._sections) {
      rows.push({ name, avg: s.total / s.count, max: s.max, count: s.count });
    }
    rows.sort((a, b) => b.avg - a.avg);
    const frameAvg = this._frames ? this._frameTotal / this._frames : 0;
    return {
      fps: frameAvg ? 1000 / frameAvg : 0,
      frameAvg,
      frameMax: this._frameMax,
      frameMin: this._frameMin === Infinity ? 0 : this._frameMin,
      frames: this._frames,
      longFrames: this._longFrames,
      longTasks: this._longTasks,
      longestTask: this._longestTask,
      longestTaskAt: this._longestTaskAt,
      rows,
    };
  }

  report() {
    const s = this.snapshot();
    if (typeof console !== 'undefined') {
      if (console.table) console.table(s.rows);
      console.log(
        `fps≈${s.fps.toFixed(1)}  frame avg ${s.frameAvg.toFixed(2)}ms ` +
        `max ${s.frameMax.toFixed(2)}ms  longFrames(>${LONG_FRAME_MS}ms) ` +
        `${s.longFrames}/${s.frames}  longTasks ${s.longTasks} ` +
        `(longest ${s.longestTask.toFixed(1)}ms @ ${s.longestTaskAt.toFixed(0)}ms)`
      );
    }
    return s;
  }

  reset() {
    this._sections.clear();
    this._frames = 0;
    this._frameTotal = 0;
    this._frameMax = 0;
    this._frameMin = Infinity;
    this._longFrames = 0;
    this._longTasks = 0;
    this._longestTask = 0;
    this._longestTaskAt = 0;
    this._lastTick = 0;
  }

  _renderOverlay() {
    if (typeof document === 'undefined') return;
    if (!this._overlay) {
      const el = document.createElement('div');
      el.style.cssText =
        'position:fixed;left:8px;bottom:8px;z-index:9999;' +
        'background:rgba(0,0,0,0.72);color:#7CFC00;font:11px/1.35 monospace;' +
        'padding:8px 10px;border-radius:6px;white-space:pre;pointer-events:none;' +
        'max-width:360px;';
      document.body.appendChild(el);
      this._overlay = el;
    }
    const s = this.snapshot();
    const top = s.rows
      .slice(0, 8)
      .map((r) => `${r.name.padEnd(12)} ${r.avg.toFixed(2).padStart(7)}  max ${r.max.toFixed(2).padStart(7)}`)
      .join('\n');
    this._overlay.textContent =
      `PERF  fps≈${s.fps.toFixed(0)}  frame ${s.frameAvg.toFixed(2)}/${s.frameMax.toFixed(2)}ms\n` +
      `longFrames>${LONG_FRAME_MS}ms ${s.longFrames}/${s.frames}   longTasks ${s.longTasks} (max ${s.longestTask.toFixed(0)}ms @${s.longestTaskAt.toFixed(0)})\n` +
      `--- subsystem avg / max (ms) ---\n${top}\n` +
      `window.__perf.report() / .reset()`;
  }
}

export const perfProbe = new PerfProbe();

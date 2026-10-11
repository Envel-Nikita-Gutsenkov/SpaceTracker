export const FOCUS_TRANSITION_DURATION_MS = 1200;

export function getFocusTransitionProgress(startTime, now, duration = FOCUS_TRANSITION_DURATION_MS) {
  if (!Number.isFinite(startTime) || !Number.isFinite(now) || !Number.isFinite(duration) || duration <= 0) {
    return 1;
  }

  const progress = Math.max(0, Math.min(1, (now - startTime) / duration));
  return progress * progress * (3 - 2 * progress);
}

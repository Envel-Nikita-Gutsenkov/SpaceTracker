/**
 * Boot-time gate for the loading overlay.
 *
 * Large first-paint textures (the 8K Earth/Moon/Pluto maps, the 4K planet maps, the star map)
 * each cost a heavy JPEG decode plus a one-time GPU upload. If that work lands *after* the
 * overlay is lifted it shows up as a multi-second hitch the moment the scene becomes visible.
 * Loaders therefore register one promise per texture here; `SceneManager.whenTexturesReady()`
 * waits for the whole set and `App` keeps the overlay up until it resolves.
 *
 * A failed or hung load must never trap the user on the loading screen, so a rejection simply
 * stops counting toward readiness and a hard timeout releases the gate regardless.
 */
export const BOOT_TEXTURE_TIMEOUT_MS = 15000;

export class TextureReadiness {
  constructor() {
    this._pending = new Set();
    this._total = 0;
    this._settled = 0;
  }

  /** Register one texture's display-readiness promise. Rejections are treated as settled. */
  track(promise) {
    if (!promise || typeof promise.then !== 'function') return promise;
    this._total += 1;
    const settled = Promise.resolve(promise).catch(() => {});
    this._pending.add(settled);
    settled.then(() => {
      this._pending.delete(settled);
      this._settled += 1;
    });
    return promise;
  }

  get pendingCount() { return this._pending.size; }

  /** Fraction of registered textures that have settled (1 when there is nothing pending). */
  get progress() { return this._total === 0 ? 1 : this._settled / this._total; }

  /** Resolve once every tracked texture has settled, or after `timeoutMs` as a safety valve. */
  whenReady(timeoutMs = BOOT_TEXTURE_TIMEOUT_MS) {
    return new Promise((resolve) => {
      let done = false;
      let timer;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };
      const drain = async () => {
        // Loop so anything registered while we await is also covered.
        while (!done && this._pending.size > 0) await Promise.all([...this._pending]);
        finish();
      };
      timer = setTimeout(finish, timeoutMs);
      drain();
    });
  }
}

export const textureReadiness = new TextureReadiness();

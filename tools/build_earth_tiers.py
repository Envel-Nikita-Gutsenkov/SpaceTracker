#!/usr/bin/env python3
"""Derive the coarse Earth base tiers from the high-resolution masters.

The base (2K) and hi-res (8K) day/night layers must come from **one image series**:
if each tier is a different product (different tone curve, baked clouds, different
ocean/saturation grading) then the resolution swap at the LOD threshold is a visible
*series change* — the globe visibly darkens/desaturates when it drops to the base tier.
Building the base tier as a plain downscale of the 8K master guarantees an identical
tone curve, so a tier swap only ever changes resolution, never appearance.

Outputs (written into `public/`):
  earth_day_8k.webp   -> earth_day_2048.webp
  earth_night_8k.webp -> earth_night_2048.webp

Usage:
  python tools/build_earth_tiers.py [--width 2048] [--quality 90]
"""

import argparse
import os

from PIL import Image

# hi-res master -> coarse base file, both relative to the repo root.
TIERS = {
    "public/earth_day_8k.webp": "public/earth_day_2048.webp",
    "public/earth_night_8k.webp": "public/earth_night_2048.webp",
}


def build(src, dst, width, quality):
    with Image.open(src) as im:
        im = im.convert("RGB")
        height = width // 2
        # LANCZOS keeps the source's exact colour/tone; only detail changes.
        small = im.resize((width, height), Image.LANCZOS)
    small.save(dst, "WEBP", quality=quality, method=6)
    kb = os.path.getsize(dst) / 1024
    print(f"{dst}: {width}x{height}, {kb:,.0f} KB  (from {src})")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--width", type=int, default=2048, help="base tier width (height = width/2)")
    p.add_argument("--quality", type=int, default=90, help="WebP quality")
    args = p.parse_args()

    for src, dst in TIERS.items():
        if not os.path.exists(src):
            raise SystemExit(f"missing master: {src}")
        build(src, dst, args.width, args.quality)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build the app's star-map skybox tiers from the NASA "Deep Star Maps 2020" EXR.

Source: NASA/Goddard SVS 4851, celestial (ICRF/J2000) coordinates, OpenEXR
half-float. That file is linear HDR, so a plain WebP encode would come out almost
black; it must be tone-mapped to sRGB first. It also renders the plate-carree pole
convergence as a bright oval at the top edge and a bright line at the bottom edge
(NASA: "the oval shapes near the top and bottom ... are not galaxies ... just an
effect of the projection"). Those are removed with a small polar feather, then the
whole map gets a gentle levels pass to deepen the sky.

The same curve and mask are applied to every tier, so a resolution swap is a pure
resolution change.

Requires ffmpeg (libzimg/libwebp) on PATH.

Usage:
  python tools/build_starmap.py SOURCE.exr OUTDIR [--black 0.02] [--contrast 1.06]
      [--saturation 1.03] [--quality 85] [--tiers 2k,4k,8k]
"""

import argparse
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image

# Linear (OpenEXR) -> sRGB/BT.709, full range. libzimg does the transfer curve.
TONEMAP = (
    "format=gbrpf32le,"
    "zscale=transferin=linear:transfer=bt709:primariesin=bt709:primaries=bt709:"
    "rangein=full:range=full"
)

# Tier name -> output width. Height is always width / 2 (equirectangular).
TIERS = {"2k": 2048, "4k": 4096, "8k": 8192}

_LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

# Polar feather, expressed as row counts at the 8192-wide reference and scaled to
# each tier. Zeroes the outermost EDGE rows, then ramps back to full by EDGE + RAMP.
_EDGE_REF = 24
_RAMP_REF = 48
_REF_WIDTH = 8192


def polar_mask(height, width):
    """Vertical window that fades the converging poles to black."""
    scale = width / _REF_WIDTH
    edge = max(1, round(_EDGE_REF * scale))
    ramp = max(1, round(_RAMP_REF * scale))
    idx = np.arange(height)
    top = np.clip((idx - edge) / ramp, 0.0, 1.0)
    bottom = np.clip(((height - 1 - idx) - edge) / ramp, 0.0, 1.0)
    return np.minimum(top, bottom)[:, None, None].astype(np.float32)


def grade(img, black, contrast, saturation):
    """Levels (black point) + contrast about mid-grey + a mild chroma lift."""
    arr = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    arr = np.clip((arr - black) / (1.0 - black), 0.0, 1.0)
    arr = np.clip((arr - 0.5) * contrast + 0.5, 0.0, 1.0)
    if saturation != 1.0:
        luma = arr @ _LUMA
        arr = np.clip(luma[..., None] + (arr - luma[..., None]) * saturation, 0.0, 1.0)
    return arr


def build_tier(src, outdir, name, width, args):
    height = width // 2
    with tempfile.TemporaryDirectory() as tmp:
        png = os.path.join(tmp, "tier.png")
        vf = f"{TONEMAP},scale={width}:{height}"
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", src,
             "-vf", vf, png],
            check=True,
        )
        # Load inside the `with` so the temp file is closed before cleanup (Windows
        # refuses to delete a file PIL still holds open).
        with Image.open(png) as im:
            arr = grade(im, args.black, args.contrast, args.saturation)

    arr *= polar_mask(height, width)

    out = os.path.join(outdir, f"starmap_2020_{name}.webp")
    Image.fromarray((arr * 255.0).round().astype(np.uint8), "RGB").save(
        out, "WEBP", quality=args.quality, method=6
    )
    kb = os.path.getsize(out) / 1024
    print(f"{out}: {width}x{height}, {kb:,.0f} KB")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("source")
    p.add_argument("outdir")
    p.add_argument("--black", type=float, default=0.02)
    p.add_argument("--contrast", type=float, default=1.06)
    p.add_argument("--saturation", type=float, default=1.03)
    p.add_argument("--quality", type=int, default=85)
    p.add_argument("--tiers", default="2k,4k,8k")
    args = p.parse_args()

    for name in args.tiers.split(","):
        name = name.strip()
        if name not in TIERS:
            raise SystemExit(f"unknown tier: {name!r} (expected one of {list(TIERS)})")
        build_tier(args.source, args.outdir, name, TIERS[name], args)


if __name__ == "__main__":
    main()

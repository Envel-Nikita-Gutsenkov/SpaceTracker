# Third-Party Notices

Space Tracker bundles or depends on the third-party works listed below. This
file records their licenses and the attributions they require. The same
information is surfaced to end users in the in-app **Legal & Attributions**
panel (sidebar).

## Scope, warranty and commercial use

- **The MIT License covers the source code only, not the bundled assets.**
  Third-party imagery, 3D models, fonts and data keep their own licenses, as
  listed below, and must be reused under those terms.
- **Resized, re-cropped or re-encoded copies are derivative works.** The maps
  shipped here are downscaled from their source masters and some are re-encoded
  to WebP; each remains a derivative of its source and therefore carries the
  source's license. In particular, the **CC BY-SA** maps below (Pluto,
  Ganymede, Callisto, Phobos, Deimos) stay **CC BY-SA** as distributed.
- **Not public domain in general.** NASA / US-Government material is generally
  not copyrighted, but **ESA**, **EUMETSAT** and the Creative Commons sources
  listed here are *not* public domain and place conditions on reuse.
- **Commercial use.** The licenses below permit commercial use only where they
  say so (MIT, CC0, CC BY, CC BY-SA and OFL all allow it, subject to conditions
  such as attribution and share-alike). Some upstream terms — for example
  **ESA** content and any imagery carrying a **"Contains modified EUMETSAT
  data"** notice — may require separate permission for commercial or
  operational use. Re-check each source before you monetise a deployment.
- This is an independent hobby work; it is **not affiliated with or endorsed
  by** NASA, ESA, EUMETSAT, CelesTrak or any other provider.
- Provided **"as is", without warranty of any kind**. The author is not a
  scientist, and nothing here is legal advice.

## Runtime libraries — MIT

| Package | Version | License |
|---|---|---|
| [three](https://threejs.org) | 0.167.1 | MIT |
| [react](https://react.dev) | 18.3.1 | MIT |
| [react-dom](https://react.dev) | 18.3.1 | MIT |
| [zustand](https://github.com/pmndrs/zustand) | 4.5.7 | MIT |
| [satellite.js](https://github.com/shashwatak/satellite-js) | 5.0.0 | MIT |

## Build tooling — MIT

| Package | Version | License |
|---|---|---|
| [vite](https://vitejs.dev) | 5.4.21 | MIT |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | 4.7.0 | MIT |

The copyright notices and license texts for these packages are retained in
`node_modules` and in the bundled output. MIT license text:
<https://opensource.org/license/mit>.

## Fonts — SIL Open Font License 1.1

- **Space Mono** — <https://fonts.google.com/specimen/Space+Mono>
- **Inter** — <https://fonts.google.com/specimen/Inter>

Both are loaded via Google Fonts. OFL text: <https://openfontlicense.org>.

## Imagery & textures

- **NASA Visible Earth** — Earth day / night maps ("Blue Marble" / "Black
  Marble"). NASA imagery, generally not copyrighted; credit NASA.
- **NASA LRO Camera Team** — Moon albedo (LROC Hapke normalized mosaic).
  Credit NASA / GSFC / ASU.
- **Pluto global color mosaic** — "Pluto-map-sept-16-2015 (0° longitude)" by
  NASA / JHUAPL / SwRI (New Horizons), retouched by PlanetUser. Licensed under
  **CC BY-SA 4.0**
  (<https://creativecommons.org/licenses/by-sa/4.0/>).
  Source: <https://commons.wikimedia.org/wiki/File:Pluto-map-sept-16-2015_(0%C2%B0_longitude).jpg>
  Shipped as `public/pluto_2k.jpg` (instant base tier) and `public/pluto_8k.jpg`
  (full-resolution tier, streamed in as the camera closes in).
- **NASA SVS "Deep Star Maps 2020" (SVS 4851)** — background star sphere
  (`public/starmap_nasa_4096.jpg`, downscaled from the 8K master). Required
  credit: *"NASA/Goddard Space Flight Center Scientific Visualization Studio.
  Gaia DR2: ESA/Gaia/DPAC."* Built from the Hipparcos-2, Tycho-2 and Gaia DR2
  catalogues (with the Yale BSC, UCAC3 and XHIP contributions). Source:
  <https://svs.gsfc.nasa.gov/4851>.
- **Solar System Scope** — Mercury, Venus, Mars, Jupiter, Saturn, Uranus,
  Neptune, the Saturn rings, and the dwarf planets **Ceres**, **Haumea**,
  **Makemake** and **Eris** (the latter four from the *Fictional* pack).
  Licensed under **CC BY 4.0**
  (<https://creativecommons.org/licenses/by/4.0/>).
  Source: <https://www.solarsystemscope.com/textures/>
  The *Fictional* pack maps are built on NASA elevation and imagery data with
  unmapped regions filled by artist-drawn terrain, so they are illustrative
  reconstructions rather than observational mosaics.
- **Live cloud map** — near-real-time grayscale cloud map of the whole Earth,
  re-composited from **EUMETSAT** data and served by "Live cloud maps"
  (<https://clouds.matteason.co.uk>, code & images under **CC0 1.0**,
  <https://creativecommons.org/publicdomain/zero/1.0/>). The underlying data
  requires the notice **"Contains modified EUMETSAT data"**, shown in the
  in-app Legal panel. Streamed at runtime (2K/4K/8K tiers); the bundled
  `public/earth_clouds_2048.jpg` remains the offline fallback.
  Source: <https://github.com/matteason/live-cloud-maps>
- **ISS 3D model** (`public/models/iss.glb`) — "unaipl2003" on Sketchfab,
  licensed under **CC BY 4.0**
  (<https://creativecommons.org/licenses/by/4.0/>).
  Source: <https://sketchfab.com/3d-models/813f5b296e584c26bf386ca39de6c3d4>
- **Moons** — global surface maps for **Io** (Björn Jónsson,
  attribution-only), **Europa** (USGS / Paul Schenk, CC0), **Ganymede**,
  **Callisto**, **Phobos** and **Deimos** (maps by Askaniy, **CC BY-SA 3.0**,
  <https://creativecommons.org/licenses/by-sa/3.0/>), **Titan** and
  **Enceladus** (NASA/JPL), **Triton** (NASA/JPL/LPI, Voyager) and **Charon**
  (NASA/JHUAPL/SwRI, New Horizons). Shipped in `public/` as `io_2k.jpg`,
  `europa_2k.jpg`, `ganymede_2k.jpg`, `callisto_2k.jpg`, `titan_2k.jpg`,
  `enceladus_2k.jpg`, `triton_2k.jpg`, `charon_2k.jpg`, `phobos_2k.jpg` and
  `deimos_2k.jpg`. Every other moon is drawn with a procedurally generated,
  body-coloured placeholder.
- **Dwarf planets** — the surfaces of **Ceres**, **Haumea**, **Makemake** and
  **Eris** come from the Solar System Scope *Fictional* pack (CC BY 4.0, see
  above), shipped as `{ceres,haumea,makemake,eris}_{2k,4k}.jpg`. Every other
  dwarf planet is drawn with a procedurally generated, body-coloured
  placeholder.

Surface maps ship as a 2K base plus 4K/8K hi-res tiers streamed in by camera
proximity, and may also be provided as WebP re-encodes of the same source
masters (smaller transfer size). Every tier and re-encode is a **derivative**
of its source master — downscaled and/or re-encoded — and so keeps the source's
license unchanged: the CC BY-SA maps (Pluto, Ganymede, Callisto, Phobos,
Deimos) remain **CC BY-SA** as redistributed here.

## Planetary body 3D shape models

- **Phobos and Deimos** (`public/models/phobos.glb`,
  `public/models/deimos.glb`) — NASA Science 3D models credited to
  **NASA/JPL-Caltech**. Source pages:
  <https://science.nasa.gov/resource/phobos-mars-moon-3d-model/> and
  <https://science.nasa.gov/resource/deimos-mars-moon-3d-model/>.
  The bundled GLBs are used only for their named bodies; NASA-provided mesh
  dimensions agree with the catalogued triaxial axes to within 15%. Other bodies
  continue to use the existing renderer unless a verified shape asset is added.

## Spacecraft 3D models

- **NASA 3D Resources** — Hubble, Chandra, TESS, Swift, Terra, Aqua, Fermi,
  LRO, Parker Solar Probe, STEREO, MMS, THEMIS, Aura, CALIPSO, CloudSat,
  ICESat-2, GRACE, Jason-2, Sentinel-6, Landsat 8, Suomi NPP, GPM, SDO,
  Hinode, TDRS, Voyager 1/2, Pioneer 10/11, Juno, Mars Reconnaissance Orbiter,
  Mars Odyssey and New Horizons models from
  <https://science.nasa.gov/3d-resources/> (GitHub mirror:
  <https://github.com/nasa/NASA-3D-Resources>). NASA assets are free to
  download and use; credit NASA. New Horizons is merged from NASA's official
  STL print kit (`tools/build_new_horizons_glb.mjs`), since NASA publishes no
  GLB for it. Stored in `public/models/` and loaded on demand.
- **GLONASS-M and Galileo FOC** (`public/models/glonass.glb`,
  `public/models/galileo.glb`) — procedural chassis generated in-house from
  published dimensions (`tools/build_glonass_glb.mjs`,
  `tools/build_galileo_glb.mjs`); no third-party asset is used.
- **ISS** (`public/models/iss.glb`) — see the CC BY 4.0 entry above.

## Draco decoder

- **Draco** (`public/draco/`) — Google's mesh compression decoder, bundled via
  the `three.js` distribution to decompress the Draco-compressed NASA GLB
  models. Licensed under **Apache License 2.0**
  (<https://www.apache.org/licenses/LICENSE-2.0>).
  Source: <https://github.com/google/draco>.

## Data

- **CelesTrak / US Space Command** — NORAD GP element sets (TLE / 3LE).
  Public-domain US Government data, redistributed via
  <https://celestrak.org>. CelesTrak is a free service; keep request rates
  reasonable and cache locally (the app does both).
- **Wikipedia** — mission-description extracts, retrieved live through the
  MediaWiki API and displayed under **CC BY-SA 4.0**
  (<https://creativecommons.org/licenses/by-sa/4.0/>). Text is *not* bundled;
  it is fetched on demand and attributed with a link to the source article.
- **NASA/JPL Small-Body Database (SBDB)** — osculating heliocentric orbital
  elements for the dwarf planets (Ceres, Orcus, Haumea, Quaoar, Makemake,
  Gonggong, Eris, Sedna, Salacia), epoch JD 2461200.5.
  Source: <https://ssd-api.jpl.nasa.gov/sbdb.api>.
- **NASA/JPL Planetary Satellite Mean Elements** — mean parent-relative orbital
  elements for the moons (Phobos, Deimos, the four Galileans, the major
  Saturnians, the major Uranians, Triton, Charon and the dwarf-planet moons).
  Source: <https://ssd.jpl.nasa.gov/sats/elem/>.

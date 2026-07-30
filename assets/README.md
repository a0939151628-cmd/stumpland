# Assets

Everything here is CC0 (public domain). No attribution required, none assumed.

## In the repo

`public/models/` — 31 GLB files, 444 KB, copied from the kit below.
These are the only assets the build touches.

## Source kits

`assets/src/` is gitignored — it holds the full downloaded kits, which are
large and not needed to build.

| Kit | License | Source | Used for |
|---|---|---|---|
| Kenney Nature Kit 2.1 | CC0 1.0 | https://kenney.nl/assets/nature-kit | trees, stumps, fences, rocks, grass, ground tiles, wheat, dirt rows, logs |

To restore the source kit:

```
curl -L -o assets/src/kenney_nature-kit.zip \
  "https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip"
unzip -q assets/src/kenney_nature-kit.zip -d assets/src/kenney_nature
```

## Livestock: placeholders, pending Quaternius

The livestock, dog and cat currently render as simple flat-shaded box shapes
built in `src/renderer/livestock.ts`. They are stand-ins.

The intended source is Quaternius' **Ultimate Animated Animals** pack (CC0,
confirmed on the pack page). It is distributed through a Google Drive folder
rather than a direct link, so it could not be fetched automatically:

  https://quaternius.com/packs/ultimateanimatedanimals.html
  https://drive.google.com/drive/folders/1uJ3N5HfB7jKTseJUNQr3N4YaN0UuEtHk

To drop the real models in:

1. Download the pack from the Drive folder above.
2. Copy the GLB files for hen, rabbit, goat, sheep, pig, ox, dog and cat into
   `public/models/`.
3. In `src/renderer/livestock.ts`, replace the `beast()` builder with a
   `loadGeometry()` call per kind. The pens, speeds and footprints are already
   sized for real models, so nothing else needs to move.

A figure for the farmer (Quaternius Ultimate Modular Men, also CC0) is not in
yet either.

## Rule

Anything that is not CC0 or public domain gets asked about before it goes in.

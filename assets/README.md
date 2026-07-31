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

## Livestock: drop-in ready

The game looks for these eight files in `public/models/`. Any that are
present are used; any that are missing fall back to a simple flat-shaded
stand-in. **No code changes are needed** — drop the files in and restart.

| file | stands (tiles) |
|---|---|
| `animal_hen.glb` | 0.26 |
| `animal_rabbit.glb` | 0.20 |
| `animal_goat.glb` | 0.52 |
| `animal_sheep.glb` | 0.55 |
| `animal_pig.glb` | 0.50 |
| `animal_ox.glb` | 0.90 |
| `animal_dog.glb` | 0.42 |
| `animal_cat.glb` | 0.28 |

Scale does not matter. Whatever size the pack is authored at, each model is
re-centred, sat on the ground and scaled to the height above. Materials are
repainted through the same muted palette as everything else, so a pack with
brighter colours will still sit in the scene.

When a file is found the console says so:

```
[animals] ox: loaded animal_ox.glb, scaled to 0.9 tiles
```

### Where to get them

Quaternius' **Ultimate Animated Animals** and **Farm Animals** packs, both
CC0 on his own site:

  https://quaternius.com/packs/ultimateanimatedanimals.html
  https://quaternius.com/packs/farmanimal.html

Both are distributed through a Google Drive folder, which is why they are not
fetched automatically:

  https://drive.google.com/drive/folders/1uJ3N5HfB7jKTseJUNQr3N4YaN0UuEtHk

Download, pick the eight animals, and rename them to the filenames above.

**A warning about mirrors.** poly.pizza hosts the same Quaternius models but
labels them *Creative Commons Attribution 3.0*, not CC0. That contradicts
quaternius.com. Take them from Quaternius directly, or accept the attribution
requirement knowingly — do not assume the mirror is CC0.

Animations are not played. The models are used in their bind pose and moved by
slow lerping between waypoints, which is what the game asks for.

A figure for the farmer (Quaternius Ultimate Modular Men, also CC0) is not in
yet either.

## Rule

Anything that is not CC0 or public domain gets asked about before it goes in.

/**
 * Stitch a sequence of PNGs into an animated GIF.
 *
 *   node scripts/gif.cjs out.gif 12 frame-a.png frame-b.png ...
 *
 * Pure JavaScript — no ffmpeg, no ImageMagick, nothing to install on the
 * machine. Frames are box-filtered down, then quantized once against a
 * palette built from every frame so the animation does not shimmer.
 */

const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

const args = process.argv.slice(2);
const out = args[0];
const delayCs = Number(args[1] ?? 40);
const files = args.slice(2);

if (!out || files.length === 0) {
  console.error('usage: node scripts/gif.cjs out.gif <delay-cs> frame.png ...');
  process.exit(1);
}

/** Target width; height follows the source aspect. */
const WIDTH = 900;

/** Simple box filter. Good enough for flat-shaded low-poly. */
function downscale(png, targetW) {
  const scale = png.width / targetW;
  const targetH = Math.round(png.height / scale);
  const out = new Uint8Array(targetW * targetH * 4);

  for (let y = 0; y < targetH; y++) {
    const sy0 = Math.floor(y * scale);
    const sy1 = Math.min(png.height, Math.ceil((y + 1) * scale));
    for (let x = 0; x < targetW; x++) {
      const sx0 = Math.floor(x * scale);
      const sx1 = Math.min(png.width, Math.ceil((x + 1) * scale));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * png.width + sx) * 4;
          r += png.data[i];
          g += png.data[i + 1];
          b += png.data[i + 2];
          n++;
        }
      }
      const o = (y * targetW + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: targetW, height: targetH };
}

const frames = files.map((f) => {
  const png = PNG.sync.read(fs.readFileSync(f));
  return downscale(png, WIDTH);
});

// One palette for the whole animation. Built from a sample of every frame
// so no single frame's colours dominate and the others shimmer against it.
const sample = [];
for (const f of frames) {
  for (let i = 0; i < f.data.length; i += 4 * 13) {
    sample.push(f.data[i], f.data[i + 1], f.data[i + 2], 255);
  }
}
const palette = quantize(new Uint8Array(sample), 256, { format: 'rgb444' });

const gif = GIFEncoder();
for (const f of frames) {
  const indexed = applyPalette(f.data, palette, 'rgb444');
  gif.writeFrame(indexed, f.width, f.height, { palette, delay: delayCs * 10 });
}
gif.finish();

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(gif.bytes()));
const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`wrote ${out} — ${frames.length} frames, ${frames[0].width}x${frames[0].height}, ${kb} KB`);

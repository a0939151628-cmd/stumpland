/**
 * Render the scene to a PNG without a human looking at it.
 *
 *   npm run shot                    -- day one
 *   npm run shot -- 5               -- after five years
 *   npm run shot -- 5 shots/y5.png  -- and where to put it
 *
 * Loads the built page, waits for the first frames, captures, exits.
 */

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const years = Number(args[0] ?? 0);
const outArg = args[1] ?? `shots/year-${years}.png`;
const zoom = args[2];
const hour = args[3];
const day = args[4];
const cloud = args[5];
const force = args[6];
const journal = args[7];
const out = path.isAbsolute(outArg) ? outArg : path.join(__dirname, '..', outArg);

const WIDTH = 1920;
const HEIGHT = 1080;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    backgroundColor: '#2b2f31',
    webPreferences: { offscreen: false, contextIsolation: true },
  });

  const file = path.join(__dirname, '..', 'dist', 'index.html');
  if (!fs.existsSync(file)) {
    console.error('No build found. Run `npm run build` first.');
    app.exit(1);
    return;
  }

  await win.loadFile(file, { search: `years=${years}${zoom ? `&zoom=${zoom}` : ''}${hour ? `&hour=${hour}` : ''}${day ? `&day=${day}` : ''}${cloud !== undefined ? `&cloud=${cloud}` : ''}${force ? `&force=${force}` : ''}${journal ? `&journal=1` : ''}` });

  // Let the loop run long enough for the camera swing and a few frames.
  await new Promise((r) => setTimeout(r, 3500));

  const image = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, image.toPNG());
  console.log(`wrote ${out} (${WIDTH}x${HEIGHT})`);

  win.destroy();
  app.exit(0);
});

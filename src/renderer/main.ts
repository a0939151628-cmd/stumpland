/**
 * Renderer entry. Owns the canvas, the loop, and the input.
 * Reads snapshots from the host. Writes nothing back except actions.
 */

import * as THREE from 'three';
import { GameHost } from '../game/host.js';
import { Snapshot } from '../game/snapshot.js';
import { SceneView } from './scene.js';
import { CameraRig } from './camera.js';
import { ACTIONS, ACTION_ORDER } from '../sim/actions.js';
import { seasonOfDay, dayInSeason, daylightHours } from '../sim/calendar.js';
import { countTiles } from '../sim/grid.js';
import { initialState, hourOfDay, type GameState } from '../sim/state.js';
import { diligent, playYears } from '../testkit/policies.js';

// Debug affordance: ?years=5&seed=1 fast-forwards a played farm, so a
// screenshot can show an established plot rather than day one.
const params = new URLSearchParams(location.search);
const host = new GameHost(initialState(Number(params.get('seed') ?? 1)));
const years = Number(params.get('years') ?? 0);
const zoomParam = params.get('zoom');
/** Debug: pin the clock to a given hour instead of following the day. */
let hourOverride: number | null = params.has('hour') ? Number(params.get('hour')) : null;
if (years > 0) {
  host.mutate((s) => playYears(s, years, diligent));
}
// Debug: jump to a day of the year without playing to it.
if (params.has('day')) {
  const d = Number(params.get('day'));
  host.mutate((s) => {
    s.dayOfYear = d;
    s.hoursLeft = daylightHours(d);
    // A teleport, not a thaw: clear weather the intervening days would
    // have dealt with, so the shot shows this day and not the last one.
    for (const t of s.plot.tiles) {
      t.snow = 0;
      t.puddle = 0;
    }
  });
}
if (params.has('cloud')) {
  const c = Number(params.get('cloud'));
  host.mutate((s) => { s.weather.cloud = c; s.weather.precip = 0; });
}
// Debug: force a front and let it settle for a few days, so snow lies
// and puddles stand the way they would if you had lived through it.
if (params.has('force')) {
  const front = params.get('force') as never;
  const settle = Number(params.get('settle') ?? 4);
  const target = host.view.dayOfYear;
  for (let i = 0; i < settle; i++) {
    host.mutate((s) => {
      s.weather.frontType = front;
      s.weather.frontDaysLeft = 99;
    });
    host.perform('sleep');
  }
  host.mutate((s) => { s.dayOfYear = target; s.hoursLeft = daylightHours(target); });
}

const view = new SceneView();
const rig = new CameraRig();

const canvas = document.getElementById('view') as HTMLCanvasElement;
const panel = document.getElementById('panel') as HTMLDivElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  rig.resize(w, h, panel.getBoundingClientRect().width);
}
window.addEventListener('resize', resize);
resize();
if (zoomParam) rig.zoomBy(Number(zoomParam) - 13);

// —— input: pan, zoom, swing. No free orbit. ——

let dragging = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', (e) => {
  dragging = false;
  canvas.releasePointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const scale = 0.03;
  rig.pan(-(e.clientX - lastX) * scale, -(e.clientY - lastY) * scale);
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    rig.zoomBy(e.deltaY * 0.01);
  },
  { passive: false }
);
const journalEl = document.getElementById('journal') as HTMLDivElement;
const journalPage = document.getElementById('journal-page') as HTMLDivElement;

function renderJournal(s: Snapshot): void {
  const entries = [...s.journal].reverse();
  journalPage.innerHTML =
    '<h2>The journal</h2>' +
    (entries.length === 0
      ? '<p class="empty">Nothing written yet. The first entry comes at the end of the season.</p>'
      : entries
          .map(
            (e) =>
              `<div class="entry"><p class="when">Year ${e.year}, ${e.season}</p>` +
              `<p class="text">${e.text}</p></div>`
          )
          .join('')) +
    '<button class="close" id="journal-close">close</button>';
  const close = document.getElementById('journal-close');
  close?.addEventListener('click', () => journalEl.classList.remove('open'));
}

function toggleJournal(): void {
  const opening = !journalEl.classList.contains('open');
  if (opening) renderJournal(host.view);
  journalEl.classList.toggle('open', opening);
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'j' || e.key === 'J') toggleJournal();
  if (e.key === 'Escape' && journalEl.classList.contains('open')) {
    journalEl.classList.remove('open');
    return;
  }
  if (e.key === 'r' || e.key === 'R') rig.swingAround();
  // Debug: scrub the hour with [ and ], escape back to real time.
  if (e.key === '[' || e.key === ']') {
    const base = hourOverride ?? hourOfDay(host.view as unknown as GameState);
    hourOverride = (base + (e.key === ']' ? 1 : -1) + 24) % 24;
    view.setLight(host.view, hourOverride);
  }
  if (e.key === 'Escape') {
    hourOverride = null;
    view.setLight(host.view, hourOfDay(host.view as unknown as GameState));
  }
});

// —— the panel: actions and the day's state ——

function render(s: Snapshot): void {
  const season = seasonOfDay(s.dayOfYear);
  const stumps = countTiles(s.plot as never, (t) => t.stump);
  const standing = countTiles(s.plot as never, (t) => t.crop !== null && t.crop.stage !== 'ruined');

  const rows = ACTION_ORDER.filter((id) => id !== 'sleep')
    .map((id) => {
      const a = ACTIONS[id];
      if (!a) return '';
      const avail = a.available(s as unknown as GameState);
      const cost = a.stamina < 0 ? `${a.hours}h` : `${a.hours}h ${a.stamina}st`;
      return avail.ok
        ? `<button data-action="${id}">${a.label}<span>${cost}</span></button>`
        : `<button disabled>${a.label}<span>${avail.reason}</span></button>`;
    })
    .join('');

  panel.innerHTML = `
    <h1>Year ${s.year}, ${season} day ${dayInSeason(s.dayOfYear)}</h1>
    <p class="weather">${s.weather.todaysLine}</p>
    <p class="vitals">${s.hoursLeft.toFixed(1)}h light &middot; ${Math.round(s.person.stamina)} stamina</p>
    <p class="stores">grain ${Math.round(s.store.grain)} &middot; firewood ${s.store.firewood} &middot; meat ${s.store.meat + s.store.smokedMeat}</p>
    <p class="stores">${stumps} stumps &middot; ${standing} standing</p>
    <div class="actions">${rows}</div>
    <button class="sleep" data-action="sleep">sleep</button>
    <p class="log">${s.log.slice(-6).join('<br>')}</p>
  `;
}

panel.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest('button');
  const id = target?.getAttribute('data-action');
  if (id) host.perform(id);
});

host.subscribe((s) => {
  view.update(s);
  view.setLight(s, hourOverride ?? hourOfDay(s as unknown as GameState));
  render(s);
});

if (params.has('journal')) {
  renderJournal(host.view);
  journalEl.classList.add('open');
}

// Models arrive after the first frames; the scene fills in when they do.
view.load().then(
  () => {
    view.update(host.view);
    view.setLight(host.view, hourOverride ?? hourOfDay(host.view as unknown as GameState));
    (window as unknown as { __ready?: boolean }).__ready = true;
  },
  (err: unknown) => console.error('assets failed to load', err)
);

// —— loop ——

let last = performance.now();
let frameMs = 16;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  // Smoothed frame time, so one slow frame does not strip the weather.
  frameMs = frameMs * 0.9 + (now - last) * 0.1;
  last = now;
  rig.update(dt);
  view.animate(dt, frameMs);
  renderer.render(view.scene, rig.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

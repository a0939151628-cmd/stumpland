import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const simDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/sim');

function simFiles(): string[] {
  return fs
    .readdirSync(simDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => path.join(simDir, f));
}

describe('the simulation is headless', () => {
  const banned: [RegExp, string][] = [
    [/\bfrom\s+['"]three['"]/, 'imports three.js'],
    [/\bfrom\s+['"].*\/renderer\//, 'imports from the renderer'],
    [/\bdocument\./, 'touches document'],
    [/\bwindow\./, 'touches window'],
    [/\bcanvas\b/i, 'mentions canvas'],
    [/\brequestAnimationFrame\b/, 'uses requestAnimationFrame'],
    [/\blocalStorage\b/, 'uses localStorage'],
    [/\bfrom\s+['"]node:fs['"]/, 'reads the filesystem'],
  ];

  for (const file of simFiles()) {
    it(`${path.basename(file)} has no rendering or platform dependencies`, () => {
      // Strip comments — the rule is about what the code does, and these
      // files talk about what they deliberately avoid.
      const src = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const [pattern, why] of banned) {
        expect(pattern.test(src), `${path.basename(file)} ${why}`).toBe(false);
      }
    });
  }

  it('runs in plain Node with no globals beyond the language', async () => {
    // If this imports and steps without a DOM present, it is headless enough.
    const { initialState } = await import('../src/sim/state.js');
    const { doAction } = await import('../src/sim/step.js');
    const s = initialState(1);
    for (let i = 0; i < 100; i++) doAction(s, 'sleep');
    expect(s.year).toBeGreaterThan(1);
  });
});

describe('the world snapshot is plain data', () => {
  it('survives a round trip through JSON', async () => {
    const { initialState } = await import('../src/sim/state.js');
    const { doAction } = await import('../src/sim/step.js');
    const s = initialState(9);
    for (let i = 0; i < 40; i++) doAction(s, 'sleep');

    const clone = JSON.parse(JSON.stringify(s)) as typeof s;
    expect(clone.plot.tiles.length).toBe(s.plot.tiles.length);
    expect(clone.weather.tempC).toBe(s.weather.tempC);
    expect(clone.dayOfYear).toBe(s.dayOfYear);
    // No functions, no class instances, nothing a renderer could mutate by accident.
    expect(JSON.stringify(clone)).toBe(JSON.stringify(s));
  });
});

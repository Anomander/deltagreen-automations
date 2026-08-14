/**
 * Localisation keys, checked in both directions: a key referenced in code that
 * does not exist renders as raw `DGA.Something` in the UI, and a key that
 * nothing references is dead weight nobody notices.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const en = JSON.parse(fs.readFileSync('lang/en.json', 'utf8'));

function walk(dir, extensions) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, extensions);
    return extensions.some((ext) => entry.name.endsWith(ext)) ? [full] : [];
  });
}

const sources = [...walk('scripts', ['.js']), ...walk('templates', ['.hbs'])];
const corpus = sources.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

/** Keys written literally. Keys built at runtime are handled separately. */
const referenced = new Set([...corpus.matchAll(/["'`](DGA\.[A-Za-z0-9_.]+)["'`]/g)].map((m) => m[1]));

describe('lang/en.json', () => {
  it('has no empty values', () => {
    expect(Object.entries(en).filter(([, value]) => !String(value).trim())).toEqual([]);
  });

  it('defines every key the code references literally', () => {
    expect([...referenced].filter((key) => !(key in en))).toEqual([]);
  });

  it('has no key nothing references', () => {
    // The choice labels are built as `DGA.${group}.${value}` from the enums in
    // constants.js, so they are resolved against those rather than the corpus.
    const constants = fs.readFileSync('scripts/constants.js', 'utf8');
    const enumValues = new Set([...constants.matchAll(/^\s+[A-Z_]+: "([a-z-]+)"/gm)].map((m) => m[1]));

    const orphans = Object.keys(en).filter((key) => {
      if (referenced.has(key)) return false;
      const [, group, value] = key.split('.');
      return !(['Trigger', 'Outcome', 'Placement'].includes(group) && enumValues.has(value));
    });

    expect(orphans).toEqual([]);
  });

  it('defines a label for every enum value the config UI offers', () => {
    const constants = fs.readFileSync('scripts/constants.js', 'utf8');
    const groups = { TRIGGERS: 'Trigger', OUTCOMES: 'Outcome', PLACEMENTS: 'Placement' };

    for (const [name, group] of Object.entries(groups)) {
      const block = constants.slice(constants.indexOf(`export const ${name}`));
      const values = [...block.slice(0, block.indexOf('};')).matchAll(/: "([a-z-]+)"/g)].map((m) => m[1]);

      expect(values.length, name).toBeGreaterThan(0);
      for (const value of values) {
        expect(en, `DGA.${group}.${value}`).toHaveProperty(`DGA.${group}.${value}`);
      }
    }
  });
});

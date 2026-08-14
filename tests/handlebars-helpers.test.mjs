/**
 * Every Handlebars helper our templates call must exist in Foundry.
 *
 * This is not hypothetical: v14 removed the `selected` helper that v13 had.
 * The config template used it, ApplicationV2 swallowed the render error, and
 * the window came up with no rows and no message — "adding a mapping does
 * nothing". Nothing in the template or the code looked wrong.
 *
 * The snapshot is captured from a running world with `npm run fvtt:helpers`.
 * A helper removed by a future Foundry release now fails here instead.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const snapshot = JSON.parse(fs.readFileSync('tests/fixtures/handlebars-helpers.json', 'utf8'));

const templates = fs
  .readdirSync('templates')
  .filter((file) => file.endsWith('.hbs'))
  .map((file) => ({ file, source: fs.readFileSync(path.join('templates', file), 'utf8') }));

/**
 * Helper calls in a template.
 *
 * A mustache is a helper call when its first token is followed by an argument
 * — `{{localize "X"}}` is, `{{mapping.label}}` is not. Subexpressions are
 * matched separately so `{{#if (eq a b)}}` reports `eq` as well as `if`.
 */
function helpersUsed(source) {
  const mustaches = [...source.matchAll(/\{\{[#/]?\s*([a-zA-Z][\w-]*)\s+[^}]/g)].map((m) => m[1]);
  const subexpressions = [...source.matchAll(/\(\s*([a-zA-Z][\w-]*)\s+/g)].map((m) => m[1]);
  return new Set([...mustaches, ...subexpressions]);
}

/** Block parameters and `this`-style paths are not helper calls. */
const NOT_HELPERS = new Set(['as']);

describe('template helpers', () => {
  it('the snapshot came from the Foundry generation the manifest verifies', () => {
    const manifest = JSON.parse(fs.readFileSync('module.json', 'utf8'));
    expect(snapshot.foundry.split('.')[0]).toBe(manifest.compatibility.verified);
  });

  it.each(templates)('$file calls only helpers Foundry registers', ({ source }) => {
    const used = [...helpersUsed(source)].filter((name) => !NOT_HELPERS.has(name));
    expect(used.length).toBeGreaterThan(0);

    const missing = used.filter((name) => !snapshot.helpers.includes(name));
    expect(missing).toEqual([]);
  });

  it('does not use `selected`, which v14 removed', () => {
    // Named explicitly because the generic check above only protects us while
    // the snapshot is current; this one states the defect.
    expect(snapshot.helpers).not.toContain('selected');
    for (const { file, source } of templates) {
      expect(helpersUsed(source).has('selected'), file).toBe(false);
    }
  });
});

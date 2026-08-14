import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('module.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

describe('module.json', () => {
  it('keeps the id the settings namespace is registered under', () => {
    // Every game.settings call passes MODULE_ID; if the two drift, the module
    // loads and then fails on the first setting read.
    const constants = fs.readFileSync('scripts/constants.js', 'utf8');
    expect(constants).toContain(`export const MODULE_ID = "${manifest.id}"`);
  });

  it('agrees with package.json about the version', () => {
    expect(manifest.version).toBe(pkg.version);
  });

  it('declares the system it reads roll data from', () => {
    expect(manifest.relationships.systems.map((s) => s.id)).toContain('deltagreen');
  });

  it('requires Sequencer, which the effect runner calls directly', () => {
    expect(manifest.relationships.requires.map((r) => r.id)).toContain('sequencer');
  });

  it('points every declared path at a file that exists', () => {
    for (const file of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map((l) => l.path)]) {
      expect(fs.existsSync(file), file).toBe(true);
    }
  });

  it('ships a manifest URL that resolves to the latest release', () => {
    expect(manifest.manifest).toMatch(/releases\/latest\/download\/module\.json$/);
  });
});

describe('release packaging', () => {
  const workflow = fs.readFileSync('.github/workflows/release.yml', 'utf8');

  it('zips every directory the manifest references', () => {
    // A path declared in the manifest but left out of the zip produces a module
    // that installs and then 404s at load — invisible to every other test.
    const zipLine = workflow.split('\n').find((line) => line.includes('zip -r'));
    for (const dir of ['scripts', 'styles', 'lang', 'templates']) {
      expect(zipLine, dir).toContain(dir);
    }
  });

  it('does not ship the development tooling', () => {
    const zipLine = workflow.split('\n').find((line) => line.includes('zip -r'));
    expect(zipLine).not.toContain('tools');
    expect(zipLine).not.toContain('tests');
  });
});

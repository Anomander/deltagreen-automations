/**
 * Extract the `deltagreen` system's roll-type vocabulary from an installed copy.
 *
 * The whole module hangs off `roll.options.rollType`, whose values the system
 * sets from `data-rolltype` on its sheets. That list is not documented and is
 * not versioned — a system release can add a type, and our trigger table would
 * silently answer "any" for it forever.
 *
 * Extraction is static text parsing, not import: the system's modules call
 * Foundry globals at module scope and cannot be loaded in Node.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/** The usual places a Foundry data directory lives. */
function candidateDataRoots() {
  const home = os.homedir();
  return [
    path.join(home, 'Library', 'Application Support', 'FoundryVTT', 'Data'),
    path.join(home, '.local', 'share', 'FoundryVTT', 'Data'),
    path.join(home, 'AppData', 'Local', 'FoundryVTT', 'Data'),
    path.join(home, 'foundrydata', 'Data')
  ];
}

/**
 * Locate an installed `deltagreen` system.
 * @param {string} [explicit] - Overrides discovery. Defaults to $DG_SYSTEM_PATH.
 * @returns {string|null} Absolute path to the system root, or null.
 */
export function resolveSystemPath(explicit = process.env.DG_SYSTEM_PATH) {
  if (explicit) {
    return fs.existsSync(path.join(explicit, 'system.json')) ? explicit : null;
  }

  for (const root of candidateDataRoots()) {
    const candidate = path.join(root, 'systems', 'deltagreen');
    if (fs.existsSync(path.join(candidate, 'system.json'))) return candidate;
  }

  return null;
}

/**
 * Every file under a directory, recursively, with one of the given extensions.
 * The system's sheets are `.html`, not `.hbs` — filtering on `.hbs` alone finds
 * nothing and silently reports whatever the roll classes happen to mention.
 */
function walk(dir, extensions) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, extensions);
    return extensions.some((ext) => entry.name.endsWith(ext)) ? [full] : [];
  });
}

/**
 * Read the roll-type vocabulary out of an installed system.
 *
 * Two sources, unioned, because neither alone is complete: `data-rolltype`
 * attributes in the sheet templates are what the click handler reads, and
 * `this.type === "…"` comparisons in the roll classes cover types constructed
 * in code rather than clicked.
 *
 * @param {string} systemPath
 * @returns {{system: {id: string, version: string}, rollTypes: string[]}}
 */
export function extractRollTypes(systemPath) {
  const manifest = JSON.parse(fs.readFileSync(path.join(systemPath, 'system.json'), 'utf8'));

  const fromTemplates = walk(path.join(systemPath, 'templates'), ['.hbs', '.html'])
    .flatMap((file) => [...fs.readFileSync(file, 'utf8').matchAll(/data-rolltype="([a-z-]+)"/g)])
    .map((match) => match[1]);

  const fromClasses = walk(path.join(systemPath, 'module', 'roll'), ['.js'])
    .flatMap((file) => [
      ...fs.readFileSync(file, 'utf8').matchAll(/this\.type\s*===\s*["']([a-z-]+)["']/g),
      ...fs.readFileSync(file, 'utf8').matchAll(/case\s+["']([a-z-]+)["']:/g)
    ])
    .map((match) => match[1]);

  return {
    system: { id: manifest.id, version: manifest.version },
    rollTypes: [...new Set([...fromTemplates, ...fromClasses])].sort()
  };
}

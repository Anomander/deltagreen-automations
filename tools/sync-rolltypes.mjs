/**
 * Re-extract the system's roll-type vocabulary into the committed snapshot.
 *
 *   npm run sync:rolltypes && git diff tests/fixtures/
 *
 * The diff is a precise statement of what the system changed. Read it, fix the
 * trigger table in scripts/core/roll-parse.js if a type moved or appeared, and
 * commit the snapshot in the same commit as the fix.
 */

import fs from 'node:fs';
import path from 'node:path';
import { extractRollTypes, resolveSystemPath } from './system-rolltypes.mjs';

const systemPath = resolveSystemPath();
if (!systemPath) {
  console.error('No installed `deltagreen` system found. Set DG_SYSTEM_PATH.');
  process.exit(1);
}

const snapshot = extractRollTypes(systemPath);
const target = path.join('tests', 'fixtures', 'system-rolltypes.json');

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log(`Wrote ${target} from ${systemPath}`);
console.log(`  system ${snapshot.system.id} ${snapshot.system.version}`);
console.log(`  roll types: ${snapshot.rollTypes.join(', ')}`);

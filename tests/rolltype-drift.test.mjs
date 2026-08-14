/**
 * The system's roll-type vocabulary is what every trigger in this module is
 * keyed on, and it is neither documented nor versioned. This test asserts our
 * table answers for all of it.
 *
 * When the system is installed locally it re-extracts and compares, so drift is
 * caught the day it appears. In CI, where it is not installed, it asserts
 * against the committed snapshot alone — deterministic, still meaningful.
 *
 * A failure here is a signal, not a chore: run `npm run sync:rolltypes`, read
 * the diff, fix ROLL_TYPE_TRIGGERS, then commit the snapshot with the fix.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { ROLL_TYPE_TRIGGERS } from '../scripts/core/roll-parse.js';
import { extractRollTypes, resolveSystemPath } from '../tools/system-rolltypes.mjs';

const snapshot = JSON.parse(fs.readFileSync('tests/fixtures/system-rolltypes.json', 'utf8'));
const systemPath = resolveSystemPath();

describe('system roll types', () => {
  it('every type in the snapshot has a trigger', () => {
    const unmapped = snapshot.rollTypes.filter((type) => !ROLL_TYPE_TRIGGERS[type]);
    expect(unmapped).toEqual([]);
  });

  it('maps no type the system does not have', () => {
    const invented = Object.keys(ROLL_TYPE_TRIGGERS).filter((type) => !snapshot.rollTypes.includes(type));
    expect(invented).toEqual([]);
  });

  it.skipIf(!systemPath)('the snapshot still matches the installed system', () => {
    expect(extractRollTypes(systemPath).rollTypes).toEqual(snapshot.rollTypes);
  });
});

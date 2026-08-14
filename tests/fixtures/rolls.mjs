/**
 * Roll fixtures built from the system's real shapes.
 *
 * Roll types come from the committed snapshot rather than being typed in here,
 * so a fixture that a system change should invalidate does break.
 */

import fs from 'node:fs';

const snapshot = JSON.parse(fs.readFileSync('tests/fixtures/system-rolltypes.json', 'utf8'));

/** Guard against a fixture naming a type the system no longer has. */
export function rollType(type) {
  if (!snapshot.rollTypes.includes(type)) {
    throw new Error(`"${type}" is not a roll type the deltagreen system has: ${snapshot.rollTypes.join(', ')}`);
  }
  return type;
}

/**
 * A roll as it arrives revived from a chat message.
 *
 * `options` is the part the system guarantees survives serialisation; the
 * instance fields (`target`, `isSuccess`, `isCritical`) are present only when
 * the roll revived as DGPercentileRoll, so they are opt-in here.
 */
export function makeRoll({ type = 'skill', key = 'firearms', item, total = 42, ...rest } = {}) {
  return {
    options: {
      rollType: rollType(type),
      key,
      ...(item ? { item: { name: item } } : {})
    },
    total,
    ...rest
  };
}

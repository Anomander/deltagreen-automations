import { describe, expect, it } from 'vitest';
import { matchesContext } from '../scripts/core/matching.js';
import { OUTCOMES, TRIGGERS } from '../scripts/constants.js';

const mapping = (overrides = {}) => ({
  enabled: true,
  effectFile: 'jb2a.bullet.01.orange',
  trigger: TRIGGERS.WEAPON,
  match: '',
  outcome: OUTCOMES.ANY,
  ...overrides
});

const context = (overrides = {}) => ({
  trigger: TRIGGERS.WEAPON,
  outcome: OUTCOMES.SUCCESS,
  name: 'Light Pistol firearms',
  ...overrides
});

describe('matchesContext', () => {
  it('matches on trigger and an empty filter', () => {
    expect(matchesContext(mapping(), context())).toBe(true);
  });

  it('does not fire a mapping with nothing to play', () => {
    // Half-configured rows are the normal state of the config UI; they must not
    // silently "match" and consume the roll.
    expect(matchesContext(mapping({ effectFile: '', sound: '' }), context())).toBe(false);
  });

  it('plays a sound-only mapping', () => {
    expect(matchesContext(mapping({ effectFile: '', sound: 'sounds/shot.ogg' }), context())).toBe(true);
  });

  it('respects the trigger', () => {
    expect(matchesContext(mapping({ trigger: TRIGGERS.SANITY }), context())).toBe(false);
  });

  it('fires an "any roll" mapping on any trigger', () => {
    expect(matchesContext(mapping({ trigger: TRIGGERS.ANY }), context({ trigger: TRIGGERS.SANITY }))).toBe(true);
  });

  it('counts a critical as a success, so one mapping covers the common case', () => {
    expect(matchesContext(mapping({ outcome: OUTCOMES.SUCCESS }), context({ outcome: OUTCOMES.CRITICAL }))).toBe(true);
  });

  it('counts a fumble as a failure', () => {
    expect(matchesContext(mapping({ outcome: OUTCOMES.FAILURE }), context({ outcome: OUTCOMES.FUMBLE }))).toBe(true);
  });

  it('does not widen the narrow outcomes', () => {
    expect(matchesContext(mapping({ outcome: OUTCOMES.CRITICAL }), context({ outcome: OUTCOMES.SUCCESS }))).toBe(false);
  });

  it('does not fire an outcome-specific mapping on a roll with no verdict', () => {
    // Damage rolls have no success. A "on success" mapping must stay silent
    // rather than treat "unknown" as a pass.
    expect(matchesContext(mapping({ outcome: OUTCOMES.SUCCESS }), context({ outcome: OUTCOMES.ANY }))).toBe(false);
  });

  it('matches the name filter case-insensitively, anywhere in the name', () => {
    expect(matchesContext(mapping({ match: 'pistol' }), context())).toBe(true);
    expect(matchesContext(mapping({ match: '  PISTOL ' }), context())).toBe(true);
    expect(matchesContext(mapping({ match: 'shotgun' }), context())).toBe(false);
  });

  it('ignores a disabled mapping', () => {
    expect(matchesContext(mapping({ enabled: false }), context())).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { factsFromRoll, nameFor, outcomeFor, triggerFor } from '../scripts/core/roll-parse.js';
import { OUTCOMES, TRIGGERS } from '../scripts/constants.js';
import { makeRoll } from './fixtures/rolls.mjs';

describe('factsFromRoll', () => {
  it('reads rollType from roll.options, not from message flags', () => {
    // flags.deltagreen carries only `chatCard: true` — there is no outcome or
    // skill name in there to read, which an earlier version assumed.
    expect(factsFromRoll(makeRoll({ type: 'weapon' })).rollType).toBe('weapon');
  });

  it('reports absence rather than inventing a verdict', () => {
    const facts = factsFromRoll(makeRoll());
    expect(facts.isSuccess).toBeUndefined();
    expect(facts.target).toBeUndefined();
  });

  it('treats the system\'s null verdict on an unevaluated roll as absence', () => {
    // DGPercentileRoll#isSuccess returns null, not false, before evaluation —
    // taking that as "failed" would fire every failure mapping on a bare roll.
    const facts = factsFromRoll(makeRoll({ isSuccess: null, isCritical: null }));
    expect(facts.isSuccess).toBeUndefined();
    expect(facts.isCritical).toBeUndefined();
  });

  it('prefers effectiveTarget, which is what the system judges against', () => {
    const facts = factsFromRoll(makeRoll({ target: 50, effectiveTarget: 70 }));
    expect(facts.target).toBe(70);
  });
});

describe('triggerFor', () => {
  it('maps special-training to a skill roll', () => {
    expect(triggerFor({ rollType: 'special-training' })).toBe(TRIGGERS.SKILL);
  });

  it('maps lethality to a damage roll', () => {
    expect(triggerFor({ rollType: 'lethality' })).toBe(TRIGGERS.DAMAGE);
  });

  it('maps sanity-damage to sanity, not damage', () => {
    expect(triggerFor({ rollType: 'sanity-damage' })).toBe(TRIGGERS.SANITY);
  });
});

describe('nameFor', () => {
  it('leads with the item name, since an attack is identified by its weapon', () => {
    const facts = factsFromRoll(makeRoll({ type: 'weapon', key: 'firearms', item: 'Light Pistol' }));
    expect(nameFor(facts)).toContain('Light Pistol');
  });

  it('keeps the raw key so a filter can match either it or the label', () => {
    const facts = { key: 'first_aid', localizedKey: 'First Aid' };
    expect(nameFor(facts).toLowerCase()).toContain('first_aid');
    expect(nameFor(facts).toLowerCase()).toContain('first aid');
  });

  it('does not repeat a name that appears twice', () => {
    expect(nameFor({ key: 'dodge', localizedKey: 'dodge' })).toBe('dodge');
  });
});

describe('outcomeFor', () => {
  it('uses the system\'s own verdict when the roll carries one', () => {
    // Even against a target our arithmetic would judge differently: the system
    // owns success, and modifiers we cannot see are already in its answer.
    expect(outcomeFor({ total: 60, target: 50, isSuccess: true, isCritical: false })).toBe(OUTCOMES.SUCCESS);
  });

  it('computes the same rule the system does when no verdict survived', () => {
    expect(outcomeFor({ total: 40, target: 50 })).toBe(OUTCOMES.SUCCESS);
    expect(outcomeFor({ total: 60, target: 50 })).toBe(OUTCOMES.FAILURE);
  });

  it('treats doubles as critical, in both directions', () => {
    expect(outcomeFor({ total: 22, target: 50 })).toBe(OUTCOMES.CRITICAL);
    expect(outcomeFor({ total: 66, target: 50 })).toBe(OUTCOMES.FUMBLE);
  });

  it('fails 100 even against a target of 99', () => {
    expect(outcomeFor({ total: 100, target: 99 })).toBe(OUTCOMES.FUMBLE);
  });

  it('criticals on 1', () => {
    expect(outcomeFor({ total: 1, target: 30 })).toBe(OUTCOMES.CRITICAL);
  });

  it('has no opinion about a damage roll, which has no target', () => {
    expect(outcomeFor(factsFromRoll(makeRoll({ type: 'damage', key: undefined, total: 7 })))).toBe(OUTCOMES.ANY);
  });
});

/**
 * Everything that can be decided about a roll without Foundry.
 *
 * No `game`, no `canvas`, no `Roll` — this file takes plain data and returns
 * plain data, so the trigger and outcome rules are unit-testable headless.
 * The Foundry-facing half lives in ../system-adapter.js.
 */

import { OUTCOMES, TRIGGERS } from "../constants.js";

/**
 * How the system's own `rollType` vocabulary maps onto our triggers.
 *
 * The keys are the values the system puts in `roll.options.rollType`, which it
 * reads from `data-rolltype` on its sheets. `tests/rolltype-drift.test.mjs`
 * fails if the system grows a type this table does not answer for.
 */
export const ROLL_TYPE_TRIGGERS = {
  skill: TRIGGERS.SKILL,
  "special-training": TRIGGERS.SKILL,
  stat: TRIGGERS.STAT,
  luck: TRIGGERS.STAT,
  weapon: TRIGGERS.WEAPON,
  damage: TRIGGERS.DAMAGE,
  lethality: TRIGGERS.DAMAGE,
  "damage-or-lethality": TRIGGERS.DAMAGE,
  sanity: TRIGGERS.SANITY,
  "sanity-damage": TRIGGERS.SANITY
};

/**
 * A roll, reduced to the fields this module reads.
 *
 * @typedef {object} RollFacts
 * @property {string}  [rollType]   `roll.options.rollType`.
 * @property {string}  [key]        `roll.options.key` — skill or stat key.
 * @property {string}  [itemName]   Name of the item the roll came from.
 * @property {string}  [localizedKey] The system's display label, when revived.
 * @property {number}  total
 * @property {number}  [target]     Effective target, when the roll revived with one.
 * @property {boolean} [isSuccess]  The system's own verdict, when available.
 * @property {boolean} [isCritical] The system's own verdict, when available.
 */

/** @returns {string} one of TRIGGERS */
export function triggerFor(facts) {
  return ROLL_TYPE_TRIGGERS[facts.rollType] ?? TRIGGERS.ANY;
}

/**
 * The name a mapping's "Name Contains" filter is tested against.
 *
 * Item name first: an attack roll's useful identity is the weapon, not the
 * `firearms` skill it happens to be based on. Skill key is a fallback, and it
 * is returned raw (`first_aid`) alongside the localized label so a filter can
 * match either.
 *
 * @returns {string}
 */
export function nameFor(facts) {
  const parts = [facts.itemName, facts.localizedKey, facts.key].filter(
    (part) => typeof part === "string" && part.trim().length
  );
  return [...new Set(parts)].join(" ");
}

/**
 * The roll's outcome.
 *
 * The system owns success and criticality (`DGPercentileRoll#isSuccess` /
 * `#isCritical`), so its verdict is used whenever the roll revived far enough
 * to have one. The arithmetic below is the same rule, and exists only for the
 * case where it did not — it must never disagree.
 *
 * @returns {string} one of OUTCOMES
 */
export function outcomeFor(facts) {
  const critical = facts.isCritical ?? computeCritical(facts);
  const success = facts.isSuccess ?? computeSuccess(facts);

  if (success === null) return OUTCOMES.ANY;
  if (critical) return success ? OUTCOMES.CRITICAL : OUTCOMES.FUMBLE;
  return success ? OUTCOMES.SUCCESS : OUTCOMES.FAILURE;
}

/** 1, 100, and doubles. Mirrors DGPercentileRoll#isCritical. */
function computeCritical(facts) {
  const total = facts.total;
  if (!Number.isFinite(total) || total <= 0) return null;
  return total === 1 || total === 100 || total % 11 === 0;
}

/** Mirrors DGPercentileRoll#isSuccess: 100 always fails, otherwise <= target. */
function computeSuccess(facts) {
  const { total, target } = facts;
  if (!Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(target)) return null;
  if (total === 100) return false;
  return total <= target;
}

/**
 * Reduce a roll — live or revived from a chat message — to RollFacts.
 *
 * `roll.options` is the only part the system guarantees survives into the
 * message; the instance fields (`target`, `isSuccess`) are present only when
 * the roll revived as its own class, so each is read defensively.
 *
 * @param {object} roll
 * @returns {RollFacts}
 */
export function factsFromRoll(roll) {
  const options = roll?.options ?? {};

  return {
    rollType: options.rollType ?? roll?.type,
    key: options.key ?? roll?.key,
    itemName: options.item?.name ?? roll?.item?.name,
    localizedKey: typeof roll?.localizedKey === "string" ? roll.localizedKey : undefined,
    total: roll?.total,
    target: numberOrUndefined(roll?.effectiveTarget ?? roll?.target),
    isSuccess: booleanOrUndefined(roll?.isSuccess),
    isCritical: booleanOrUndefined(roll?.isCritical)
  };
}

function numberOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/** The system's getters return `null` for an unevaluated roll — not a verdict. */
function booleanOrUndefined(value) {
  return typeof value === "boolean" ? value : undefined;
}

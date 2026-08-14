/**
 * Does a mapping apply to a roll? Pure, so every rule below is unit-testable.
 */

import { OUTCOMES, TRIGGERS } from "../constants.js";

/**
 * @param {object} mapping
 * @param {{trigger: string, outcome: string, name: string}} context
 * @returns {boolean}
 */
export function matchesContext(mapping, context) {
  if (!mapping.enabled) return false;
  // A mapping with nothing to play is configuration in progress, not a match.
  if (!mapping.effectFile && !mapping.sound) return false;

  if (mapping.trigger !== TRIGGERS.ANY && mapping.trigger !== context.trigger) return false;
  if (!outcomeMatches(mapping.outcome, context.outcome)) return false;

  const needle = (mapping.match ?? "").trim().toLowerCase();
  if (needle && !(context.name ?? "").toLowerCase().includes(needle)) return false;

  return true;
}

/**
 * `Success` includes criticals and `Failure` includes fumbles, so the common
 * case needs one mapping rather than two. The narrow options do not widen.
 */
function outcomeMatches(wanted, actual) {
  if (wanted === OUTCOMES.ANY) return true;
  if (wanted === OUTCOMES.SUCCESS) return actual === OUTCOMES.SUCCESS || actual === OUTCOMES.CRITICAL;
  if (wanted === OUTCOMES.FAILURE) return actual === OUTCOMES.FAILURE || actual === OUTCOMES.FUMBLE;
  return wanted === actual;
}

import { MODULE_ID } from "./constants.js";
import { factsFromRoll, nameFor, outcomeFor, triggerFor } from "./core/roll-parse.js";

/**
 * The Foundry-facing half of roll detection: resolve documents, then hand the
 * roll itself to the pure rules in core/roll-parse.js.
 *
 * The `deltagreen` system publishes no roll hook and writes no outcome flag —
 * `flags.deltagreen` carries only `chatCard: true`. What it does carry is
 * `roll.options.rollType` and `roll.options.key`, set in DGRoll's constructor
 * and serialised into the message with the roll. Those are the signals here.
 *
 * @typedef {object} RollContext
 * @property {string}   trigger  One of TRIGGERS.
 * @property {string}   name     Weapon / skill name the filter matches against.
 * @property {string}   outcome  One of OUTCOMES.
 * @property {Actor}    actor
 * @property {Token}    token    Best-guess token for the acting actor.
 * @property {Token[]}  targets  Targets held by the rolling user.
 * @property {Roll}     roll
 * @property {object}   facts    The reduced roll data the decision was made on.
 */

/**
 * @param {ChatMessage} message
 * @param {{debug?: boolean}} [options]
 * @returns {RollContext|null}
 */
export function buildRollContext(message, { debug = false } = {}) {
  const roll = message.rolls?.[0];
  if (!roll) return null;

  const facts = factsFromRoll(roll);

  if (debug) {
    console.log(`${MODULE_ID} | roll observed`, {
      facts,
      rollClass: roll.constructor?.name,
      options: roll.options,
      flags: message.flags
    });
  }

  // A roll with no recognised type is not ours to act on. Bailing here keeps
  // "Any Roll" mappings from firing on every unrelated /r in chat.
  if (!facts.rollType) return null;

  const actor = resolveActor(message);

  return {
    trigger: triggerFor(facts),
    name: nameFor(facts),
    outcome: outcomeFor(facts),
    actor,
    token: resolveToken(message, actor),
    targets: resolveTargets(message),
    roll,
    facts
  };
}

function resolveActor(message) {
  const speaker = message.speaker ?? {};
  if (speaker.token) {
    const scene = game.scenes.get(speaker.scene);
    const tokenDoc = scene?.tokens.get(speaker.token);
    if (tokenDoc?.actor) return tokenDoc.actor;
  }
  return game.actors.get(speaker.actor) ?? null;
}

/** The placeable on the current canvas, since Sequencer animates placeables. */
function resolveToken(message, actor) {
  const speaker = message.speaker ?? {};
  if (speaker.token && speaker.scene === canvas.scene?.id) {
    const placed = canvas.tokens?.get(speaker.token);
    if (placed) return placed;
  }
  if (!actor) return null;
  return canvas.tokens?.placeables.find((t) => t.actor?.id === actor.id) ?? null;
}

/**
 * Targets are read from the rolling user, not the local one — otherwise every
 * client resolves a "on the target's token" effect against its own targeting.
 */
function resolveTargets(message) {
  const user = game.users.get(message.author?.id ?? message.user?.id);
  return Array.from(user?.targets ?? []);
}

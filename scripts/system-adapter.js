import { MODULE_ID, TRIGGERS, OUTCOMES } from "./constants.js";
import { isDebug } from "./settings.js";

/**
 * The Delta Green system does not expose a stable public roll hook, so the
 * module normalises whatever it can find on the created ChatMessage into a
 * single RollContext shape. Everything downstream only ever sees this object.
 *
 * @typedef {object} RollContext
 * @property {string}   trigger  One of TRIGGERS.
 * @property {string}   name     Skill / stat / item name that was rolled.
 * @property {string}   outcome  One of OUTCOMES.
 * @property {Actor}    actor
 * @property {Token}    token    Best-guess token for the acting actor.
 * @property {Token[]}  targets  Targets of the rolling user at roll time.
 * @property {Roll}     roll
 * @property {number}   total
 * @property {number}   target   Target number the roll was made against, if known.
 */

/**
 * @param {ChatMessage} message
 * @returns {RollContext|null}
 */
export function buildRollContext(message) {
  const roll = message.rolls?.[0];
  if (!roll) return null;

  const flags = message.flags?.deltagreen ?? {};
  if (isDebug()) {
    console.log(`${MODULE_ID} | chat message inspected`, {
      flags: message.flags,
      flavor: message.flavor,
      roll
    });
  }

  const actor = resolveActor(message);
  const token = resolveToken(message, actor);
  const name = resolveName(message, flags);
  const trigger = resolveTrigger(message, flags, roll);
  const target = resolveTarget(flags, roll);
  const outcome = resolveOutcome(flags, roll, target);

  return {
    trigger,
    name,
    outcome,
    actor,
    token,
    targets: resolveTargets(message),
    roll,
    total: roll.total,
    target
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

function resolveToken(message, actor) {
  const speaker = message.speaker ?? {};
  const scene = game.scenes.get(speaker.scene) ?? canvas.scene;
  if (speaker.token && scene?.id === canvas.scene?.id) {
    const placed = canvas.tokens?.get(speaker.token);
    if (placed) return placed;
  }
  if (!actor) return null;
  return canvas.tokens?.placeables.find((t) => t.actor?.id === actor.id) ?? null;
}

function resolveName(message, flags) {
  const candidates = [flags.skillName, flags.itemName, flags.label, flags.name];
  const found = candidates.find((c) => typeof c === "string" && c.length);
  if (found) return found;
  // Fall back to the message flavor with markup stripped.
  const flavor = message.flavor ?? "";
  return flavor.replace(/<[^>]*>/g, "").trim();
}

function resolveTrigger(message, flags, roll) {
  const declared = flags.type ?? flags.rollType;
  if (typeof declared === "string") {
    const normalised = declared.toLowerCase();
    for (const value of Object.values(TRIGGERS)) {
      if (normalised.includes(value)) return value;
    }
  }

  const name = resolveName(message, flags).toLowerCase();
  if (name.includes("sanity") || name.includes("san ")) return TRIGGERS.SANITY;

  // A d100 roll is a test; anything else in this system is damage / lethality.
  const isPercentile = roll.dice?.some((d) => d.faces === 100);
  if (!isPercentile) return TRIGGERS.DAMAGE;

  const actorItem = flags.itemName ?? flags.weaponName;
  if (actorItem) return TRIGGERS.WEAPON;
  return TRIGGERS.SKILL;
}

function resolveTarget(flags, roll) {
  const candidates = [flags.target, flags.targetValue, flags.rating, roll.options?.target];
  const found = candidates.find((c) => Number.isFinite(c));
  return Number.isFinite(found) ? found : null;
}

function resolveOutcome(flags, roll, target) {
  if (typeof flags.outcome === "string") {
    const normalised = flags.outcome.toLowerCase();
    // Order matters: "critical success" must not resolve to plain success.
    const priority = [OUTCOMES.CRITICAL, OUTCOMES.FUMBLE, OUTCOMES.FAILURE, OUTCOMES.SUCCESS];
    for (const value of priority) {
      if (normalised.includes(value)) return value;
    }
  }

  const isPercentile = roll.dice?.some((d) => d.faces === 100);
  if (!isPercentile || target === null) return OUTCOMES.ANY;

  const total = roll.total;
  const isDouble = total % 11 === 0 || total === 100;
  const success = total <= target;

  if (total === 1) return OUTCOMES.CRITICAL;
  if (total === 100) return OUTCOMES.FUMBLE;
  if (isDouble) return success ? OUTCOMES.CRITICAL : OUTCOMES.FUMBLE;
  return success ? OUTCOMES.SUCCESS : OUTCOMES.FAILURE;
}

function resolveTargets(message) {
  const user = game.users.get(message.author?.id ?? message.user?.id);
  const targets = user?.targets ?? game.user.targets;
  return Array.from(targets ?? []);
}

import { MODULE_ID, OUTCOMES, PLACEMENTS, TRIGGERS } from "./constants.js";
import { getMappings, isDebug, isEnabled } from "./settings.js";

/**
 * @param {import("./system-adapter.js").RollContext} context
 */
export async function runEffectsForRoll(context) {
  if (!isEnabled()) return;
  if (!game.modules.get("sequencer")?.active) return;

  const matches = getMappings().filter((m) => matchesContext(m, context));
  if (isDebug()) console.log(`${MODULE_ID} | ${matches.length} mapping(s) matched`, context, matches);

  for (const mapping of matches) {
    try {
      await playMapping(mapping, context);
    } catch (error) {
      console.error(`${MODULE_ID} | failed to play effect "${mapping.label}"`, error);
    }
  }
}

/**
 * @param {object} mapping
 * @param {import("./system-adapter.js").RollContext} context
 */
export function matchesContext(mapping, context) {
  if (!mapping.enabled) return false;
  if (!mapping.effectFile && !mapping.sound) return false;

  if (mapping.trigger !== TRIGGERS.ANY && mapping.trigger !== context.trigger) return false;

  if (mapping.outcome !== OUTCOMES.ANY) {
    if (mapping.outcome === OUTCOMES.SUCCESS) {
      // A critical is still a success for mappings that only ask for success.
      if (![OUTCOMES.SUCCESS, OUTCOMES.CRITICAL].includes(context.outcome)) return false;
    } else if (mapping.outcome === OUTCOMES.FAILURE) {
      if (![OUTCOMES.FAILURE, OUTCOMES.FUMBLE].includes(context.outcome)) return false;
    } else if (mapping.outcome !== context.outcome) return false;
  }

  const needle = (mapping.match ?? "").trim().toLowerCase();
  if (needle && !(context.name ?? "").toLowerCase().includes(needle)) return false;

  return true;
}

/**
 * Plays a single mapping regardless of whether it matches — used by the
 * config UI's preview button.
 */
export async function playMapping(mapping, context) {
  const sequence = new Sequence({ moduleName: MODULE_ID, softFail: true });

  if (mapping.sound) {
    sequence.sound().file(mapping.sound).delay(mapping.delay ?? 0);
  }

  if (!mapping.effectFile) return sequence.play();

  const effect = sequence
    .effect()
    .file(mapping.effectFile)
    .delay(mapping.delay ?? 0)
    .scale(mapping.scale ?? 1)
    .fadeIn(mapping.fadeIn ?? 0)
    .fadeOut(mapping.fadeOut ?? 0);

  if (mapping.belowTokens) effect.belowTokens();
  if ((mapping.repeats ?? 1) > 1) effect.repeats(mapping.repeats, 200);

  await applyPlacement(effect, mapping, context);
  return sequence.play();
}

async function applyPlacement(effect, mapping, context) {
  const origin = context.token;
  const target = context.targets?.[0] ?? null;

  switch (mapping.placement) {
    case PLACEMENTS.TARGET:
      if (target) effect.atLocation(target);
      else if (origin) effect.atLocation(origin);
      break;

    case PLACEMENTS.RANGED:
      if (origin && target) effect.atLocation(origin).stretchTo(target);
      else if (origin) effect.atLocation(origin);
      break;

    case PLACEMENTS.CROSSHAIR: {
      const location = await pickLocation(mapping);
      if (location) effect.atLocation(location);
      else if (origin) effect.atLocation(origin);
      break;
    }

    case PLACEMENTS.SELF:
    default:
      if (origin) effect.attachTo(origin);
      break;
  }
}

/** Uses Portal when installed, otherwise falls back to Sequencer's own picker. */
async function pickLocation(mapping) {
  if (game.modules.get("portal-lib")?.active && globalThis.Portal) {
    return new Portal().color("#00ff00").texture(mapping.effectFile).pick();
  }
  if (globalThis.Sequencer?.Crosshair) {
    return Sequencer.Crosshair.show();
  }
  return null;
}

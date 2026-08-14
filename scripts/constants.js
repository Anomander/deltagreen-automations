export const MODULE_ID = "deltagreen-automations";

export const SETTINGS = {
  MAPPINGS: "effectMappings",
  ENABLED: "effectsEnabled",
  DEBUG: "debugRolls"
};

/** Which kind of roll a mapping listens for. */
export const TRIGGERS = {
  SKILL: "skill",
  STAT: "stat",
  WEAPON: "weapon",
  DAMAGE: "damage",
  SANITY: "sanity",
  ANY: "any"
};

/** Which roll outcomes a mapping fires on. */
export const OUTCOMES = {
  ANY: "any",
  SUCCESS: "success",
  FAILURE: "failure",
  CRITICAL: "critical",
  FUMBLE: "fumble"
};

/** Where the Sequencer effect is anchored. */
export const PLACEMENTS = {
  SELF: "self",
  TARGET: "target",
  RANGED: "ranged",
  CROSSHAIR: "crosshair"
};

export function newMapping(overrides = {}) {
  return {
    id: foundry.utils.randomID(),
    label: "New Effect",
    enabled: true,
    trigger: TRIGGERS.SKILL,
    // Case-insensitive substring match against the skill / item name.
    // Empty string matches everything for the chosen trigger.
    match: "",
    outcome: OUTCOMES.ANY,
    placement: PLACEMENTS.SELF,
    effectFile: "",
    sound: "",
    scale: 1,
    delay: 0,
    fadeIn: 250,
    fadeOut: 500,
    repeats: 1,
    belowTokens: false,
    ...overrides
  };
}

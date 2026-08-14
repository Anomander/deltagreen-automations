import { MODULE_ID, OUTCOMES, PLACEMENTS, TRIGGERS, newMapping } from "./constants.js";
import { registerSettings, getMappings, setMappings } from "./settings.js";
import { registerRollListener } from "./roll-listener.js";
import { buildRollContext } from "./system-adapter.js";
import { runEffectsForRoll, playMapping, matchesContext } from "./effect-runner.js";
import { EffectMappingConfig } from "./apps/effect-mapping-config.js";

Hooks.once("init", () => {
  registerSettings();
  registerRollListener();

  // Public surface for macros and future automation modules.
  const api = {
    MODULE_ID,
    TRIGGERS,
    OUTCOMES,
    PLACEMENTS,
    newMapping,
    getMappings,
    setMappings,
    buildRollContext,
    runEffectsForRoll,
    playMapping,
    matchesContext,
    openConfig: () => new EffectMappingConfig().render({ force: true })
  };

  game.modules.get(MODULE_ID).api = api;
  globalThis.DeltaGreenAutomations = api;

  console.log(`${MODULE_ID} | initialised`);
});

Hooks.once("ready", () => {
  if (game.system.id !== "deltagreen") {
    console.warn(`${MODULE_ID} | active system is "${game.system.id}"; roll detection is tuned for "deltagreen".`);
  }
  if (!game.modules.get("sequencer")?.active) {
    ui.notifications.warn(game.i18n.localize("DGA.Config.SequencerMissing"));
  }
});

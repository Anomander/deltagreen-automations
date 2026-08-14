import { MODULE_ID, SETTINGS } from "./constants.js";
import { EffectMappingConfig } from "./apps/effect-mapping-config.js";

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.ENABLED, {
    name: "DGA.Settings.Enabled.Name",
    hint: "DGA.Settings.Enabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.DEBUG, {
    name: "DGA.Settings.Debug.Name",
    hint: "DGA.Settings.Debug.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.MAPPINGS, {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.registerMenu(MODULE_ID, "effectMappingMenu", {
    name: "DGA.Settings.Mappings.Name",
    label: "DGA.Settings.Mappings.Label",
    hint: "DGA.Settings.Mappings.Hint",
    icon: "fa-solid fa-wand-magic-sparkles",
    type: EffectMappingConfig,
    restricted: true
  });
}

export function getMappings() {
  return game.settings.get(MODULE_ID, SETTINGS.MAPPINGS) ?? [];
}

export async function setMappings(mappings) {
  return game.settings.set(MODULE_ID, SETTINGS.MAPPINGS, mappings);
}

export function isEnabled() {
  return game.settings.get(MODULE_ID, SETTINGS.ENABLED);
}

export function isDebug() {
  return game.settings.get(MODULE_ID, SETTINGS.DEBUG);
}

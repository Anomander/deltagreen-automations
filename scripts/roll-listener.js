import { MODULE_ID } from "./constants.js";
import { buildRollContext } from "./system-adapter.js";
import { runEffectsForRoll } from "./effect-runner.js";

/**
 * Effects are driven from chat messages so that every client sees the same
 * animation, but only the message author actually builds the sequence —
 * Sequencer handles broadcasting it to the other clients.
 */
export function registerRollListener() {
  Hooks.on("createChatMessage", async (message) => {
    if (message.author?.id !== game.user.id) return;

    const context = buildRollContext(message);
    if (!context) return;

    Hooks.callAll(`${MODULE_ID}.roll`, context, message);
    await runEffectsForRoll(context);
  });
}

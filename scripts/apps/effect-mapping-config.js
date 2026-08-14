import { MODULE_ID, OUTCOMES, PLACEMENTS, TRIGGERS, newMapping } from "../constants.js";
import { getMappings, setMappings } from "../settings.js";
import { playMapping } from "../effect-runner.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Configuration UI for the Sequencer effect mappings. */
export class EffectMappingConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  /** Working copy so edits can be cancelled by closing without saving. */
  #mappings = null;

  static DEFAULT_OPTIONS = {
    id: "dga-effect-mapping-config",
    tag: "form",
    window: {
      title: "DGA.Config.Title",
      icon: "fa-solid fa-wand-magic-sparkles",
      resizable: true
    },
    position: { width: 900, height: 700 },
    form: {
      handler: EffectMappingConfig.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      addMapping: EffectMappingConfig.#onAddMapping,
      deleteMapping: EffectMappingConfig.#onDeleteMapping,
      duplicateMapping: EffectMappingConfig.#onDuplicateMapping,
      previewMapping: EffectMappingConfig.#onPreviewMapping,
      browseFile: EffectMappingConfig.#onBrowseFile
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/effect-mapping-config.hbs`, scrollable: [".dga-mappings"] },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  get mappings() {
    this.#mappings ??= foundry.utils.deepClone(getMappings());
    return this.#mappings;
  }

  async _prepareContext() {
    return {
      mappings: this.mappings,
      triggers: localizedChoices("Trigger", TRIGGERS),
      outcomes: localizedChoices("Outcome", OUTCOMES),
      placements: localizedChoices("Placement", PLACEMENTS),
      sequencerActive: game.modules.get("sequencer")?.active ?? false,
      buttons: [{ type: "submit", icon: "fa-solid fa-save", label: "DGA.Config.Save" }]
    };
  }

  /** Pull the current DOM state into the working copy before re-rendering. */
  #syncFromForm() {
    const form = this.element;
    if (!form) return;
    const data = foundry.utils.expandObject(new FormDataExtended(form).object);
    for (const mapping of this.mappings) {
      Object.assign(mapping, data.mappings?.[mapping.id] ?? {});
    }
  }

  static async #onAddMapping() {
    this.#syncFromForm();
    this.mappings.push(newMapping());
    await this.render();
  }

  static async #onDeleteMapping(event, target) {
    this.#syncFromForm();
    const id = target.closest("[data-mapping-id]")?.dataset.mappingId;
    this.#mappings = this.mappings.filter((m) => m.id !== id);
    await this.render();
  }

  static async #onDuplicateMapping(event, target) {
    this.#syncFromForm();
    const id = target.closest("[data-mapping-id]")?.dataset.mappingId;
    const source = this.mappings.find((m) => m.id === id);
    if (!source) return;
    this.mappings.push(newMapping({ ...source, id: foundry.utils.randomID(), label: `${source.label} (Copy)` }));
    await this.render();
  }

  static async #onPreviewMapping(event, target) {
    this.#syncFromForm();
    const id = target.closest("[data-mapping-id]")?.dataset.mappingId;
    const mapping = this.mappings.find((m) => m.id === id);
    if (!mapping) return;

    const token = canvas.tokens?.controlled[0] ?? canvas.tokens?.placeables[0];
    if (!token) {
      ui.notifications.warn(game.i18n.localize("DGA.Config.PreviewNeedsToken"));
      return;
    }

    await playMapping(mapping, {
      trigger: mapping.trigger,
      name: mapping.match || "preview",
      outcome: mapping.outcome,
      actor: token.actor,
      token,
      targets: Array.from(game.user.targets),
      roll: null,
      total: 0,
      target: null
    });
  }

  static async #onBrowseFile(event, target) {
    const input = target.previousElementSibling;
    const Picker = foundry.applications.apps.FilePicker?.implementation ?? FilePicker;
    new Picker({
      type: target.dataset.pickerType ?? "imagevideo",
      current: input?.value ?? "",
      callback: (path) => {
        if (input) input.value = path;
      }
    }).browse();
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const updated = this.mappings.map((mapping) => ({
      ...mapping,
      ...(data.mappings?.[mapping.id] ?? {})
    }));
    await setMappings(updated);
    ui.notifications.info(game.i18n.localize("DGA.Config.Saved"));
  }
}

function localizedChoices(group, values) {
  return Object.values(values).map((value) => ({
    value,
    label: game.i18n.localize(`DGA.${group}.${value}`)
  }));
}

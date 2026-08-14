# Changelog

## Unreleased

- Fixed: the effect mapping window came up empty and Add Mapping appeared to do nothing. The
  template used the `selected` Handlebars helper, which Foundry v14 removed; ApplicationV2 swallows
  the render error, so the failure was silent. Now uses `selectOptions`.
- Verified in a live Foundry v14 world: the config UI round trip, roll detection across all five
  roll types, and Sequencer playback.

## 0.1.0

- Initial release.
- Sequencer effect mapping layer: bind animations and sounds to skill, attack, damage, and sanity
  rolls, filtered by name and outcome.
- Configuration UI under module settings, with per-mapping preview.
- `deltagreen-automations.roll` hook and public API for macros.

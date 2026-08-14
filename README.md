# Delta Green Automations

A Foundry VTT module that automates the fiddly parts of running **Delta Green**, for the
[`deltagreen`](https://github.com/TheLastScrub/delta-green-foundry-vtt-system) game system.

The first feature is a **configurable Sequencer effect layer**: bind animations and sounds to skill
rolls, attack rolls, damage rolls, and sanity checks without writing a single macro.

## Status

Early — `0.1.0`. The effect mapping layer is in place; further automations (sanity loss, bonds,
lethality, failure marks) are planned.

## Requirements

| | |
|---|---|
| Foundry VTT | v13+, verified on v14 |
| System | `deltagreen` |
| Required module | [Sequencer](https://github.com/fantasycalendar/FoundryVTT-Sequencer) |
| Recommended | JB2A (animations), Portal (`portal-lib`, location picking), psfx (sounds) |

## Usage

1. Install and enable the module alongside Sequencer.
2. **Settings → Module Settings → Delta Green Automations → Configure Effects**.
3. Add a mapping and fill it in:
   - **Trigger** — which kind of roll to listen for (skill, attack, damage, sanity, or any).
   - **Name Contains** — case-insensitive substring of the skill or item name. Blank matches all.
   - **Outcome** — any / success / failure / critical / fumble. *Success* includes criticals and
     *Failure* includes fumbles, so the common cases need only one mapping.
   - **Placement** — on the roller, on their target, stretched from roller to target, or at a
     location you pick.
   - **Effect File** — a filesystem path or a Sequencer database path such as
     `jb2a.bullet.01.orange`.
4. Use the ▶ preview button with a token selected to check the effect before saving.

### Example

| Field | Value |
|---|---|
| Trigger | Attack Roll |
| Name Contains | `pistol` |
| Outcome | Success (incl. critical) |
| Placement | Roller to target |
| Effect File | `jb2a.bullet.01.orange` |

## Troubleshooting

If a mapping never fires, enable **Log Roll Data** in module settings. Every roll is then printed to
the console with the facts the module read from it, the trigger and outcome it derived, and which
mappings matched.

The `deltagreen` system publishes no roll hook and writes no outcome into chat message flags, so
detection reads `roll.options.rollType` and `roll.options.key` — set in the system's `DGRoll`
constructor and serialised into the message with the roll. Where the roll revives far enough to
carry the system's own `isSuccess` / `isCritical`, that verdict is used rather than recomputed.

## API

The module exposes an API for macros and downstream modules:

```js
const dga = game.modules.get("deltagreen-automations").api;
dga.openConfig();                 // open the mapping UI
dga.getMappings();                // read the stored mappings
dga.playMapping(mapping, context) // play one mapping directly
```

A hook fires for every detected roll:

```js
Hooks.on("deltagreen-automations.roll", (context, message) => {
  console.log(context.trigger, context.name, context.outcome);
});
```

## Development

No build step — the module is plain ES modules. Symlink or clone the repo into your Foundry data
directory to work on it live:

```sh
ln -s "$PWD" "$HOME/Library/Application Support/FoundryVTT/Data/modules/deltagreen-automations"
```

### Testing

```sh
npm install
npm test                                    # unit + contract tests
npm run sync:rolltypes                      # re-extract the system's roll types
FOUNDRY_USER=Claude npm run fvtt:config     # add a mapping through the real UI
FOUNDRY_USER=Claude npm run fvtt:capture    # roll in a live world, dump what arrives
FOUNDRY_USER=Claude npm run fvtt:smoke      # prove a mapping plays its effect
```

The live-world commands drive Foundry with Playwright and need a **dedicated GM account** — Foundry
disables a user who is already connected, so the driver cannot share yours. See
[docs/TESTING.md](docs/TESTING.md) for the full strategy, including the roll-type snapshot that
catches system drift.

Releases are cut by pushing a tag (`v0.1.0`); the GitHub Action builds `module.zip`, rewrites the
manifest version, and publishes both to the release.

## License

MIT. Delta Green is a trademark of the Delta Green Partnership; this module is an unofficial fan
project and ships no game content.

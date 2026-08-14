# TESTING.md — how we know it works

## The problem this strategy solves

This module reads a dependency that documents none of what we depend on. The `deltagreen` system
publishes no roll hook and writes no outcome into chat message flags — `flags.deltagreen` carries
only `chatCard: true`. What it does carry is `roll.options.rollType` and `roll.options.key`, set in
`DGRoll`'s constructor and serialised into the message alongside the roll.

That vocabulary is not versioned, and reading a field that has moved yields `undefined`, not an
error. A conventional unit suite is blind to that: it will pass against shapes the system has never
had.

So three mechanisms answer three different questions:

| Question | Mechanism |
|---|---|
| Is our logic right? | Unit tests, headless |
| Do our assumptions about the system still hold? | Snapshot-contract test |
| Does it work in a real world? | Live-world driver |

## Tier 1 — Unit tests

Vitest, `environment: node`. Everything in `scripts/core/` is reachable this way because that
directory touches no Foundry global: `roll-parse.js` takes plain roll data and returns plain data,
`matching.js` decides whether a mapping applies. The Foundry-facing half — resolving actors, tokens
and targets — lives in `scripts/system-adapter.js` and is verified by the driver instead.

| Suite | Question it answers |
|---|---|
| `roll-parse.test.mjs` | Do we read the right fields, and report absence honestly? |
| `matching.test.mjs` | Does the right mapping fire, and only that one? |
| `manifest.test.mjs` | Does `module.json` declare paths that exist and ship in the zip? |
| `lang.test.mjs` | Does every key referenced exist, and every key defined get used? |
| `handlebars-helpers.test.mjs` | Does every helper our templates call still exist in Foundry? |

Two of these name a specific defect. `roll-parse.test.mjs` asserts *"treats the system's null
verdict on an unevaluated roll as absence"* — `DGPercentileRoll#isSuccess` returns `null`, not
`false`, before evaluation, and reading that as a failure would fire every failure mapping on a bare
roll. `matching.test.mjs` asserts *"does not fire an outcome-specific mapping on a roll with no
verdict"* — a damage roll has no success, and "unknown" must not read as a pass.

**Tests name the defect, not the method.**

## Tier 2 — Snapshot-contract tests

Two undocumented dependencies are pinned this way: the system's roll vocabulary, and Foundry's
Handlebars helpers.

### The Handlebars helper snapshot

Foundry v14 removed the `selected` helper that v13 had. The config template used it, ApplicationV2
swallowed the resulting render error, and the window came up with no rows and no message — "adding
a mapping does nothing", with nothing wrong-looking in the template or the code, and nothing a unit
test could see.

`tests/fixtures/handlebars-helpers.json` is captured from a running world with `npm run
fvtt:helpers`. `handlebars-helpers.test.mjs` extracts every helper call from `templates/*.hbs` and
asserts each one exists in it, so the next removal fails at `npm test`. Recapture the snapshot when
upgrading Foundry — and expect that upgrade to be the moment it earns its keep.

### The roll-type snapshot

Every trigger in the module is keyed on the system's `rollType` vocabulary, so that vocabulary is
extracted and committed.

```
  installed deltagreen system
            │
            ▼
   tools/system-rolltypes.mjs        (static text extraction — data-rolltype
            │                         in the sheets, this.type in the classes)
      ┌─────┴─────┐
      ▼           ▼
 sync-rolltypes   rolltype-drift.test.mjs
      │
      ▼
 tests/fixtures/system-rolltypes.json  (committed snapshot)
```

Extraction is static text parsing, not import — the system's modules call Foundry globals at module
scope and cannot be loaded in Node. When the system is installed locally the test re-extracts and
compares; in CI, where it is not, the test asserts against the snapshot alone. CI stays
deterministic while a developer's machine catches drift the day it appears.

The test asserts in both directions: every type the system has must have a trigger, and we must not
map a type the system does not have.

### When the drift test fails

It is a signal, not a chore. Do not regenerate reflexively.

```bash
npm run sync:rolltypes
git diff tests/fixtures/
```

1. **Read the diff.** It states precisely what the system changed.
2. **Fix `ROLL_TYPE_TRIGGERS` in `scripts/core/roll-parse.js`** if a type moved or appeared.
3. **Then** commit the regenerated snapshot, in the same commit as the fix.

Set `DG_SYSTEM_PATH` if the system is installed somewhere non-standard.

## Tier 3 — Live-world verification

> Green tests are not evidence. A feature is done when it has been confirmed in a running world.

`tools/foundry-driver.mjs` logs into a live Foundry with Playwright.

```bash
FOUNDRY_USER=Claude npm run fvtt:probe      # list joinable users
FOUNDRY_USER=Claude npm run fvtt:config     # add a mapping through the real UI
FOUNDRY_USER=Claude npm run fvtt:capture    # roll for real, dump what arrives
FOUNDRY_USER=Claude npm run fvtt:smoke      # prove a mapping plays its effect
FOUNDRY_USER=Claude npm run fvtt:helpers    # recapture the helper snapshot
HEADED=1 FOUNDRY_USER=Claude npm run fvtt:config   # watch it happen
```

**It needs a dedicated GM account.** Foundry disables a user who is already connected, so the driver
cannot share yours. Create a second GM and pass it via `FOUNDRY_USER`.

`capture` is the one that earns its keep. It rolls each type through the system's own public API
(`createDGRollFromDataset` → `processDGRoll`) and prints, side by side, the **live** roll and the
**revived** roll re-read from the chat message. Our adapter reads the revived one — the same object
every other client gets — so a field present live and gone after the round trip is a field the
module must not depend on. Output lands in `tools/.out/capture.json`.

`config` drives the UI as a user does: open, Add Mapping, fill the inputs, save, reopen. It checks
each step separately, because "adding a mapping doesn't work" has four causes that need telling
apart — and it reads the saved values back out of the world setting rather than off the DOM, which
is where a checkbox that returns `"on"` or a number that returns a string would show up. It is the
command that caught the `selected` helper removal.

`smoke` installs a temporary mapping, rolls, and uses Sequencer's `EffectManager` as the witness: a
sequence that was built but never reached the canvas leaves nothing there, which is exactly the
failure it is looking for. It restores the world's own mappings afterwards.

Both roll in the live world and leave chat messages. Neither writes to an actor.

| Variable | Default |
|---|---|
| `FOUNDRY_URL` | `http://localhost:30000` |
| `FOUNDRY_USER` | first joinable gamemaster |
| `FOUNDRY_PASSWORD` | none |
| `HEADED=1` | headless |

The driver is a development tool: not bundled, not shipped.

## Rules for writing tests

**TEST-1 — Fixtures derive from the system's vocabulary.** `tests/fixtures/rolls.mjs` throws if a
fixture names a roll type the snapshot does not have. A fixture that a system change should
invalidate must break.

**TEST-2 — The drift test keeps passing.** Never delete or skip it to get green.

**TEST-3 — No production branch exists only for tests.** No `typeof game !== 'undefined'` in
`scripts/`. The seam is the `scripts/core/` boundary: pure rules in, Foundry lookups out.

**TEST-4 — A fix lands with a test proven to fail first.** Write it, watch it fail for the right
reason, then fix.

**TEST-5 — The core is testable headless.** No Foundry, no DOM. A core module that needs a global
is misusing the seam.

## What is deliberately not unit-tested

**Sequencer playback.** Mocking enough of Sequencer to assert a sequence was built would test the
mock; whether the effect reached the canvas is a live-world question, and `fvtt:smoke` answers it.

**Anything the system owns.** Roll evaluation, success and criticality, chat cards, dialogs. This
module is not a rules engine — where the system offers a verdict, we read it rather than recompute
it. `outcomeFor` carries a fallback that mirrors the system's rule for rolls that revive without
one, and it must never disagree.

## CI

`.github/workflows/test.yml` runs `npm test` on push and PR to `main`. `release.yml` runs it again
before it will build a release — a failing suite cannot ship.

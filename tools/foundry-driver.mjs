/**
 * Drive a live Foundry world in a real browser.
 *
 * This module reads roll data the `deltagreen` system does not document and
 * does not promise: `roll.options.rollType`, and whatever of a DGPercentileRoll
 * survives being serialised into a chat message and revived from it. No unit
 * test can settle what actually survives — only a running world can.
 *
 *   node tools/foundry-driver.mjs probe     # list joinable users
 *   node tools/foundry-driver.mjs capture   # roll for real, dump what arrives
 *   node tools/foundry-driver.mjs smoke     # prove a mapping plays its effect
 *
 * Environment:
 *   FOUNDRY_URL       default http://localhost:30000
 *   FOUNDRY_USER      user to join as (default: first joinable gamemaster)
 *   FOUNDRY_PASSWORD  that user's password, if set
 *   HEADED=1          watch it happen
 *
 * It needs a dedicated GM account: Foundry disables a user who is already
 * connected, so the driver cannot share the one you are playing on.
 *
 * `capture` and `smoke` roll in the live world and leave chat messages behind.
 * Neither writes to an actor. This is a development tool: not shipped.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.FOUNDRY_URL ?? 'http://localhost:30000';
const HEADED = process.env.HEADED === '1';

/** Launch a browser, join the world, hand back a ready page. */
async function connect({ join = true } = {}) {
  const browser = await chromium.launch({ headless: !HEADED });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
  const page = await context.newPage();

  const consoleLog = [];
  page.on('console', (message) => consoleLog.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', (error) => consoleLog.push({ type: 'pageerror', text: error.message }));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  // Wait for a populated option, not the container: the join screen is built
  // client-side. `state: 'attached'` matters — an <option> never satisfies
  // Playwright's visibility check, so the default would always time out.
  await page.waitForSelector('select[name="userid"] option[value]:not([value=""])', {
    state: 'attached',
    timeout: 30_000
  });

  if (join) await joinWorld(page);
  return { browser, page, consoleLog };
}

async function joinWorld(page) {
  const select = page.locator('select[name="userid"]');
  await select.waitFor({ timeout: 30_000 });

  const users = await readUsers(page);
  const wanted = process.env.FOUNDRY_USER;
  const target = wanted ? users.find((u) => u.user === wanted) : users.find((u) => u.joinable);

  if (!target) {
    const available = users.map((u) => `${u.user}${u.joinable ? '' : ' (connected)'}`).join(', ');
    throw new Error(wanted ? `No such user "${wanted}". Available: ${available}` : `No joinable user. Available: ${available}`);
  }
  if (!target.joinable) {
    throw new Error(`"${target.user}" is already connected — Foundry disables that option. Use another user.`);
  }

  await select.selectOption(target.id);

  const password = process.env.FOUNDRY_PASSWORD;
  if (password) await page.fill('input[name="password"]', password);

  await page.click('button[name="join"], #join-game button[type="submit"]');
  await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 60_000 });
}

async function readUsers(page) {
  return page.locator('select[name="userid"] option').evaluateAll((options) =>
    options.filter((o) => o.value).map((o) => ({ user: o.textContent.trim(), joinable: !o.disabled, id: o.value }))
  );
}

async function probe() {
  const { browser, page } = await connect({ join: false });
  console.log('World:', await page.title());
  console.table(await readUsers(page));
  await browser.close();
}

/** Refuse to run against the wrong system rather than reporting nonsense. */
async function requireSystem(page) {
  const info = await page.evaluate(() => ({
    system: game.system.id,
    version: game.system.version,
    module: game.modules.get('deltagreen-automations')?.active ?? false,
    sequencer: game.modules.get('sequencer')?.active ?? false
  }));

  if (info.system !== 'deltagreen') throw new Error(`World is running "${info.system}", not "deltagreen".`);
  return info;
}

/**
 * Roll each type for real, and report exactly what reaches a chat message.
 *
 * The point is the difference between the live roll and the revived one. Our
 * adapter reads the revived roll — the same object every other client gets —
 * so a field that is present live and gone after the round trip is a field the
 * module must not depend on.
 */
async function capture() {
  const { browser, page, consoleLog } = await connect();
  const info = await requireSystem(page);
  console.log(`System ${info.system} ${info.version} · module ${info.module ? 'active' : 'not installed'}\n`);

  const observed = await page.evaluate(async () => {
    const { createDGRollFromDataset, processDGRoll } = await import('/systems/deltagreen/module/roll/roll.js');

    const token =
      canvas.tokens.controlled[0] ??
      canvas.tokens.placeables.find((t) => t.actor?.isOwner && ['agent', 'npc'].includes(t.actor?.type));
    if (!token) return { error: 'No ownable agent/npc token on this scene' };

    const actor = token.actor;
    const weapon = actor.items.find((i) => i.type === 'weapon');
    const skillKey = Object.keys(actor.system.skills ?? {})[0];

    const cases = [
      { label: 'skill', dataset: { rolltype: 'skill', key: skillKey } },
      { label: 'stat', dataset: { rolltype: 'stat', key: 'str' } },
      { label: 'sanity', dataset: { rolltype: 'sanity', key: 'sanity' } },
      ...(weapon
        ? [
            { label: 'weapon', dataset: { rolltype: 'weapon', key: weapon.system.skill }, item: weapon },
            { label: 'damage', dataset: { rolltype: 'damage', key: 'damage' }, item: weapon }
          ]
        : [])
    ];

    const results = [];

    for (const testCase of cases) {
      const before = game.messages.contents.length;
      let live = null;

      try {
        const roll = createDGRollFromDataset(testCase.dataset, {
          actor,
          item: testCase.item ?? null,
          token: token.document
        });
        // No shiftKey, no which: processDGRoll skips the modifier dialog.
        await processDGRoll({}, roll);
        live = {
          class: roll.constructor.name,
          type: roll.type,
          key: roll.key,
          target: roll.target ?? null,
          effectiveTarget: roll.effectiveTarget ?? null,
          isSuccess: roll.isSuccess ?? null,
          isCritical: roll.isCritical ?? null
        };
      } catch (error) {
        results.push({ label: testCase.label, error: error.message });
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 600));
      const message = game.messages.contents.slice(before).at(-1);
      if (!message) {
        results.push({ label: testCase.label, live, error: 'no chat message' });
        continue;
      }

      // The revived roll: what every client, including this module, actually
      // reads. Re-fetching from the collection forces the deserialise path.
      const revived = game.messages.get(message.id).rolls[0];

      results.push({
        label: testCase.label,
        live,
        message: {
          flags: message.flags,
          flavor: (message.flavor ?? '').slice(0, 60)
        },
        revived: {
          class: revived?.constructor?.name ?? null,
          optionKeys: Object.keys(revived?.options ?? {}),
          rollType: revived?.options?.rollType ?? null,
          key: revived?.options?.key ?? null,
          itemName: revived?.options?.item?.name ?? null,
          localizedKey: revived?.localizedKey ?? null,
          total: revived?.total ?? null,
          target: revived?.target ?? null,
          effectiveTarget: revived?.effectiveTarget ?? null,
          isSuccess: revived?.isSuccess ?? null,
          isCritical: revived?.isCritical ?? null
        },
        // What our adapter makes of it, when the module is installed.
        derived: globalThis.DeltaGreenAutomations
          ? (() => {
              const context = globalThis.DeltaGreenAutomations.buildRollContext(game.messages.get(message.id));
              return context && { trigger: context.trigger, name: context.name, outcome: context.outcome };
            })()
          : null
      });
    }

    return { results };
  });

  if (observed.error) {
    console.error(observed.error);
    await browser.close();
    process.exit(1);
  }

  console.log(JSON.stringify(observed.results, null, 2));

  console.log('\nSummary');
  console.table(
    observed.results.map((r) => ({
      roll: r.label,
      revivedAs: r.revived?.class ?? '—',
      rollType: r.revived?.rollType ?? '—',
      target: r.revived?.effectiveTarget ?? r.revived?.target ?? '—',
      verdict: r.revived?.isSuccess === null ? 'lost' : String(r.revived?.isSuccess),
      derived: r.derived ? `${r.derived.trigger}/${r.derived.outcome}` : '—'
    }))
  );

  fs.mkdirSync('tools/.out', { recursive: true });
  fs.writeFileSync('tools/.out/capture.json', `${JSON.stringify(observed.results, null, 2)}\n`);
  console.log('\nWritten: tools/.out/capture.json');

  reportConsole(consoleLog);
  await browser.close();
}

/**
 * End to end: a mapping, a real roll, and the effect it should have played.
 *
 * Sequencer's EffectManager is the witness — a sequence that was built but
 * never reached the canvas leaves nothing there, which is the failure this is
 * looking for. The mapping is installed and removed; the world keeps whatever
 * mappings it had.
 */
async function smoke() {
  const { browser, page, consoleLog } = await connect();
  const info = await requireSystem(page);

  if (!info.module) throw new Error('deltagreen-automations is not active in this world.');
  if (!info.sequencer) throw new Error('Sequencer is not active in this world.');

  const result = await page.evaluate(async () => {
    const { createDGRollFromDataset, processDGRoll } = await import('/systems/deltagreen/module/roll/roll.js');
    const api = globalThis.DeltaGreenAutomations;

    const token =
      canvas.tokens.controlled[0] ??
      canvas.tokens.placeables.find((t) => t.actor?.isOwner && ['agent', 'npc'].includes(t.actor?.type));
    if (!token) return { error: 'No ownable agent/npc token on this scene' };
    token.control({ releaseOthers: true });

    const skillKey = Object.keys(token.actor.system.skills ?? {})[0];
    const saved = api.getMappings();

    // A long effect, so it is still on the canvas when we look for it.
    await api.setMappings([
      api.newMapping({
        label: 'smoke',
        trigger: api.TRIGGERS.SKILL,
        outcome: api.OUTCOMES.ANY,
        effectFile: 'jb2a.energy_field.02.above.blue',
        placement: api.PLACEMENTS.SELF,
        fadeOut: 3000
      })
    ]);

    const before = Sequencer.EffectManager.getEffects({ name: null }).length;

    const roll = createDGRollFromDataset({ rolltype: 'skill', key: skillKey }, { actor: token.actor, token: token.document });
    await processDGRoll({}, roll);

    // Poll rather than sleep: the effect appears after the message round trip.
    let after = before;
    for (let waited = 0; waited < 6000 && after <= before; waited += 100) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      after = Sequencer.EffectManager.getEffects({ name: null }).length;
    }

    await Sequencer.EffectManager.endEffects({ name: null, object: token });
    await api.setMappings(saved);

    return { skill: skillKey, before, after, played: after > before };
  });

  if (result.error) {
    console.error(result.error);
    await browser.close();
    process.exit(1);
  }

  console.log(`Rolled "${result.skill}" — effects on canvas ${result.before} → ${result.after}`);
  console.log(result.played ? 'PASS: the mapping played its effect' : 'FAIL: no effect reached the canvas');

  fs.mkdirSync('tools/.out', { recursive: true });
  await page.screenshot({ path: 'tools/.out/smoke.png' });
  console.log('Screenshot: tools/.out/smoke.png');

  reportConsole(consoleLog);
  await browser.close();

  if (!result.played) process.exit(1);
}

function reportConsole(consoleLog) {
  const problems = consoleLog.filter(
    (entry) =>
      ['error', 'pageerror', 'warning'].includes(entry.type) && !/deprecat|Fontconfig|favicon/i.test(entry.text)
  );

  if (!problems.length) return console.log('\nConsole: clean');

  console.log(`\nConsole problems (${problems.length}):`);
  for (const problem of problems.slice(0, 25)) {
    console.log(`  [${problem.type}] ${problem.text.split('\n')[0].slice(0, 160)}`);
  }
}

/**
 * The config UI, driven as a user drives it.
 *
 * Adding a mapping is the first thing anyone does with this module and the one
 * flow no unit test reaches: it is an ApplicationV2 render, a form round trip
 * and a world setting write. Every step below is checked separately, because
 * "it didn't work" has four different causes and they need telling apart.
 */
async function config() {
  const { browser, page, consoleLog } = await connect();
  const info = await requireSystem(page);
  if (!info.module) throw new Error('deltagreen-automations is not active in this world.');

  const checks = [];
  const record = (name, pass, detail = '') => {
    checks.push({ check: name, result: pass ? 'PASS' : 'FAIL', detail });
    return pass;
  };

  // Start from a known state, and remember what the world had.
  const saved = await page.evaluate(() => {
    const mappings = globalThis.DeltaGreenAutomations.getMappings();
    return JSON.stringify(mappings);
  });

  // 1 — does the window render at all? A missing Handlebars helper or a bad
  // template path fails here, and fails silently apart from a console error.
  const opened = await page.evaluate(async () => {
    try {
      await globalThis.DeltaGreenAutomations.openConfig();
      await new Promise((resolve) => setTimeout(resolve, 800));
      return { ok: Boolean(document.querySelector('#dga-effect-mapping-config')), error: null };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  record('the config window renders', opened.ok, opened.error ?? '');

  if (!opened.ok) {
    console.table(checks);
    reportConsole(consoleLog);
    await page.screenshot({ path: 'tools/.out/config-failed.png' });
    console.log('Screenshot: tools/.out/config-failed.png');
    await browser.close();
    process.exit(1);
  }

  // 2 — the Add button produces a row.
  const rowsBefore = await page.locator('#dga-effect-mapping-config .dga-mapping').count();
  await page.locator('#dga-effect-mapping-config [data-action="addMapping"]').click({ timeout: 4000 });
  await page.waitForTimeout(600);
  const rowsAfter = await page.locator('#dga-effect-mapping-config .dga-mapping').count();
  record('Add Mapping adds a row', rowsAfter === rowsBefore + 1, `${rowsBefore} → ${rowsAfter}`);

  // 3 — fill it in as a user would, through the real inputs.
  const row = page.locator('#dga-effect-mapping-config .dga-mapping').last();
  const mappingId = await row.getAttribute('data-mapping-id');
  await row.locator('input[name$=".label"]').fill('Driver Test');
  await row.locator('input[name$=".effectFile"]').fill('jb2a.bullet.01.orange');
  await row.locator('select[name$=".trigger"]').selectOption('weapon');
  await row.locator('input[name$=".match"]').fill('pistol');

  // 4 — save, and read the world setting back rather than the DOM.
  await page.locator('#dga-effect-mapping-config button[type="submit"]').click({ timeout: 4000 });
  await page.waitForTimeout(1000);

  const stored = await page.evaluate(
    (id) => globalThis.DeltaGreenAutomations.getMappings().find((m) => m.id === id) ?? null,
    mappingId
  );

  record('saving writes the mapping to the world setting', Boolean(stored), stored ? '' : 'not found after save');
  if (stored) {
    record('the typed values survive the round trip', stored.label === 'Driver Test' && stored.effectFile === 'jb2a.bullet.01.orange' && stored.trigger === 'weapon' && stored.match === 'pistol', JSON.stringify({ label: stored.label, trigger: stored.trigger, match: stored.match, effectFile: stored.effectFile }));
    record('numbers come back as numbers, not strings', typeof stored.scale === 'number' && typeof stored.delay === 'number', `scale=${typeof stored.scale}, delay=${typeof stored.delay}`);
    record('the enabled checkbox comes back as a boolean', typeof stored.enabled === 'boolean', `enabled=${JSON.stringify(stored.enabled)}`);
  }

  // 5 — reopen: the saved row must come back, which is where a broken
  // re-render or a lost id shows up.
  const reopened = await page.evaluate(async (id) => {
    await globalThis.DeltaGreenAutomations.openConfig();
    await new Promise((resolve) => setTimeout(resolve, 800));
    return document.querySelectorAll(`#dga-effect-mapping-config [data-mapping-id="${id}"]`).length;
  }, mappingId);
  record('the saved mapping is there when the window is reopened', reopened === 1, `${reopened} row(s)`);

  await page.screenshot({ path: 'tools/.out/config.png' });

  // Put the world's own mappings back.
  await page.evaluate(async (json) => {
    await globalThis.DeltaGreenAutomations.setMappings(JSON.parse(json));
    Object.values(ui.windows).forEach((w) => w.close?.());
    document.querySelector('#dga-effect-mapping-config')?.remove();
  }, saved);

  console.table(checks);
  console.log('Screenshot: tools/.out/config.png');
  reportConsole(consoleLog);
  await browser.close();

  if (checks.some((c) => c.result === 'FAIL')) process.exit(1);
}

/**
 * Snapshot the Handlebars helpers the running Foundry actually registers.
 *
 * v14 removed `selected`, which v13 had. A template using it renders nothing
 * and the error is swallowed by ApplicationV2's render, so the window simply
 * comes up empty — no unit test could see it, and neither could a reader of
 * the template. `tests/handlebars-helpers.test.mjs` compares our templates
 * against this snapshot so the next removal fails at `npm test`.
 */
async function helpers() {
  const { browser, page } = await connect();

  const snapshot = await page.evaluate(() => ({
    foundry: game.version,
    helpers: Object.keys(Handlebars.helpers).sort()
  }));

  fs.mkdirSync('tests/fixtures', { recursive: true });
  fs.writeFileSync('tests/fixtures/handlebars-helpers.json', `${JSON.stringify(snapshot, null, 2)}\n`);

  console.log(`Wrote tests/fixtures/handlebars-helpers.json from Foundry ${snapshot.foundry}`);
  console.log(`  ${snapshot.helpers.length} helpers registered`);

  await browser.close();
}

const commands = { probe, capture, smoke, config, helpers };
const command = commands[process.argv[2] ?? 'capture'];

if (!command) {
  console.error(`Unknown command. Use one of: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}

command().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

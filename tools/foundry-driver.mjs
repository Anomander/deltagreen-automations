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

const commands = { probe, capture, smoke };
const command = commands[process.argv[2] ?? 'capture'];

if (!command) {
  console.error(`Unknown command. Use one of: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}

command().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

import { chromium } from '/Users/dknanlin/.claude/skills/email-digest/node_modules/playwright/index.mjs';
import { mkdirSync } from 'fs';

const OUT = '/Users/dknanlin/scratch/butt-shooting-game/qa';
mkdirSync(OUT, { recursive: true });

const URL = process.env.BSG_URL || 'http://localhost:8765/index.html';
const results = [];
function pass(n) { results.push({ n, ok: true }); console.log('PASS', n); }
function fail(n, e) { results.push({ n, ok: false, e: String(e) }); console.error('FAIL', n, e); }

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Users/dknanlin/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));

await page.goto(URL);
await page.waitForTimeout(1500);
if (errs.length === 0) pass('no load errors'); else fail('load errors', errs.join(' | '));
await page.screenshot({ path: `${OUT}/v4_title.png` });

// Start the game — should show modifier picker, not go straight to play
await page.click('#startBtn');
await page.waitForTimeout(600);

try {
  const vis = await page.evaluate(() => {
    const o = document.getElementById('pickerOverlay');
    return o && !o.classList.contains('hide');
  });
  if (vis) pass('modifier picker shows at start');
  else fail('modifier picker', 'picker not visible');
} catch (e) { fail('picker check', e); }
await page.screenshot({ path: `${OUT}/v4_modifier_picker.png` });

// Pick first modifier card
try {
  await page.evaluate(() => {
    const cards = document.querySelectorAll('#pickerCards button');
    if (cards[0]) cards[0].click();
  });
  await page.waitForTimeout(500);
  const stats = await page.evaluate(() => window.__game.game.stats);
  if (stats && stats.counts) pass(`modifier applied (dmgMult=${stats.dmgMult})`);
  else fail('modifier apply', JSON.stringify(stats));
} catch (e) { fail('modifier click', e); }

// Now level 0 should load — wait through the warm-up
await page.waitForTimeout(3500);
try {
  const st = await page.evaluate(() => ({
    levelIdx: window.__game.game.levelIdx,
    player: !!window.__game.game.player,
    hp: window.__game.game.player?.hp,
    enemies: window.__game.game.enemies.length,
  }));
  if (st.levelIdx === 0 && st.player) pass(`level 0 loaded (hp=${st.hp}, enemies=${st.enemies})`);
  else fail('level 0 load', JSON.stringify(st));
} catch (e) { fail('post-modifier state', e); }
await page.screenshot({ path: `${OUT}/v4_play.png` });

// WASD movement
await page.keyboard.down('d');
await page.waitForTimeout(280);
await page.keyboard.up('d');
await page.waitForTimeout(150);
try {
  const p = await page.evaluate(() => ({ x: window.__game.game.player.x }));
  if (Math.abs(p.x) > 0.3) pass(`move ok (x=${p.x.toFixed(2)})`);
  else fail('move', JSON.stringify(p));
} catch (e) { fail('move', e); }

// Force-kill to drop gem(s) + XP
await page.evaluate(() => {
  for (let i = 0; i < 10; i++) window.__game.forceKill(1);
});
await page.waitForTimeout(300);
try {
  const gem = await page.evaluate(() => ({
    gems: window.__game.game.gems.length,
    xp: window.__game.game.xp?.snapshot(),
  }));
  if (gem.gems > 0 || (gem.xp && gem.xp.level > 1)) pass(`xp/gems flowing (gems=${gem.gems}, lv=${gem.xp?.level}, frac=${gem.xp?.frac?.toFixed(2)})`);
  else fail('gems drop', JSON.stringify(gem));
} catch (e) { fail('gems', e); }

// Walk over gems to collect
await page.evaluate(() => {
  // teleport player onto each gem to pick them up
  const p = window.__game.game.player;
  for (const g of window.__game.game.gems) {
    p.x = g.x; p.z = g.z;
  }
});
await page.waitForTimeout(400);
try {
  const xp = await page.evaluate(() => window.__game.game.xp.snapshot());
  if (xp && xp.level >= 1) pass(`xp collected (lv=${xp.level}, xp=${xp.xp})`);
  else fail('xp collect', JSON.stringify(xp));
} catch (e) { fail('xp', e); }

// Force many kills to force a level-up (gems stack → xp full → modal)
await page.evaluate(() => {
  // grant xp directly via collecting huge gem
  window.__game.game.xp.grant(500);
});
await page.waitForTimeout(500);
try {
  const modalOpen = await page.evaluate(() => {
    const o = document.getElementById('pickerOverlay');
    return o && !o.classList.contains('hide');
  });
  if (modalOpen) pass('level-up modal shows');
  else fail('levelup modal', 'not visible');
} catch (e) { fail('levelup', e); }
await page.screenshot({ path: `${OUT}/v4_levelup_modal.png` });

// pick an upgrade
try {
  await page.evaluate(() => {
    const cards = document.querySelectorAll('#pickerCards button');
    if (cards[0]) cards[0].click();
  });
  await page.waitForTimeout(400);
  const stats = await page.evaluate(() => window.__game.game.stats);
  const pickedAny = Object.keys(stats.counts).length > 0;
  if (pickedAny) pass(`upgrade applied (counts=${JSON.stringify(stats.counts)})`);
  else fail('upgrade apply', JSON.stringify(stats));
} catch (e) { fail('upgrade click', e); }

// Stomp test (Q)
await page.waitForTimeout(1500); // let enemies spawn
await page.evaluate(() => {
  // make sure some enemies are near player
  for (const e of window.__game.game.enemies) {
    e.obj.position.x = window.__game.game.player.x + 2;
    e.obj.position.z = window.__game.game.player.z;
  }
});
const beforeStomp = await page.evaluate(() => ({
  stock: window.__game.game.stats.stompStock,
  enemies: window.__game.game.enemies.length,
}));
await page.keyboard.press('KeyQ');
await page.waitForTimeout(300);
const afterStomp = await page.evaluate(() => ({
  stock: window.__game.game.stats.stompStock,
  cd: window.__game.game.stompCd,
}));
if (afterStomp.stock < beforeStomp.stock && afterStomp.cd > 0) {
  pass(`stomp fires (stock ${beforeStomp.stock}→${afterStomp.stock}, cd=${afterStomp.cd.toFixed(2)})`);
} else {
  fail('stomp', JSON.stringify({ beforeStomp, afterStomp }));
}

// Screenshot each level via setLevel
await page.evaluate(() => window.__game.setLevel(1));
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/v4_lab.png` });
await page.evaluate(() => window.__game.setLevel(2));
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/v4_sewer.png` });
pass('level screenshots saved');

// Final console check
if (errs.length === 0) pass('no errors overall');
else fail('errors overall', errs.slice(0, 5).join(' | '));

await browser.close();

const p = results.filter(r => r.ok).length;
const t = results.length;
console.log(`\n${p}/${t} pass`);
if (p < t) {
  console.log('failures:', results.filter(r => !r.ok));
  process.exit(1);
}

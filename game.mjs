// game.mjs — main loop, state, wave logic, integration

import * as THREE from 'three';
import { sfx } from './audio.mjs';
import {
  LEVELS, applyLevel, clearPropRoot,
  buildToiletGolem, buildSewerRat,
} from './scenes.mjs';
import {
  createFloaters, createCombo, createPowerups,
  buildClogKing, clogKingAI, beanRainTick,
} from './juice.mjs';
import { buildButt, makePlayer, tryShoot, startReload, updateReload, readMoveInput, applyMove } from './player.mjs';
import { createCamera } from './camera.mjs';
import { createAnalytics } from './analytics.mjs';
import {
  createStats, createXp,
  pickThreeUpgrades, pickThreeModifiers, applyUpgrade,
  createPicker, buildGemMesh,
} from './upgrades.mjs';

// ─── shared palette + constants ───────────────────────────────────────────────
const C = {
  peach:0xF5B08A, cleft:0xC77A5A, blush:0xFF7B7B,
  beanGold:0xE8B84D, beanDark:0x6B3410,
  cream:0xFFF4D6, rival:0xE85C4A,
  windy:0x9DD96A, windyDark:0x6FA63E,
  impact:0xFF5FA2, sand:0xE8D7A8, sky:0x7FC4E0,
  ink:0x2A1A0E, porcelain:0xF0EDE5, water:0x5AC8E8,
  rock:0xAA8A66, cactus:0x6FA658,
  tile:0xF0EDE5, pipe:0xB8B2A8, chrome:0xDCDCDC,
  sewerGreen:0x3A5548, sewerDark:0x1A2E22, slime:0x6FA63E,
  bossRed:0xA63E3E, gold:0xFFD24D,
};
const ARENA = 32;

// ─── three setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.sky);
scene.fog = new THREE.Fog(C.sky, 45, 85);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 18, 0.01);
camera.lookAt(0, 0, 0);

const hemi = new THREE.HemisphereLight(C.cream, C.sand, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xFFFFFF, 0.95);
sun.position.set(10, 20, 8);
scene.add(sun);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ─── shared helpers for ctx ───────────────────────────────────────────────────
function toon(color, opts = {}) {
  const params = { color, ...opts };
  return new THREE.MeshLambertMaterial(params);
}
function withOutline(mesh, thickness = 0.06) {
  const outMat = new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide });
  const outGeo = mesh.geometry.clone();
  const outMesh = new THREE.Mesh(outGeo, outMat);
  outMesh.scale.setScalar(1 + thickness);
  mesh.add(outMesh);
}
function blobShadow(size = 0.7) {
  const geo = new THREE.CircleGeometry(size, 18);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 0.015;
  return m;
}
const ctx = { THREE, C, ARENA, toon, withOutline, blobShadow, scene };

// ─── enemy factories ──────────────────────────────────────────────────────────
function buildFlusher() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.7, 12), toon(C.porcelain));
  body.position.y = 0.35;
  withOutline(body, 0.07);
  g.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.9), toon(C.porcelain));
  lid.position.y = 0.74;
  g.add(lid);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.4), toon(C.porcelain));
  tank.position.set(0, 1.15, 0.35);
  withOutline(tank, 0.06);
  g.add(tank);
  for (const sx of [-0.14, 0.14]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), toon(C.ink));
    eye.position.set(sx, 1.25, 0.16);
    g.add(eye);
  }
  g.add(blobShadow(0.55));
  g.userData.stats = { hp: 2, speed: 2.5, radius: 0.55, score: 15, damage: 15, dropChance: 0.25 };
  return g;
}
function buildButtling() {
  const g = new THREE.Group();
  for (const sx of [-0.22, 0.22]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), toon(C.rival));
    cheek.position.set(sx, 0.35, 0);
    withOutline(cheek, 0.06);
    g.add(cheek);
  }
  const cleft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.35), toon(C.cleft));
  cleft.position.set(0, 0.35, 0);
  g.add(cleft);
  g.add(blobShadow(0.4));
  g.userData.stats = { hp: 1, speed: 3.6, radius: 0.4, score: 10, damage: 10, dropChance: 0.15 };
  return g;
}
function buildWindy() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), toon(C.windy));
  body.position.y = 0.55;
  withOutline(body, 0.07);
  g.add(body);
  const puff = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.14, 8, 14), toon(C.windyDark, {transparent: true, opacity: 0.6}));
  puff.rotation.x = Math.PI / 2;
  puff.position.y = 0.85;
  g.add(puff);
  g.add(blobShadow(0.5));
  g.userData.stats = { hp: 3, speed: 1.8, radius: 0.6, score: 20, damage: 12, dropChance: 0.35, toxic: true };
  return g;
}
function buildEnemyByKind(kind) {
  if (kind === 'flusher')     return buildFlusher();
  if (kind === 'buttling')    return buildButtling();
  if (kind === 'windy')       return buildWindy();
  if (kind === 'toiletGolem') return buildToiletGolem(ctx);
  if (kind === 'sewerRat')    return buildSewerRat(ctx);
  return buildFlusher();
}

// ─── bean projectile ──────────────────────────────────────────────────────────
function buildBean(color = C.beanGold) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), toon(color));
  b.scale.set(1.1, 0.8, 1.4);
  g.add(b);
  const dark = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), toon(C.beanDark));
  dark.scale.set(1.1, 0.5, 0.7);
  dark.position.y = -0.04;
  g.add(dark);
  return g;
}

// ─── pickup bean mesh ─────────────────────────────────────────────────────────
function buildPickupMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'bean') {
    const b = buildBean(C.beanGold);
    g.add(b);
  } else if (kind === 'heal') {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), toon(0xFF5F5F));
    h.position.y = 0.2;
    g.add(h);
    const plus1 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.36, 0.08), toon(0xFFFFFF));
    plus1.position.y = 0.2;
    g.add(plus1);
    const plus2 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.08), toon(0xFFFFFF));
    plus2.position.y = 0.2;
    g.add(plus2);
  } else {
    // power-up: glowing sphere color-coded
    const colorMap = { triple: 0x5FD9FF, rapid: 0xFFD24D, speed: 0x9DD96A, mega: 0xFF5FA2 };
    const color = colorMap[kind] || 0xFFFFFF;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), toon(color, {emissive: color, emissiveIntensity: 0.6}));
    core.position.y = 0.3;
    g.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 6, 14), toon(C.ink));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    g.add(ring);
  }
  g.add(blobShadow(0.3));
  return g;
}

// ─── GAME STATE ───────────────────────────────────────────────────────────────
export const game = {
  state: 'title',
  wave: 1,
  levelIdx: 0,
  killsInLevel: 0,
  player: null,
  playerObj: null,
  enemies: [],
  projectiles: [],
  enemyBeans: [],
  pickups: [],
  poofs: [],
  propRoot: null,
  lastShot: 0,
  dashCooldown: 0,
  waveTimer: 0,
  spawnQueue: 0,
  enemyCap: 12,
  score: 0,
  hiScore: 0,
  boss: null,
  rain: { timer: 30 },
  // v4
  stompCd: 0,
  gems: [],
  stats: null, xp: null,
  pendingModifier: false,
  // systems wired below
  sfx: null, floaters: null, combo: null, powerups: null, analytics: null, cam: null,
  picker: null,
};

// ─── HUD refs ─────────────────────────────────────────────────────────────────
const hud = {
  hpbar: document.getElementById('hpbar'),
  magRingFill: document.querySelector('#magRing .fill'),
  magText: document.getElementById('magText'),
  score: document.getElementById('score'),
  hiChip: document.getElementById('hiscoreChip'),
  levelName: document.getElementById('levelName'),
  levelProg: document.getElementById('levelProg'),
  comboCount: document.getElementById('comboCount'),
  comboMult:  document.getElementById('comboMult'),
  comboTimer: document.getElementById('comboTimer'),
  buffs: document.getElementById('buffs'),
  bossbar: document.getElementById('bossbar'),
  bossName: document.getElementById('bossName'),
  bosshp: document.getElementById('bosshp'),
  floaters: document.getElementById('floaters'),
  banner: document.getElementById('levelBanner'),
  xpwrap: document.getElementById('xpwrap'),
  xpbar: document.getElementById('xpbar'),
  stompChip: document.getElementById('stompChip'),
  stompCount: document.getElementById('stompCount'),
  clouds: document.getElementById('clouds'),
  titleOverlay: document.getElementById('title'),
  titleHi: document.getElementById('titleHi'),
  goOverlay: document.getElementById('gameover'),
  goScore: document.getElementById('goScore'),
  goLevel: document.getElementById('goLevel'),
  winOverlay: document.getElementById('winscreen'),
  winScore: document.getElementById('winScore'),
  devpanel: document.getElementById('devpanel'),
  devstats: document.getElementById('devstats'),
  devevents: document.getElementById('devevents'),
  muteBtn: document.getElementById('muteBtn'),
  crosshair: document.getElementById('crosshair'),
};

// ─── systems ──────────────────────────────────────────────────────────────────
game.sfx       = sfx;
game.floaters  = createFloaters(hud.floaters, camera);
game.combo     = createCombo({ windowSec: 2.0 });
game.analytics = createAnalytics(hud.devpanel, hud.devstats, hud.devevents);
game.hiScore   = game.analytics.loadHiScore();
game.cam       = createCamera(camera, canvas);
game.picker    = createPicker(document.body);
// powerups / stats / xp wired after player exists

// ─── clouds (2D parallax layer) ───────────────────────────────────────────────
buildClouds(hud.clouds);

function buildClouds(root) {
  if (!root) return;
  root.innerHTML = '';
  const n = 6;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'cloud';
    const size = 60 + Math.random() * 90;
    el.style.width  = `${size}px`;
    el.style.height = `${size * 0.55}px`;
    el.style.top    = `${4 + Math.random() * 32}%`;
    const startX = Math.random() * 100;
    el.style.left   = `${startX}%`;
    const dur = 60 + Math.random() * 50;
    el.style.transition = `transform ${dur}s linear`;
    root.appendChild(el);
    // drift
    const drift = () => {
      el.style.transform = `translateX(${Math.random() > 0.5 ? '' : '-'}40vw)`;
    };
    requestAnimationFrame(drift);
    setInterval(drift, dur * 1000);
  }
}

// ─── input state ──────────────────────────────────────────────────────────────
const keys = {};
const mouse = { x: 0, y: 0, world: new THREE.Vector3() };
let firing = false;

document.addEventListener('keydown', e => {
  if (e.repeat) {
    if (e.code === 'Space') e.preventDefault();
    return;
  }
  keys[e.code] = true;
  if (e.code === 'Space') {
    e.preventDefault();
    firing = true;
    if (game.state === 'play') fireNow();
  }
  if (e.code === 'KeyR') {
    if (game.state === 'play' && game.player) startReload(game.player, sfx);
    else if (game.state === 'gameover' || game.state === 'win') startGame();
  }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    if (game.state === 'play') tryDash();
  }
  if (e.code === 'KeyQ') {
    if (game.state === 'play') tryStomp();
  }
  if (e.code === 'KeyV') {
    if (game.state === 'play') {
      const m = game.cam.cycle();
      game.analytics.emit('cameraMode', { mode: m });
    }
  }
  if (e.code === 'KeyM') {
    sfx.setMuted(!sfx.isMuted());
    hud.muteBtn.textContent = sfx.isMuted() ? '🔇' : '🔊';
  }
  if (e.code === 'Backquote') {
    game.analytics.togglePanel();
  }
  if (e.code === 'Escape') {
    if (game.cam.mode() === 'fps') game.cam.exitPointerLock();
  }
  // FPS sensitivity live-tune: [ slower, ] faster
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    if (game.cam.mode() === 'fps' && game.cam.sensUp) {
      const s = e.code === 'BracketRight' ? game.cam.sensUp() : game.cam.sensDown();
      if (game.player && game.floaters) {
        game.floaters.spawn(
          new THREE.Vector3(game.player.x, 3, game.player.z),
          `SENS ${(s * 1000).toFixed(1)}`,
          '#FFD25A', true,
        );
      }
    }
  }
});
document.addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Space') firing = false;
});
document.addEventListener('mousemove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY;
});
document.addEventListener('mousedown', e => {
  if (game.state !== 'play') return;
  if (e.button !== 0) return;
  firing = true;
  fireNow();
});
document.addEventListener('mouseup', e => {
  if (e.button !== 0) return;
  firing = false;
});

// mouse → world on XZ plane (y=0.8) — used for aiming
const _raycaster = new THREE.Raycaster();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.8);
function updateMouseWorld() {
  const ndcX = (mouse.x / window.innerWidth) * 2 - 1;
  const ndcY = -(mouse.y / window.innerHeight) * 2 + 1;
  _raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  const hit = new THREE.Vector3();
  _raycaster.ray.intersectPlane(_plane, hit);
  if (hit) mouse.world.copy(hit);
}

hud.muteBtn.addEventListener('click', () => {
  sfx.setMuted(!sfx.isMuted());
  hud.muteBtn.textContent = sfx.isMuted() ? '🔇' : '🔊';
});
document.getElementById('devExport').addEventListener('click', () => game.analytics.exportJson());
document.getElementById('devClear').addEventListener('click', () => game.analytics.clearStored());
document.getElementById('devClose').addEventListener('click', () => game.analytics.showPanel(false));
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);
document.getElementById('winRestart').addEventListener('click', startGame);

// ─── fire / dash ──────────────────────────────────────────────────────────────
function fireNow() {
  const p = game.player;
  if (!p || game.state !== 'play') return;
  if (game.picker.isOpen()) return; // game is paused for a pick
  const now = performance.now() / 1000;
  // rate limit (scaled by upgrades + modifiers)
  const minCadence = 0.15 * (game.stats?.cadenceMult ?? 1);
  if (now - game.lastShot < minCadence) return;
  const shot = tryShoot(p, now, minCadence);
  if (!shot) return;
  game.lastShot = now;
  game.analytics.emit('shot', { score: game.score, level: game.levelIdx });

  // mega = 3x damage on next few shots
  const megaActive = game.powerups.megaShotsLeft() > 0;
  if (megaActive) game.powerups.consumeMega();
  const baseDmg = megaActive ? 3 : 1;
  const dmg = baseDmg * (game.stats?.dmgMult ?? 1);

  // spread: base 1 + extraShots from upgrades; also widens if triple power-up
  const triple = game.powerups.isActive('triple');
  const count = (triple ? 3 : 1) + (game.stats?.extraShots ?? 0);
  const spread = fanAngles(count);
  const beanScale = game.stats?.beanScale ?? 1;
  for (const ang of spread) {
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const ax = p.aimX * cos - p.aimZ * sin;
    const az = p.aimX * sin + p.aimZ * cos;
    spawnBean(p.x, p.z, ax, az, dmg, beanScale);
  }

  // recoil
  p.recoil.t  = 0.12;
  p.recoil.dx = -p.aimX * 1.2;
  p.recoil.dz = -p.aimZ * 1.2;

  sfx.shot();
}

function spawnBean(x, z, ax, az, dmg, scaleMult = 1) {
  const bean = buildBean(C.beanGold);
  if (scaleMult !== 1) bean.scale.setScalar(scaleMult);
  bean.position.set(x, 0.8, z);
  scene.add(bean);
  game.projectiles.push({
    obj: bean, x, z, y: 0.8,
    vx: ax * 30, vz: az * 30,
    life: 1.0, damage: dmg,
  });
}

// Produce N symmetric angles for a fan spread.
function fanAngles(n) {
  if (n <= 1) return [0];
  const step = 0.14;
  const out = [];
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) out.push((i - mid) * step);
  return out;
}

function spawnEnemyBean(x, z, ax, az, speed, damage) {
  const bean = buildBean(C.bossRed);
  bean.position.set(x, 0.8, z);
  scene.add(bean);
  game.enemyBeans.push({
    obj: bean, x, z,
    vx: ax * speed, vz: az * speed,
    life: 3.5, damage,
  });
}

function tryStomp() {
  const p = game.player;
  if (!p || game.stompCd > 0) return;
  const s = game.stats;
  if (!s || s.stompStock <= 0) return;
  s.stompStock -= 1;
  game.stompCd = 3.5;
  p.iFrames = Math.max(p.iFrames, 0.4);
  const RADIUS = 5.5;
  const DMG = 6 * (s.dmgMult ?? 1);
  // AOE damage
  for (let i = game.enemies.length - 1; i >= 0; i--) {
    const e = game.enemies[i];
    const dx = e.obj.position.x - p.x;
    const dz = e.obj.position.z - p.z;
    const dd = dx * dx + dz * dz;
    if (dd < RADIUS * RADIUS) {
      e.hp -= DMG;
      const d = Math.sqrt(dd) || 1;
      e.obj.position.x += (dx / d) * 1.6;
      e.obj.position.z += (dz / d) * 1.6;
      spawnPoof(e.obj.position.x, e.obj.position.z, C.impact, 3);
      if (e.hp <= 0) killEnemy(i);
    }
  }
  // also chip boss
  if (game.boss) {
    const bo = game.boss.obj.position;
    const dx = bo.x - p.x, dz = bo.z - p.z;
    if (dx * dx + dz * dz < (RADIUS + 1.5) ** 2) {
      game.boss.ref.hp -= DMG * 1.5;
      updateBossHud();
      if (game.boss.ref.hp <= 0) killBoss();
    }
  }
  // big shockwave visual
  spawnPoof(p.x, p.z, 0xFFD24D, 22);
  spawnPoof(p.x, p.z, 0xFFFFFF, 10);
  game.floaters.spawn(
    new THREE.Vector3(p.x, 3, p.z), 'STOMP!', '#FFD24D', true,
  );
  sfx.dash();
  game.analytics.emit('stomp');
}

function tryDash() {
  const p = game.player;
  if (!p || game.dashCooldown > 0) return;
  const { ix, iz } = readMoveInput(keys);
  let dx = ix, dz = iz;
  if (dx === 0 && dz === 0) { dx = p.aimX; dz = p.aimZ; }
  p.vx += dx * 18;
  p.vz += dz * 18;
  p.iFrames = 0.25;
  game.dashCooldown = 0.6;
  sfx.dash();
  game.analytics.emit('dash');
  spawnPoof(p.x, p.z, 0xffffff, 6);
}

function spawnPoof(x, z, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 + Math.random() * 0.12, 6, 5),
      toon(color)
    );
    const a = Math.random() * Math.PI * 2;
    const r = 0.2 + Math.random() * 0.3;
    dot.position.set(x + Math.cos(a) * r, 0.5 + Math.random() * 0.4, z + Math.sin(a) * r);
    scene.add(dot);
    game.poofs.push({
      obj: dot,
      vx: Math.cos(a) * (1 + Math.random() * 1.5),
      vy: 1 + Math.random() * 1.5,
      vz: Math.sin(a) * (1 + Math.random() * 1.5),
      life: 0.5 + Math.random() * 0.2,
    });
  }
}

// ─── level progression ────────────────────────────────────────────────────────
function enterLevel(idx) {
  const cfg = LEVELS[idx];
  if (!cfg) return;
  game.levelIdx = idx;
  game.killsInLevel = 0;
  if (game.propRoot) clearPropRoot(scene, game.propRoot);
  const { propRoot } = applyLevel(scene, hemi, sun, cfg, ctx);
  game.propRoot = propRoot;
  hud.levelName.textContent = cfg.name;
  hud.levelProg.textContent = `0 / ${cfg.kills}`;
  showBanner(cfg.name);
  sfx.startMusic(cfg.musicIdx);
  sfx.waveStart();
  game.analytics.emit('levelStart', { level: idx, name: cfg.name });
}

function showBanner(text) {
  hud.banner.textContent = text;
  hud.banner.classList.add('show');
  setTimeout(() => hud.banner.classList.remove('show'), 1500);
}

function pickEnemyKind(cfg) {
  const r = Math.random();
  let acc = 0;
  for (const e of cfg.enemyMix) {
    acc += e.weight;
    if (r <= acc) return e.kind;
  }
  return cfg.enemyMix[0].kind;
}

function spawnEnemyForLevel() {
  const cfg = LEVELS[game.levelIdx];
  if (!cfg) return;
  const kind = pickEnemyKind(cfg);
  const enemy = buildEnemyByKind(kind);
  // spawn at arena edge
  const a = Math.random() * Math.PI * 2;
  const r = ARENA - 3;
  enemy.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
  scene.add(enemy);
  const hpMult = game.stats?.enemyHpMult ?? 1;
  const hp = enemy.userData.stats.hp * hpMult;
  game.enemies.push({ obj: enemy, kind, hp, stats: enemy.userData.stats });
}

function spawnBoss() {
  const boss = buildClogKing(ctx);
  boss.position.set(0, 0, -ARENA + 5);
  scene.add(boss);
  game.boss = { obj: boss, ref: boss.userData.boss };
  hud.bossbar.classList.add('show');
  hud.bosshp.style.width = '100%';
  sfx.waveStart();
  showBanner('CLOG KING');
  game.analytics.emit('bossSpawn');
}

// ─── drop logic ───────────────────────────────────────────────────────────────
function maybeDropFromEnemy(x, z, stats) {
  const mult = game.stats?.dropMult ?? 1;
  const chance = Math.min(1, (stats.dropChance || 0.2) * mult);
  if (Math.random() > chance) return;
  const roll = Math.random();
  let kind;
  if      (roll < 0.30) kind = 'bean';
  else if (roll < 0.50) kind = 'heal';
  else if (roll < 0.65) kind = 'triple';
  else if (roll < 0.80) kind = 'rapid';
  else if (roll < 0.92) kind = 'speed';
  else                   kind = 'mega';
  dropPickup(x, z, kind, kind === 'bean' ? 2 : 1);
}
function dropBeanPickup(x, z, amount = 2) {
  dropPickup(x, z, 'bean', amount);
}
function dropPickup(x, z, kind, amount = 1) {
  const mesh = buildPickupMesh(kind);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  game.pickups.push({ obj: mesh, x, z, kind, amount, t: 0, life: 12 });
}

// ─── main loop ────────────────────────────────────────────────────────────────
let last = performance.now() / 1000;
function tick() {
  const now = performance.now() / 1000;
  let dt = now - last;
  if (dt > 0.1) dt = 0.1;
  last = now;

  if (game.state === 'play') {
    updateGame(dt, now);
  }
  game.floaters.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function updateGame(dt, now) {
  const p = game.player;
  if (!p) return;
  updateMouseWorld();

  // — player movement
  const { ix, iz } = readMoveInput(keys);
  const speedBoost = (game.stats?.speedMult ?? 1);
  applyMove(p, ix, iz, p.baseSpeed * speedBoost, dt);
  // arena clamp
  const dFromC = Math.hypot(p.x, p.z);
  if (dFromC > ARENA - 1) {
    p.x = (p.x / dFromC) * (ARENA - 1);
    p.z = (p.z / dFromC) * (ARENA - 1);
    p.vx *= 0.5; p.vz *= 0.5;
  }
  p.obj.position.set(p.x, 0, p.z);
  p.obj.rotation.y = p.rot;

  if (p.iFrames > 0) p.iFrames -= dt;
  if (game.dashCooldown > 0) game.dashCooldown -= dt;
  if (game.stompCd > 0) game.stompCd -= dt;
  updateReload(p, dt);

  // — camera
  game.cam.update(p, mouse.world);

  // — firing (held)
  if (firing) fireNow();

  // — projectiles
  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    const b = game.projectiles[i];
    b.x += b.vx * dt; b.z += b.vz * dt;
    b.life -= dt;
    b.obj.position.set(b.x, b.y, b.z);
    b.obj.rotation.y += dt * 8;

    // collide with enemies
    let hit = false;
    for (let j = game.enemies.length - 1; j >= 0; j--) {
      const e = game.enemies[j];
      const ex = e.obj.position.x, ez = e.obj.position.z;
      const dx = ex - b.x, dz = ez - b.z;
      if (dx * dx + dz * dz < (e.stats.radius + 0.25) ** 2) {
        e.hp -= b.damage;
        game.analytics.emit('hit', {});
        spawnPoof(ex, ez, C.impact, 3);
        hit = true;
        if (e.hp <= 0) killEnemy(j);
        break;
      }
    }
    // collide with boss
    if (!hit && game.boss) {
      const bo = game.boss.obj.position;
      const dx = bo.x - b.x, dz = bo.z - b.z;
      if (dx * dx + dz * dz < 2.5 * 2.5) {
        game.boss.ref.hp -= b.damage;
        game.analytics.emit('bossHit');
        spawnPoof(bo.x, bo.z, C.impact, 4);
        hit = true;
        if (game.boss.ref.hp <= 0) killBoss();
        updateBossHud();
      }
    }

    if (b.life <= 0 || hit) {
      scene.remove(b.obj);
      b.obj.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      game.projectiles.splice(i, 1);
    }
  }

  // — enemy beans (boss ring)
  for (let i = game.enemyBeans.length - 1; i >= 0; i--) {
    const b = game.enemyBeans[i];
    b.x += b.vx * dt; b.z += b.vz * dt;
    b.life -= dt;
    b.obj.position.set(b.x, 0.8, b.z);
    const dx = p.x - b.x, dz = p.z - b.z;
    let hit = false;
    if (dx * dx + dz * dz < 0.8 * 0.8) {
      damagePlayer(b.damage);
      hit = true;
    }
    if (b.life <= 0 || hit) {
      scene.remove(b.obj);
      b.obj.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      game.enemyBeans.splice(i, 1);
    }
  }

  // — enemies move + contact
  for (let i = game.enemies.length - 1; i >= 0; i--) {
    const e = game.enemies[i];
    const ex = e.obj.position.x, ez = e.obj.position.z;
    const dx = p.x - ex, dz = p.z - ez;
    const d = Math.hypot(dx, dz) || 1;
    const spd = e.stats.speed;
    e.obj.position.x += (dx / d) * spd * dt;
    e.obj.position.z += (dz / d) * spd * dt;
    e.obj.rotation.y = Math.atan2(dx, dz);
    if (d < e.stats.radius + 0.5 && p.iFrames <= 0) {
      damagePlayer(e.stats.damage);
      // knockback
      p.vx -= (dx / d) * 8;
      p.vz -= (dz / d) * 8;
    }
  }

  // — boss
  if (game.boss) {
    clogKingAI(game.boss.obj, p, dt, {
      spawnEnemyBean,
      damagePlayer,
      spawnPoof,
      sfx,
    });
  }

  // — pickups
  for (let i = game.pickups.length - 1; i >= 0; i--) {
    const pk = game.pickups[i];
    pk.t += dt; pk.life -= dt;
    pk.obj.position.y = 0.3 + Math.sin(pk.t * 4) * 0.08;
    pk.obj.rotation.y = pk.t * 2;
    const dx = p.x - pk.x, dz = p.z - pk.z;
    if (dx * dx + dz * dz < 1.1) {
      grabPickup(pk);
      scene.remove(pk.obj);
      pk.obj.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      game.pickups.splice(i, 1);
    } else if (pk.life <= 0) {
      scene.remove(pk.obj);
      pk.obj.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      game.pickups.splice(i, 1);
    }
  }

  // — poofs
  for (let i = game.poofs.length - 1; i >= 0; i--) {
    const d = game.poofs[i];
    d.life -= dt;
    d.obj.position.x += d.vx * dt;
    d.obj.position.y += d.vy * dt;
    d.obj.position.z += d.vz * dt;
    d.vy -= 6 * dt;
    d.obj.material.opacity = Math.max(d.life / 0.6, 0);
    d.obj.material.transparent = true;
    if (d.life <= 0) {
      scene.remove(d.obj);
      d.obj.geometry.dispose();
      d.obj.material.dispose();
      game.poofs.splice(i, 1);
    }
  }

  // — xp gems: magnet pull within range, collect on contact
  const magnet = (game.stats?.magnetRange ?? 1.1);
  const magnetSq = magnet * magnet;
  const GRAB_SQ = 0.8 * 0.8;
  for (let i = game.gems.length - 1; i >= 0; i--) {
    const g = game.gems[i];
    g.t += dt; g.life -= dt;
    g.obj.rotation.y = g.t * 2;
    const dx = p.x - g.x, dz = p.z - g.z;
    const dsq = dx * dx + dz * dz;
    if (dsq < magnetSq || g.grabbed) {
      g.grabbed = true;
      const d = Math.sqrt(dsq) || 1;
      const pull = 14;
      g.x += (dx / d) * pull * dt;
      g.z += (dz / d) * pull * dt;
    }
    g.obj.position.set(g.x, 0.35 + Math.sin(g.t * 6) * 0.08, g.z);
    if (dsq < GRAB_SQ) {
      game.xp.grant(g.value);
      game.score += g.value;
      sfx.pickup();
      scene.remove(g.obj);
      g.obj.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      game.gems.splice(i, 1);
      game.analytics.emit('gem', { value: g.value });
    } else if (g.life <= 0) {
      scene.remove(g.obj);
      g.obj.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      game.gems.splice(i, 1);
    }
  }

  // — combo decay + systems
  game.combo.decay(dt);
  game.powerups.update(dt);

  // — bean rain
  beanRainTick(game, dt, dropBeanPickup);

  // — wave logic (pre-boss) — pause while picker modal is open
  if (!game.boss && game.state === 'play' && !game.picker.isOpen()) {
    game.waveTimer -= dt;
    if (game.waveTimer <= 0 && game.enemies.length < game.enemyCap) {
      spawnEnemyForLevel();
      game.waveTimer = 0.6 + Math.random() * 0.9;
    }
  }

  // — HUD sync
  renderHud();
}

function renderHud() {
  const p = game.player;
  if (!p) return;
  hud.hpbar.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;

  const magRatio = p.mag.reloading ? (1 - p.mag.reloadT / p.mag.reloadTime) : (p.mag.cur / p.mag.max);
  const circumference = 2 * Math.PI * 17; // ≈106.81
  hud.magRingFill.setAttribute('stroke-dasharray', circumference.toFixed(2));
  hud.magRingFill.setAttribute('stroke-dashoffset', (circumference * (1 - magRatio)).toFixed(2));
  hud.magText.textContent = p.mag.reloading ? 'RELOADING' : `${p.mag.cur} / ${p.mag.max}`;

  hud.score.textContent = game.score;
  hud.hiChip.textContent = `HI ${Math.max(game.hiScore, game.score)}`;
  const cfg = LEVELS[game.levelIdx];
  if (cfg) hud.levelProg.textContent = `${game.killsInLevel} / ${cfg.kills}`;

  const cs = game.combo.snapshot();
  hud.comboCount.textContent = cs.count;
  hud.comboMult.textContent = `x${cs.mult}`;
  hud.comboTimer.style.width = `${Math.max(0, Math.min(100, (cs.timer / 2.0) * 100))}%`;

  game.powerups.renderHud();

  // v4 — xp bar
  if (game.xp && hud.xpbar) {
    const snap = game.xp.snapshot();
    hud.xpbar.style.width = `${Math.max(0, Math.min(100, snap.frac * 100))}%`;
    hud.xpwrap.setAttribute('data-lv', `LV ${snap.level}`);
  }

  // v4 — stomp chip state
  if (hud.stompChip && game.stats) {
    const ready = game.stompCd <= 0 && game.stats.stompStock > 0;
    hud.stompChip.classList.toggle('cooldown', !ready);
    hud.stompCount.textContent = game.stats.stompStock;
  }
}

function updateBossHud() {
  if (!game.boss) return;
  const ref = game.boss.ref;
  hud.bosshp.style.width = `${Math.max(0, (ref.hp / ref.maxHp) * 100)}%`;
}

function killEnemy(idx) {
  const e = game.enemies[idx];
  const ex = e.obj.position.x, ez = e.obj.position.z;
  scene.remove(e.obj);
  e.obj.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  game.enemies.splice(idx, 1);
  spawnPoof(ex, ez, C.impact, 8);

  // combo
  const cRes = game.combo.hit();
  const baseScore = e.stats.score || 10;
  const scoreMult = game.stats?.scoreMult ?? 1;
  const gained = Math.round(baseScore * cRes.mult * scoreMult);
  game.score += gained;
  game.killsInLevel += 1;
  game.analytics.emit('kill', { kind: e.kind, gained, score: game.score });

  // xp gem: value scales with enemy score tier; 1 / 2 / 5
  const tier = baseScore >= 20 ? 5 : (baseScore >= 15 ? 2 : 1);
  spawnGem(ex, ez, tier);

  // floater
  const pos = new THREE.Vector3(ex, 1.5, ez);
  const color = cRes.tier >= 2 ? '#FFD24D' : '#FFFFFF';
  game.floaters.spawn(pos, `+${gained}`, color, false);

  if (cRes.tierChanged) {
    sfx.comboTier(cRes.tier);
    game.floaters.spawn(
      new THREE.Vector3(game.player.x, 3, game.player.z),
      `COMBO x${cRes.mult}!`,
      '#FF5FA2', true
    );
  } else {
    sfx.impact();
  }

  maybeDropFromEnemy(ex, ez, e.stats);

  // level progression
  const cfg = LEVELS[game.levelIdx];
  if (cfg && !game.boss && game.killsInLevel >= cfg.kills) {
    if (cfg.boss === 'clog_king') {
      spawnBoss();
    } else {
      // advance level
      nextLevel();
    }
  }
}

function nextLevel() {
  const nextIdx = game.levelIdx + 1;
  sfx.levelUp();
  game.analytics.emit('levelUp', { level: nextIdx });
  if (nextIdx >= LEVELS.length) {
    winGame();
    return;
  }
  // heal partially
  if (game.player) game.player.hp = Math.min(game.player.maxHp, game.player.hp + 30);
  // modifier roulette before next level starts
  startLevelWithModifier(nextIdx, 'Pick a Modifier');
}

function killBoss() {
  const boss = game.boss;
  if (!boss) return;
  const bx = boss.obj.position.x, bz = boss.obj.position.z;
  scene.remove(boss.obj);
  boss.obj.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } });
  game.boss = null;
  hud.bossbar.classList.remove('show');
  sfx.levelUp();
  game.analytics.emit('bossKill', { score: game.score });
  // confetti
  for (const color of [0xFFD24D, 0xFF5FA2, 0x5FD9FF, 0x9DD96A]) {
    spawnPoof(bx, bz, color, 14);
  }
  game.score += 500;
  winGame();
}

function grabPickup(pk) {
  if (pk.kind === 'bean') {
    // beans are implicit now (mag refill) — just count as score
    game.score += 5;
    game.floaters.spawn(
      new THREE.Vector3(pk.x, 1.5, pk.z), '+5', '#FFD24D', false
    );
    // also refill a chunk of mag
    if (game.player) {
      game.player.mag.cur = Math.min(game.player.mag.max, game.player.mag.cur + 3);
    }
  } else if (pk.kind === 'heal') {
    game.player.hp = Math.min(game.player.maxHp, game.player.hp + 25);
    game.floaters.spawn(new THREE.Vector3(pk.x, 1.5, pk.z), '+25 HP', '#FF5F5F', false);
  } else {
    game.powerups.apply(pk.kind);
    game.floaters.spawn(new THREE.Vector3(pk.x, 1.5, pk.z), pk.kind.toUpperCase(), '#5FD9FF', true);
  }
  sfx.pickup();
  game.analytics.emit('pickup', { kind: pk.kind });
}

function damagePlayer(n) {
  const p = game.player;
  if (!p || p.iFrames > 0) return;
  p.hp -= n;
  p.iFrames = 0.5;
  sfx.hurt();
  game.floaters.spawn(new THREE.Vector3(p.x, 2, p.z), `-${n}`, '#FF4040', false);
  game.analytics.emit('hurt', { dmg: n, hp: Math.max(0, p.hp) });
  if (p.hp <= 0) {
    p.hp = 0;
    endGame('death');
  }
}

function winGame() {
  if (game.state !== 'play') return;
  game.state = 'win';
  sfx.stopMusic();
  sfx.levelUp();
  hud.winScore.textContent = game.score;
  hud.winOverlay.classList.remove('hide');
  if (game.score > game.hiScore) {
    game.hiScore = game.score;
    game.analytics.setHiScore(game.score);
  }
  game.analytics.emit('win', { score: game.score });
  game.analytics.saveSession('win');
}

function endGame(reason) {
  if (game.state !== 'play') return;
  game.state = 'gameover';
  sfx.stopMusic();
  sfx.death();
  hud.goScore.textContent = game.score;
  hud.goLevel.textContent = game.levelIdx + 1;
  hud.goOverlay.classList.remove('hide');
  if (game.score > game.hiScore) {
    game.hiScore = game.score;
    game.analytics.setHiScore(game.score);
  }
  game.analytics.emit('death', { score: game.score, level: game.levelIdx });
  game.analytics.saveSession(reason);
}

// ─── start / reset ────────────────────────────────────────────────────────────
function resetScene() {
  for (const e of game.enemies) scene.remove(e.obj);
  for (const b of game.projectiles) scene.remove(b.obj);
  for (const b of game.enemyBeans) scene.remove(b.obj);
  for (const p of game.pickups) scene.remove(p.obj);
  for (const d of game.poofs) scene.remove(d.obj);
  for (const g of game.gems) scene.remove(g.obj);
  if (game.boss) scene.remove(game.boss.obj);
  game.enemies.length = 0;
  game.projectiles.length = 0;
  game.enemyBeans.length = 0;
  game.pickups.length = 0;
  game.poofs.length = 0;
  game.gems.length = 0;
  game.boss = null;
}

function startGame() {
  sfx.init();
  resetScene();
  resetGems();
  hud.titleOverlay.classList.add('hide');
  hud.goOverlay.classList.add('hide');
  hud.winOverlay.classList.add('hide');
  hud.bossbar.classList.remove('show');
  game.picker.hide();

  // player
  if (!game.playerObj) {
    game.playerObj = buildButt(ctx);
    scene.add(game.playerObj);
  }
  game.player = makePlayer(game.playerObj);
  game.playerObj.position.set(0, 0, 0);

  game.powerups = createPowerups(game.player, hud.buffs);

  // v4 stats + xp must exist before enterLevel so HUD renders right.
  game.stats = createStats();
  game.xp = createXp({ onLevelUp: onXpLevelUp });
  game.stompCd = 0;

  game.score = 0;
  game.levelIdx = 0;
  game.killsInLevel = 0;
  // 3.2s warm-up so the player can get oriented, test movement, and feel
  // agency before the first enemy appears. Subsequent waves use 0.6–1.5s.
  game.waveTimer = 3.2;
  game.dashCooldown = 0;
  game.combo.reset();
  game.rain.timer = 30;
  game.state = 'play';
  hud.titleHi.textContent = game.hiScore;

  // modifier roulette before the run actually begins
  startLevelWithModifier(0, 'Pick a Run Modifier');
  game.analytics.emit('start', { hi: game.hiScore });
}

// Show modifier picker, then enter the named level once user picks.
function startLevelWithModifier(idx, title = 'Pick a Modifier') {
  const choices = pickThreeModifiers();
  game.picker.show(title, choices, (choice) => {
    choice.apply(game.stats);
    game.analytics.emit('modifier', { id: choice.id, level: idx });
    if (game.player) {
      game.floaters.spawn(
        new THREE.Vector3(game.player.x, 3, game.player.z),
        choice.name.toUpperCase(), '#5FD9FF', true,
      );
    }
    enterLevel(idx);
    showBanner('GET READY — MOVE WITH WASD');
  }, { color: '#5FD9FF' });
}

function onXpLevelUp(level) {
  // pause-by-modal: picker gates fire + stomp
  const choices = pickThreeUpgrades(game.stats);
  if (choices.length === 0) {
    // all upgrades maxed — just announce
    sfx.levelUp();
    game.floaters.spawn(
      new THREE.Vector3(game.player.x, 3, game.player.z),
      `LV ${level}!`, '#FFD24D', true,
    );
    return;
  }
  sfx.levelUp();
  game.picker.show(`LEVEL UP — LV ${level}`, choices, (choice) => {
    applyUpgrade(game.stats, choice, game.player);
    game.analytics.emit('upgrade', { id: choice.id, level });
    game.floaters.spawn(
      new THREE.Vector3(game.player.x, 3, game.player.z),
      `+${choice.name.toUpperCase()}`, '#FFD24D', true,
    );
  }, { color: '#FFD24D' });
}

function resetGems() {
  for (const g of game.gems) scene.remove(g.obj);
  game.gems.length = 0;
}

function spawnGem(x, z, value = 1) {
  const mesh = buildGemMesh(THREE, value);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  game.gems.push({ obj: mesh, x, z, value, t: 0, life: 25, grabbed: false });
}

// ─── dev hooks for playtest ───────────────────────────────────────────────────
window.__game = {
  forceKill(n = 1) {
    for (let i = 0; i < n && game.enemies.length > 0; i++) {
      game.enemies[0].hp = 0;
      killEnemy(0);
    }
    // if no enemies, just increment
    while (n-- > 0 && game.enemies.length === 0 && !game.boss) {
      const cfg = LEVELS[game.levelIdx];
      if (!cfg) break;
      game.killsInLevel += 1;
      if (game.killsInLevel >= cfg.kills) {
        if (cfg.boss === 'clog_king') spawnBoss();
        else nextLevel();
        break;
      }
    }
  },
  setLevel(i) { enterLevel(i); },
  cameraMode() { return game.cam.mode(); },
  get mag()    { return game.player?.mag; },
  get combo()  { return game.combo.snapshot(); },
  analyticsSession() { return game.analytics.sessionRollup(); },
  spawnBoss,
  spawnEnemyBean, damagePlayer, dropBeanPickup,
  game,
};

// ─── init UI ──────────────────────────────────────────────────────────────────
hud.titleHi.textContent = game.hiScore;
hud.muteBtn.textContent = sfx.isMuted() ? '🔇' : '🔊';

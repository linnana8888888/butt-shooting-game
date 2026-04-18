// upgrades.mjs — XP gems, level-up modal, round modifiers (v4)
//
// Adds the survivor.io-style addiction loop on top of the round-based shooter:
//   • enemies drop XP gems that pull via magnet
//   • every few levels, play pauses for a 3-card upgrade pick
//   • before each real level, a modifier roulette picks the run flavor

// ─── 1. STATS ─────────────────────────────────────────────────────────────────

export function createStats() {
  // Multipliers default to 1 so baseline is unchanged when no upgrades taken.
  return {
    dmgMult:     1,
    speedMult:   1,
    reloadMult:  1,
    extraShots:  0,          // +N beans per shot beyond the base 1
    magnetRange: 1.1,        // m, radius at which gems pull
    stompMax:    1,          // how many stomps held in reserve
    stompStock:  1,          // current
    maxHpBonus:  0,          // added to player.maxHp
    cadenceMult: 1,          // fire rate scale (0.5 = twice as fast)
    beanScale:   1,
    scoreMult:   1,
    enemyHpMult: 1,
    dropMult:    1,
    counts: {},              // {id: timesPicked} for max gating
  };
}

// ─── 2. XP TRACKER ────────────────────────────────────────────────────────────

export function createXp({ onLevelUp, firstThreshold = 5, growth = 1.4 } = {}) {
  let xp = 0;
  let level = 1;
  let next = firstThreshold;

  function grant(n) {
    xp += n;
    if (xp >= next) {
      xp -= next;
      level += 1;
      next = Math.ceil(firstThreshold * Math.pow(growth, level - 1));
      onLevelUp?.(level);
    }
  }

  function snapshot() {
    return { xp, level, next, frac: next > 0 ? xp / next : 0 };
  }

  function reset() {
    xp = 0; level = 1; next = firstThreshold;
  }

  return { grant, snapshot, reset };
}

// ─── 3. UPGRADE POOL ──────────────────────────────────────────────────────────

export const UPGRADES = [
  { id: 'dmg',   name: 'Bigger Beans',   desc: '+25% damage',
    icon: '💥', max: 8,
    apply: (s) => { s.dmgMult *= 1.25; } },
  { id: 'spd',   name: 'Fast Legs',      desc: '+12% move speed',
    icon: '💨', max: 6,
    apply: (s) => { s.speedMult *= 1.12; } },
  { id: 'fan',   name: 'Extra Spread',   desc: '+1 bean per shot',
    icon: '🔱', max: 3,
    apply: (s) => { s.extraShots += 1; } },
  { id: 'mag',   name: 'Magnet Up',      desc: '+1m gem pull range',
    icon: '🧲', max: 5,
    apply: (s) => { s.magnetRange += 1; } },
  { id: 'rld',   name: 'Quick Reload',   desc: '-20% reload time',
    icon: '⚡', max: 5,
    apply: (s) => { s.reloadMult *= 0.8; } },
  { id: 'hp',    name: 'Thicker Butt',   desc: '+25 max HP (and heal)',
    icon: '❤️', max: 5,
    apply: (s) => { s.maxHpBonus += 25; } },
  { id: 'stomp', name: 'Extra Stomp',    desc: '+1 stomp stock',
    icon: '🥾', max: 3,
    apply: (s) => { s.stompMax += 1; s.stompStock += 1; } },
];

// ─── 4. MODIFIER POOL ─────────────────────────────────────────────────────────

export const MODIFIERS = [
  { id: 'lowgrav',  name: 'Low Gravity',   desc: 'Everyone floats. Feel the hang time.',
    icon: '🌙',
    apply: (s) => { s.lowGrav = true; } },
  { id: 'sniper',   name: 'Sniper Only',   desc: '3× damage. Half fire rate.',
    icon: '🎯',
    apply: (s) => { s.dmgMult *= 3; s.cadenceMult *= 2.2; } },
  { id: 'giant',    name: 'Giant Beans',   desc: 'Huge beans. +50% damage.',
    icon: '🫘',
    apply: (s) => { s.beanScale *= 2.2; s.dmgMult *= 1.5; } },
  { id: 'fast',     name: 'Overclocked',   desc: '+40% fire rate.',
    icon: '⚡',
    apply: (s) => { s.cadenceMult *= 0.6; } },
  { id: 'rich',     name: 'Beanrush',      desc: '+75% drop rate.',
    icon: '💰',
    apply: (s) => { s.dropMult *= 1.75; } },
  { id: 'tough',    name: 'Hard Mode',     desc: 'Enemies +50% HP. +30% score.',
    icon: '💀',
    apply: (s) => { s.enemyHpMult *= 1.5; s.scoreMult *= 1.3; } },
];

// ─── 5. PICK-3 HELPERS ────────────────────────────────────────────────────────

export function pickThreeUpgrades(stats) {
  const avail = UPGRADES.filter(u => {
    const picked = stats.counts[u.id] || 0;
    return !u.max || picked < u.max;
  });
  return shuffle(avail).slice(0, 3);
}

export function pickThreeModifiers() {
  return shuffle(MODIFIERS.slice()).slice(0, 3);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function applyUpgrade(stats, upgrade, player) {
  upgrade.apply(stats);
  stats.counts[upgrade.id] = (stats.counts[upgrade.id] || 0) + 1;
  // side effects on the live player
  if (upgrade.id === 'rld' && player) {
    player.mag.reloadTime = Math.max(0.25, player.mag.reloadTime * 0.8);
  }
  if (upgrade.id === 'hp' && player) {
    player.maxHp += 25;
    player.hp = player.maxHp;
  }
}

// ─── 6. MODAL UI ──────────────────────────────────────────────────────────────
// We build the modal DOM once and reuse for both upgrade and modifier picks.
// Presentation follows the existing cream/ink card style from index.html.

export function createPicker(rootEl) {
  const overlay = document.createElement('div');
  overlay.id  = 'pickerOverlay';
  overlay.className = 'overlay hide';
  overlay.style.zIndex = '85'; // above game, below win/gameover (80)
  overlay.innerHTML = `
    <div class="card" style="max-width:720px;padding:22px 26px">
      <h1 id="pickerTitle" style="margin-bottom:14px"></h1>
      <div id="pickerCards"
           style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap"></div>
      <p class="hint" id="pickerHint">Click a card to choose.</p>
    </div>
  `;
  rootEl.appendChild(overlay);

  const titleEl = overlay.querySelector('#pickerTitle');
  const cardsEl = overlay.querySelector('#pickerCards');

  function show(title, choices, onPick, { color = '#FF5FA2' } = {}) {
    titleEl.textContent = title;
    titleEl.style.color = color;
    cardsEl.innerHTML = '';
    for (const choice of choices) {
      const btn = document.createElement('button');
      btn.style.cssText = [
        'flex:1 1 180px',
        'min-width:180px',
        'max-width:220px',
        'background:#FFF4D6',
        'border:4px solid #2A1A0E',
        'border-radius:16px',
        'box-shadow:0 4px 0 #2A1A0E',
        'padding:18px 14px',
        'cursor:pointer',
        'font-family:inherit',
        'text-align:center',
        'transition:transform 0.1s',
      ].join(';');
      btn.innerHTML = `
        <div style="font-size:40px;line-height:1">${choice.icon}</div>
        <div style="font-family:'Fredoka One',Fredoka,sans-serif;font-size:18px;color:#2A1A0E;margin-top:10px">${choice.name}</div>
        <div style="font-size:13px;opacity:0.8;margin-top:6px;line-height:1.35">${choice.desc}</div>
      `;
      btn.onmouseenter = () => { btn.style.transform = 'translateY(-3px)'; };
      btn.onmouseleave = () => { btn.style.transform = ''; };
      btn.onclick = () => {
        hide();
        onPick(choice);
      };
      cardsEl.appendChild(btn);
    }
    overlay.classList.remove('hide');
  }

  function hide() {
    overlay.classList.add('hide');
  }

  function isOpen() {
    return !overlay.classList.contains('hide');
  }

  return { show, hide, isOpen };
}

// ─── 7. XP GEM ENTITY ─────────────────────────────────────────────────────────
// Gems are small glowing crystals that pull toward the player within magnet
// range and grant xp when collected. Drop value scales with enemy score.

export function buildGemMesh(THREE, value) {
  const g = new THREE.Group();
  // color by tier: 1 = cyan, 2 = green, 5 = gold
  const color = value >= 5 ? 0xFFD24D : (value >= 2 ? 0x9DD96A : 0x5FD9FF);
  const mat = new THREE.MeshLambertMaterial({
    color, emissive: color, emissiveIntensity: 0.8,
  });
  // octahedron = crystal silhouette
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), mat);
  core.position.y = 0.35;
  g.add(core);
  // tiny ink outline using backface trick (mirrors withOutline)
  const outMat = new THREE.MeshBasicMaterial({ color: 0x2A1A0E, side: THREE.BackSide });
  const out = new THREE.Mesh(core.geometry.clone(), outMat);
  out.scale.setScalar(1.18);
  core.add(out);
  // tiny shadow disc
  const sh = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 10),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })
  );
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.01;
  g.add(sh);
  g.userData.value = value;
  return g;
}

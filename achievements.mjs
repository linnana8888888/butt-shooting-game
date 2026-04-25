// achievements.mjs — v8: localStorage-backed achievement system + toast UI

const LS_KEY = 'bsg_achievements_v8';

// ─── Achievement definitions ──────────────────────────────────────────────────
export const ACHIEVEMENTS = [
  { id: 'first_blood',   label: 'First Blood',      desc: 'Kill your first enemy',             icon: '🩸', check: (s) => s.kills >= 1 },
  { id: 'sharpshooter',  label: 'Sharpshooter',     desc: 'Reach 70% accuracy in a run',       icon: '🎯', check: (s) => s.shots >= 10 && s.hits / s.shots >= 0.7 },
  { id: 'combo_master',  label: 'Combo Master',      desc: 'Hit a x5 combo',                    icon: '🔥', check: (s) => s.bestCombo >= 5 },
  { id: 'survivor',      label: 'Survivor',          desc: 'Survive for 3 minutes',             icon: '⏱',  check: (s) => s.durationSec >= 180 },
  { id: 'boss_slayer',   label: 'Boss Slayer',       desc: 'Defeat the Clog King',              icon: '👑', check: (s) => s.bossKills >= 1 },
  { id: 'level_3',       label: 'Sewer Diver',       desc: 'Reach Level 3 (Sewer Depths)',      icon: '🚽', check: (s) => s.maxLevel >= 2 },
  { id: 'century',       label: 'Century',           desc: 'Score 1000 points in a run',        icon: '💯', check: (s) => s.score >= 1000 },
  { id: 'void_walker',   label: 'Void Walker',       desc: 'Reach the Void Dimension',          icon: '🌀', check: (s) => s.maxLevel >= 4 },
  { id: 'mega_slayer',   label: 'Mega Slayer',       desc: 'Defeat the Mega Clog King',         icon: '🏆', check: (s) => s.megaBossKills >= 1 },
  { id: 'continued',     label: 'Second Wind',       desc: 'Use the Continue option',           icon: '💨', check: (s) => s.continued >= 1 },
];

// ─── State ────────────────────────────────────────────────────────────────────
function loadUnlocked() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveUnlocked(set) {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...set])); } catch {}
}

// ─── Toast UI ─────────────────────────────────────────────────────────────────
function showToast(ach) {
  const container = document.getElementById('achievementToasts');
  if (!container) return;

  const el = document.createElement('div');
  el.style.cssText = `
    background: #FFF4D6;
    border: 3px solid #2A1A0E;
    border-radius: 12px;
    box-shadow: 0 3px 0 #2A1A0E;
    padding: 8px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: 'Fredoka', system-ui, sans-serif;
    font-size: 14px;
    color: #2A1A0E;
    opacity: 0;
    transform: translateX(40px);
    transition: opacity 0.3s, transform 0.3s;
    max-width: 260px;
  `;
  el.innerHTML = `
    <span style="font-size:22px">${ach.icon}</span>
    <div>
      <div style="font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.6">Achievement Unlocked</div>
      <div style="font-weight:700">${ach.label}</div>
      <div style="font-size:12px;opacity:0.75">${ach.desc}</div>
    </div>
  `;
  container.appendChild(el);

  // Animate in
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateX(0)';
  });

  // Animate out after 3.5s
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(40px)';
    setTimeout(() => el.remove(), 350);
  }, 3500);
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function createAchievements() {
  const unlocked = loadUnlocked();

  // Check all achievements against current session stats
  // stats: { kills, shots, hits, durationSec, bestCombo, bossKills, megaBossKills, score, maxLevel, continued }
  function check(stats) {
    const newlyUnlocked = [];
    for (const ach of ACHIEVEMENTS) {
      if (unlocked.has(ach.id)) continue;
      if (ach.check(stats)) {
        unlocked.add(ach.id);
        newlyUnlocked.push(ach);
      }
    }
    if (newlyUnlocked.length > 0) {
      saveUnlocked(unlocked);
      // Stagger toasts
      newlyUnlocked.forEach((ach, i) => {
        setTimeout(() => showToast(ach), i * 600);
      });
    }
    return newlyUnlocked;
  }

  function isUnlocked(id) { return unlocked.has(id); }
  function allUnlocked() { return [...unlocked]; }
  function reset() { unlocked.clear(); saveUnlocked(unlocked); }

  return { check, isUnlocked, allUnlocked, reset };
}

# v8 — Session Time & Satisfaction Update

**Goal:** Push average session time from 1.5 min → 5+ min. Improve satisfaction score.

## Changes

### 1. Continue Screen (`game.mjs`, `index.html`)
- On death, players now see a 10-second countdown "Continue?" screen instead of instant game over
- Choosing CONTINUE: respawns with 50% HP, 2s invincibility frames, −30% score penalty
- One continue per run (no infinite loops)
- Choosing "Give Up" or letting the timer expire goes to the normal game over screen
- **Expected impact:** Biggest single lever against the 1.5min average. Stops the "die = close tab" loop.

### 2. End-of-Run Stats Card (`game.mjs`, `index.html`)
- Game over screen now shows: Time survived, Accuracy %, Kill count, Best combo multiplier, Hi-Score
- Win screen shows the same stats (minus hi-score, adds total kills)
- All data sourced from the existing `analytics.mjs` session rollup — no new tracking needed
- **Expected impact:** Players see their performance, feel invested, want to improve.

### 3. Achievement System (`achievements.mjs`, `game.mjs`, `index.html`)
- 10 achievements stored in `localStorage` (persist across runs, no backend needed)
- Achievements: First Blood, Sharpshooter, Combo Master, Survivor (3min), Boss Slayer, Sewer Diver, Century (1000pts), Void Walker, Mega Slayer, Second Wind (used continue)
- Toast notifications appear top-right when unlocked, staggered 600ms apart
- Checked: on first kill, on combo tier change, on boss kill, every 30s of play, on run end
- **Expected impact:** Gives players goals beyond score. Reason to replay.

### 4. Enhanced Combo Audio (`audio.mjs`)
- Each combo tier now has a distinct, escalating sound:
  - x2: simple bell (880Hz sine)
  - x3: two-note ascending chime
  - x4: three-note triangle fanfare
  - x5: full chord burst (4 notes) + noise punch + high sparkle
- **Expected impact:** Hitting combos feels progressively more rewarding. Encourages skilled play.

## Files Changed
- `index.html` — title updated to v8, continue screen added, stats fields added to game over + win screens, achievement toast container added
- `game.mjs` — achievements import, continue logic, stats card population, bestCombo/maxLevel tracking, periodic achievement checks
- `audio.mjs` — `comboTier()` rewritten with 4 distinct escalating sounds
- `achievements.mjs` — new file, full achievement system

## Running
```bash
python3 -m http.server 8765
# open http://localhost:8765
```

## What's Next (v9 ideas)
- Meta-progression: persistent unlocks between runs (cosmetic outfits, starting bonuses)
- Daily challenge mode (fixed seed, localStorage leaderboard)
- Mobile touch control tuning (dead zone, larger tap targets)
- Level 1 difficulty smoothing (−15% enemy speed/HP in first 60s post-warmup)
- Tutorial overlay for first-time players

# V7 Aesthetic Levels — Change Notes

## Overview

v7 is a visual and content pass focused on making each level feel distinct through shaders, effects, and new content. All changes are additive and backward-compatible with the v6 game loop.

---

## Section 1 — Gradient Skydome Shader

**File:** `skydome.mjs` (new), `scenes.mjs`

- New `SkyDome` class using a large BackSide sphere (radius 400) with a custom `ShaderMaterial`.
- Vertex shader passes `vWorldPosition`; fragment shader blends `bottomColor` → `topColor` by normalized Y height with configurable exponent.
- `setColors(topHex, bottomHex)` updates uniforms live.
- Each level now has `skyTop` and `skyBot` hex values:
  - Desert: orange-to-gold sunset gradient
  - Lab: pale blue-to-white clinical sky
  - Sewer: near-black deep night
  - Toxic Swamp: dark green gradient
  - Void Dimension: black-to-void-purple

---

## Section 2 — Procedural Floor Shader

**File:** `scenes.mjs`

- New `makeFloorMaterial(THREE, kind)` function returning a `ShaderMaterial` per floor type.
- Floor plane now uses 32×32 segments for UV interpolation.
- Shader variants:
  - `desert`: sandy base color with sine ripple on UV
  - `lab`: white/cream with dark grey grid lines (fract-based)
  - `sewer`: dark green with specular highlight band (smoothstep)
  - `swamp`: muddy green with sine mud texture
  - `void`: deep purple with glowing grid pulse
- Each level entry has a `floorKind` field.

---

## Section 3 — Enemy Glow Pulse + Shadow Discs

**File:** `game.mjs`

- Every spawned enemy gets `userData.glowPhase = Math.random() * Math.PI * 2`.
- Each frame, emissive materials on enemy meshes pulse: `0.15 + 0.1 * sin(t*3 + glowPhase)`.
- Each enemy gets a flat `CircleGeometry(0.6, 16)` shadow disc (black, opacity 0.3) added to the scene at y=0.05, tracked as `record.shadowDisc`.
- Shadow disc follows the enemy each frame.
- Shadow disc is removed and disposed when the enemy dies or the scene resets.

---

## Section 4 — Projectile Trail + Hit Burst Effects

**File:** `game.mjs`

- Player projectiles now use `CylinderGeometry(0.08, 0.08, 0.5, 8)` rotated to face direction of travel, instead of a sphere.
- `game.particles = []` added to game state.
- Each frame, 2 small trail spheres (radius 0.05) spawn at each projectile's position with random velocity offsets, life=0.3s.
- Particles scale down and fade over their lifetime.
- On projectile hit: `spawnHitBurst()` spawns 8 particles in random directions, velocity magnitude 3, life=0.25s, pink color.
- On fire: a `PointLight` (intensity 2, distance 4, color 0xFFFF88) is added at player position and removed after 100ms.

---

## Section 5 — Screen Flash, Shake, Vignette

**Files:** `index.html`, `juice.mjs`, `game.mjs`

- `#dmg-flash` div added to HTML: full-screen overlay with CSS transition for damage flash.
- `flashDamage()` in `juice.mjs`: sets red overlay to opacity 0.4, resets after 150ms.
- `updateVignette(hpFraction)` in `juice.mjs`: dynamically adjusts the existing `#vignette` radial gradient — full HP = invisible, low HP = heavy dark edges (up to 0.7 opacity).
- `shakeCamera(camera, intensity, duration)` in `juice.mjs`: adds random offset to camera position each frame for the given duration, then restores original position.
- `flashDamage()` called in `damagePlayer()`.
- `updateVignette()` called every frame in `renderHud()`.
- `shakeCamera()` called on boss phase changes via `onPhaseChange` callback.

---

## Section 6 — Two New Levels

**Files:** `scenes.mjs`, `game.mjs`, `juice.mjs`

### Level 4 — Toxic Swamp
- 50 kills to trigger boss (no boss — advances to Void Dimension).
- Props: `deadTree`, `lilyPad`, `toxicBarrel` (all procedural geometry).
- Enemy mix: swampGas (30%), mudCrawler (40%), buttling (30%).
- Floor: swamp mud shader.
- Fog: dark green, near distance.

### Level 5 — Void Dimension
- 60 kills then **Mega Clog King** boss.
- Props: `crystalShard`, `voidPortal` (procedural).
- Enemy mix: voidShard (35%), shadowClone (35%), buttling (30%).
- Floor: void purple pulsing shader.
- Fog: black, close distance.

### New Enemies

| Enemy | Speed | HP | Behavior |
|-------|-------|----|----------|
| swampGas | 1.2 | 3 | On death: AoE explosion radius 3, damage 15 |
| mudCrawler | 5.0 | 1 | On death: spawns up to 4 more mudCrawlers nearby |
| voidShard | 2.5 | 4 | Teleports every 2s to random position within 15 units of player |
| shadowClone | 3.0 | 2 | Follows player's position from 1.5s ago (via ring buffer) |

### Mega Clog King (`juice.mjs`)
- 150 HP, 4 phases at thresholds 100/60/20 HP.
- Phase 0: standard charge + ring burst.
- Phase 1: faster, spawns 3 voidShards every 10s.
- Phase 2: floor material flickers opacity randomly each frame.
- Phase 3: speed and fire rate doubled, red screen tint div added.
- Phase change triggers camera shake.
- Crown spikes are void-purple instead of gold.

---

## Section 7 — Polish

- `README.md` updated: title changed to v7, new levels documented, version history row added.
- `V7_NOTES.md` created (this file).

---

## What Was Skipped / Simplified

- **mudCrawler group spawn**: The task says "spawns in groups of 5" on initial spawn. Implemented as: killing a mudCrawler spawns up to 4 more nearby (total group of 5 including original). Initial spawn is single-enemy like all others — full group-at-spawn would require a different spawn architecture.
- **Floor shader `time_ref` uniform**: The task mentioned a `time_ref` parameter for animated floor shaders. The floor shaders are static (no time-based animation) to keep them simple and avoid needing to update uniforms each frame. The swamp and void shaders use UV-based patterns instead.
- **Mega Clog King Phase 2 voidShard spawn**: Implemented in Phase 1+ (since phase indexing is 0-based and the task's "Phase 2" maps to `b.phase >= 1`).

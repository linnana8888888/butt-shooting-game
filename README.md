# Butt Shooting Game v6

Arcade-style 3D shooter built with Three.js. Three themed levels, a boss fight, survivor.io-style upgrade loop, combo system, mobile touch controls, and analytics — all in vanilla ES modules, no bundler.

https://github.com/linnana8888888/butt-shooting-game/raw/main/butt_shot.mp4

![Desktop gameplay](qa/v6_desktop_gameplay.png)

## Play

```bash
python3 -m http.server 8765
# open http://localhost:8765
```

Works on desktop and mobile browsers. ES modules require HTTP — `file://` won't work.

## Controls

### Desktop

| Key | Action |
|-----|--------|
| WASD / Arrows | Move |
| Mouse | Aim |
| Space / Click | Fire |
| R | Reload (auto when empty) |
| Q | Stomp (AoE around player) |
| Shift | Dash (0.6s cooldown, 0.25s i-frames) |
| V | Cycle camera: top-down / chase / FPS |
| \[ / \] | Adjust FPS sensitivity |
| M | Mute (persisted) |
| \` | Toggle analytics panel |
| Esc | Exit pointer lock |

### Mobile

On-screen joystick (left) for movement, FIRE button (right) to shoot, plus RELOAD and STOMP buttons. The game auto-detects touch devices and adapts the HUD.

![Phone title screen](qa/v6_phone_title.png)

## Levels

1. **Desert Dunes** — 20 kills to advance. Flushers, buttlings, windies. Cacti and rocks.
2. **Porcelain Lab** — 30 kills. Adds toilet golems. Toilets, pipes, tiles.
3. **Sewer Depths** — 40 kills then **Clog King** boss (80 HP, 3 phases).

Win condition: defeat the Clog King.

## Mechanics

- **Magazine** — 10 beans, 1.2s auto-reload. Unlimited reserve.
- **Combo** — 2s window. Tiers at 5 / 10 / 20 / 40 kills for x2 / x3 / x4 / x5 score.
- **Powerups** — drop from kills: triple shot, rapid fire, speed boost, mega damage.
- **XP gems** — enemies drop gems with magnet pull. Level up to pick from 3 upgrades (damage, speed, reload, extra shots, magnet range, stomp stock, etc.).
- **Modifiers** — roulette before each level adds a run-shaping twist.
- **Warmup dummies** — first 10s of level 1 spawns easy 1-HP flushers for an instant action hook.
- **Healthkit beacon** — pulsing pickup that restores HP.
- **Outfit overlay** — cosmetic variation on the butt.
- **Bean rain** — 5 bean pickups every 30s.
- **Hi-score** — persisted in localStorage.

## Modules

```
index.html            HUD shell, CSS, importmap
game.mjs              Main loop, state, levels, enemies, projectiles
player.mjs            Butt model, movement, magazine/reload, input
camera.mjs            Top-down / chase / FPS cycle, pointer lock, sensitivity
audio.mjs             WebAudio SFX + procedural music (3 level tracks)
scenes.mjs            Level configs, props, enemy builders
juice.mjs             Floaters, combo, powerups, Clog King AI, bean rain
upgrades.mjs          XP gems, level-up picker, modifier roulette, stats
upgrade_offers.mjs    Early upgrade guarantee, diversity, pity timer
spawn_scheduler.mjs   Warmup dummy phase for level 1
beacon_renderer.mjs   Healthkit beacon visuals
analytics.mjs         Event log, localStorage rollup, dev panel
```

## Dev hooks (`window.__game`)

```js
__game.setLevel(0|1|2)        // jump to level
__game.forceKill(n)            // force-kill n enemies
__game.spawnBoss()             // spawn Clog King
__game.cameraMode()            // current mode string
__game.mag                     // { cur, max, reloading, ... }
__game.combo                   // { count, tier, mult, timer }
__game.analyticsSession()      // current session rollup
__game.game                    // full state object
```

## Playtest

```bash
python3 -m http.server 8765 &
node playtest.mjs              # screenshots in ./qa/
```

Additional playtest scripts: `playtest_bot.mjs`, `playtest_new_ideas.mjs`, `playtest_v4.mjs`.

## Version history

| Version | Highlights |
|---------|-----------|
| v2 | Initial HTML build + playtest harness |
| v3 | Module split, 3 levels, boss fight, combo, analytics |
| v4 | XP gems, level-up upgrades, stomp, modifier roulette, warmup dummies, healthkit beacon, outfit overlay |
| v5 | Mobile HUD, on-screen joystick, touch fire/reload/stomp |
| v6 | Responsive mobile adaptation, compact phone HUD, scaled touch controls, landscape support, iOS audio fix |

## Tech

Built with [Three.js r160](https://unpkg.com/three@0.160.0/) via importmap. No bundler, no framework.

# Iteration Contract — shared schema for GOALS, bot, and phase spec

**Purpose:** pin types/names once so the three parallel agents don't drift.
Any metric name in GOALS.md MUST appear in the telemetry schema below, and the
playtest bot MUST emit it. The phase spec references this file by path.

## 1. Telemetry schema (what playtest_bot.mjs writes per run)

File: `telemetry/<iso8601>-<run-id>.json`

```jsonc
{
  "schema_version": 1,
  "run_id": "string",                    // uuid or timestamp-based
  "started_at": "ISO-8601",
  "duration_sec": 0,                     // actual wall-clock in play state
  "outcome": "win|death|timeout|quit",
  "iteration_tag": "string",             // e.g., "v4.0", "v4.1"; set by runner
  "seed": 0,                             // RNG seed for reproducibility

  // ── Core funnel metrics ────────────────────────────────────────────────
  "session_duration_sec": 0,             // time from first input to death/win
  "levels_reached": 0,                   // 0, 1, 2 (or 3 for boss-clear)
  "score": 0,
  "hi_score_beaten": false,

  // ── Combat metrics ─────────────────────────────────────────────────────
  "shots_fired": 0,
  "shots_hit": 0,
  "accuracy": 0.0,                       // hits / max(1, shots)
  "kills": 0,
  "kills_per_min": 0.0,
  "boss_hits": 0,
  "boss_kills": 0,

  // ── Survival metrics ───────────────────────────────────────────────────
  "damage_taken": 0,
  "times_hurt": 0,
  "dashes_used": 0,
  "stomps_used": 0,

  // ── Progression metrics ────────────────────────────────────────────────
  "xp_gained": 0,
  "xp_levels": 0,                        // level-ups during run
  "upgrades_picked": [],                 // ["dmg","fan","rld",...] in order
  "modifiers_picked": [],                // ["sniper","giant",...]
  "gems_collected": 0,
  "pickups_collected": 0,

  // ── Pacing / feel ──────────────────────────────────────────────────────
  "time_to_first_kill_sec": 0.0,
  "time_to_first_levelup_sec": 0.0,
  "longest_idle_sec": 0.0,               // max gap with no player action
  "camera_mode_switches": 0,

  // ── Raw event log (bounded) ────────────────────────────────────────────
  "events": []                           // last 400 events from analytics.mjs
}
```

**Units:** seconds, unitless counts, 0–1 fractions. No "ms", no percentages.

## 2. Metric names available to GOALS.md

GOALS.md MUST only reference these names (verbatim):

```
session_duration_sec
levels_reached
score
accuracy
kills_per_min
damage_taken
dashes_used
stomps_used
xp_levels
upgrades_picked        (array; length or content)
gems_collected
pickups_collected
time_to_first_kill_sec
time_to_first_levelup_sec
longest_idle_sec
outcome                (enum)
```

Aggregates (over N bot runs) allowed: `median`, `p25`, `p75`, `rate` (fraction
of runs matching a condition). Example: `median(session_duration_sec) >= 180`.

## 3. File paths (absolute where it matters)

| Artifact | Path |
|---|---|
| Goals doc | `butt-shooting-game/GOALS.md` |
| Bot script | `butt-shooting-game/playtest_bot.mjs` |
| Telemetry dir | `butt-shooting-game/telemetry/` |
| Contract (this file) | `butt-shooting-game/ITERATION_CONTRACT.md` |
| Phase spec | `butt-shooting-game/docs/code-play-phase-spec.md` |

## 4. Tone / length budget

- GOALS.md: ~40 lines. 5–7 targets, each with threshold + rationale + metric.
- playtest_bot.mjs: ~200 lines. Reuses playwright setup from `playtest_v4.mjs`.
- Phase spec: ~80 lines. Concrete enough for a code-play developer to wire up.

## 5. Non-goals (for this first cut)

- No per-player personalization. Bot is a single random-walk policy.
- No learning loop across runs. Each run is independent.
- No cross-artifact comparisons. Scope = butt-shooting-game only.

/**
 * server.mjs — Butt Shooting Game: 2-Player Co-op PvE WebSocket Server
 *
 * Architecture:
 *   - Rooms hold up to 2 players; identified by a 4-letter code
 *   - Server-authoritative simulation at 60 Hz; state broadcast at 20 Hz
 *   - Rooms auto-cleanup after 10 min of idle (no connected players)
 *
 * Message protocol (JSON over WebSocket):
 *   Client → Server:
 *     {type:"create"}                                  — create a new room
 *     {type:"join", code:"ABCD"}                       — join existing room
 *     {type:"ready"}                                   — signal ready / rematch
 *     {type:"input", keys:{w,a,s,d}, aimX, aimZ,
 *                    shoot:bool, reload:bool}          — player input (in-game)
 *
 *   Server → Client:
 *     {type:"room", code, playerId}                    — room joined
 *     {type:"start", seed}                             — both ready, game begins
 *     {type:"state", tick, players, enemies,
 *                    projectiles, pickups,
 *                    wave, killsInWave, killTarget,
 *                    score}                            — 20 Hz state snapshot
 *     {type:"event", kind, data}                       — discrete game events
 *     {type:"peer_disconnect"}                         — other player left
 *     {type:"error", message}                          — protocol errors
 */

import { WebSocketServer } from 'ws';

// ─── Constants ───────────────────────────────────────────────────────────────

const PORT            = 3000;
const ARENA_RADIUS    = 32;
const TICK_RATE       = 60;          // Hz — simulation
const BROADCAST_RATE  = 20;          // Hz — state snapshots
const TICK_DT         = 1 / TICK_RATE;
const ROOM_IDLE_MS    = 10 * 60 * 1000; // 10 min

// Player constants
const PLAYER_SPEED    = 6;
const PLAYER_RADIUS   = 0.5;
const PLAYER_MAX_HP   = 100;
const PLAYER_IFRAME   = 0.5;         // seconds of invincibility after hit
const BEAN_SPEED      = 30;
const BEAN_LIFETIME   = 1.0;
const BEAN_DAMAGE     = 25;
const BEAN_RADIUS     = 0.18;
const MAG_SIZE        = 6;
const RELOAD_TIME     = 1.5;

// Pickup constants
const PICKUP_RADIUS   = 0.8;
const PICKUP_LIFETIME = 15;
const PICKUP_DROP_CHANCE = 0.20;
const HEAL_AMOUNT     = 25;

// Enemy type definitions
const ENEMY_TYPES = {
  buttling:  { hp: 1, speed: 3.6, radius: 0.4,  score: 10, damage: 10 },
  flusher:   { hp: 2, speed: 2.5, radius: 0.55, score: 15, damage: 15 },
  windy:     { hp: 3, speed: 1.8, radius: 0.6,  score: 20, damage: 12 },
  swampGas:  { hp: 3, speed: 1.2, radius: 0.55, score: 18, damage: 12 },
  mudCrawler:{ hp: 1, speed: 5.0, radius: 0.35, score: 8,  damage: 8  },
};

// Enemy pool per wave tier
function enemyPoolForWave(wave) {
  const pool = ['buttling'];
  if (wave >= 3) pool.push('flusher');
  if (wave >= 5) pool.push('windy');
  if (wave >= 7) pool.push('swampGas');
  if (wave >= 9) pool.push('mudCrawler');
  return pool;
}

// Kill target for wave N
function killTarget(wave) {
  return Math.min(10 + (wave - 1) * 5, 30);
}

// Enemy cap
function enemyCap(wave, playerCount) {
  const base = Math.min(12 + (wave - 1) * 2, 20);
  return playerCount >= 2 ? Math.floor(base * 1.5) : base;
}

// Spawn interval (seconds)
function spawnInterval(wave) {
  return Math.max(0.3, 1.5 - wave * 0.1);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

let _uidCounter = 0;
function uid(prefix = 'x') {
  return `${prefix}_${++_uidCounter}`;
}

function randCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}

function clampToArena(x, z) {
  const d = Math.sqrt(x * x + z * z);
  if (d > ARENA_RADIUS) {
    const s = ARENA_RADIUS / d;
    return { x: x * s, z: z * s };
  }
  return { x, z };
}

function spawnOnEdge() {
  const angle = Math.random() * Math.PI * 2;
  return {
    x: Math.cos(angle) * ARENA_RADIUS,
    z: Math.sin(angle) * ARENA_RADIUS,
  };
}

function send(ws, obj) {
  if (ws && ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify(obj));
  }
}

// ─── Room / Game State ────────────────────────────────────────────────────────

class Room {
  constructor(code) {
    this.code        = code;
    this.players     = {};   // playerId (1|2) → PlayerState
    this.sockets     = {};   // playerId → WebSocket
    this.readyFlags  = {};   // playerId → bool
    this.phase       = 'lobby'; // 'lobby' | 'playing' | 'gameover'
    this.idleTimer   = null;

    // Simulation state
    this.tick        = 0;
    this.enemies     = {};
    this.projectiles = {};
    this.pickups     = {};
    this.wave        = 1;
    this.killsInWave = 0;
    this.score       = 0;
    this.gameStartTime = 0;
    this.spawnAccum  = 0;

    this._tickInterval      = null;
    this._broadcastInterval = null;

    this._resetIdleTimer();
  }

  // ── Lobby ──────────────────────────────────────────────────────────────────

  addPlayer(playerId, ws) {
    this.sockets[playerId] = ws;
    this.readyFlags[playerId] = false;
    this._clearIdleTimer();
  }

  removePlayer(playerId) {
    delete this.sockets[playerId];
    delete this.readyFlags[playerId];

    if (Object.keys(this.sockets).length === 0) {
      this._resetIdleTimer();
    }
  }

  connectedCount() {
    return Object.keys(this.sockets).length;
  }

  markReady(playerId) {
    this.readyFlags[playerId] = true;
    const ids = Object.keys(this.sockets);
    if (ids.length === 2 && ids.every(id => this.readyFlags[id])) {
      this._startGame();
    }
  }

  // ── Game Lifecycle ─────────────────────────────────────────────────────────

  _startGame() {
    this.phase       = 'playing';
    this.tick        = 0;
    this.enemies     = {};
    this.projectiles = {};
    this.pickups     = {};
    this.wave        = 1;
    this.killsInWave = 0;
    this.score       = 0;
    this.spawnAccum  = 0;
    this.gameStartTime = Date.now();

    // Initialise players at symmetric starting positions
    const ids = Object.keys(this.sockets).map(Number);
    ids.forEach((id, i) => {
      const angle = (i / ids.length) * Math.PI * 2;
      this.players[id] = {
        id,
        x: Math.cos(angle) * 4,
        z: Math.sin(angle) * 4,
        hp: PLAYER_MAX_HP,
        maxHp: PLAYER_MAX_HP,
        aimX: 0,
        aimZ: -1,
        score: 0,
        mag: MAG_SIZE,
        reloading: false,
        reloadTimer: 0,
        iFrameTimer: 0,
        dead: false,
        // latest input snapshot
        keys: { w: false, a: false, s: false, d: false },
        shoot: false,
        shootConsumed: false,
        reload: false,
      };
    });

    const seed = Math.random();
    this._broadcast({ type: 'start', seed });

    // 60 Hz simulation tick
    this._tickInterval = setInterval(() => this._simTick(), 1000 / TICK_RATE);
    // 20 Hz broadcast
    this._broadcastInterval = setInterval(() => this._broadcastState(), 1000 / BROADCAST_RATE);
  }

  _stopGame() {
    clearInterval(this._tickInterval);
    clearInterval(this._broadcastInterval);
    this._tickInterval = null;
    this._broadcastInterval = null;
  }

  _restartForRematch() {
    // Reset ready flags; players call {type:"ready"} again
    Object.keys(this.sockets).forEach(id => { this.readyFlags[id] = false; });
    this.phase = 'lobby';
  }

  // ── Simulation ─────────────────────────────────────────────────────────────

  _simTick() {
    if (this.phase !== 'playing') return;
    this.tick++;
    const dt = TICK_DT;

    const alivePlayers = Object.values(this.players).filter(p => !p.dead);
    const playerCount  = Object.keys(this.sockets).length;

    // 1. Move players
    for (const p of Object.values(this.players)) {
      if (p.dead) continue;

      // Reload timer
      if (p.reloading) {
        p.reloadTimer -= dt;
        if (p.reloadTimer <= 0) {
          p.reloading   = false;
          p.reloadTimer = 0;
          p.mag         = MAG_SIZE;
        }
      }

      // iFrames timer
      if (p.iFrameTimer > 0) p.iFrameTimer -= dt;

      // Movement
      let vx = 0, vz = 0;
      if (p.keys.w) vz -= 1;
      if (p.keys.s) vz += 1;
      if (p.keys.a) vx -= 1;
      if (p.keys.d) vx += 1;
      const vLen = Math.sqrt(vx * vx + vz * vz);
      if (vLen > 0) {
        vx /= vLen; vz /= vLen;
        const clamped = clampToArena(p.x + vx * PLAYER_SPEED * dt, p.z + vz * PLAYER_SPEED * dt);
        p.x = clamped.x;
        p.z = clamped.z;
      }

      // Aim
      const aimLen = Math.sqrt(p.aimX * p.aimX + p.aimZ * p.aimZ);
      if (aimLen > 0.01) {
        p.aimX /= aimLen;
        p.aimZ /= aimLen;
      }

      // Shoot
      if (p.shoot && !p.shootConsumed && !p.reloading && p.mag > 0) {
        p.mag--;
        p.shootConsumed = true;
        const bId = uid('b');
        this.projectiles[bId] = {
          id: bId,
          x: p.x + p.aimX * (PLAYER_RADIUS + BEAN_RADIUS + 0.05),
          z: p.z + p.aimZ * (PLAYER_RADIUS + BEAN_RADIUS + 0.05),
          vx: p.aimX * BEAN_SPEED,
          vz: p.aimZ * BEAN_SPEED,
          ownerId: p.id,
          life: BEAN_LIFETIME,
        };
        if (p.mag === 0 && !p.reloading) {
          p.reloading   = true;
          p.reloadTimer = RELOAD_TIME;
        }
      }
      if (!p.shoot) p.shootConsumed = false;

      // Manual reload
      if (p.reload && !p.reloading && p.mag < MAG_SIZE) {
        p.reloading   = true;
        p.reloadTimer = RELOAD_TIME;
      }
    }

    // 2. Move projectiles & check vs enemies
    for (const [bId, b] of Object.entries(this.projectiles)) {
      b.x   += b.vx * dt;
      b.z   += b.vz * dt;
      b.life -= dt;

      // Out of arena or expired
      if (b.life <= 0 || Math.sqrt(b.x * b.x + b.z * b.z) > ARENA_RADIUS + 2) {
        delete this.projectiles[bId];
        continue;
      }

      // vs enemies
      let hit = false;
      for (const [eId, e] of Object.entries(this.enemies)) {
        const hitDist = BEAN_RADIUS + e.radius;
        if (dist2(b.x, b.z, e.x, e.z) < hitDist * hitDist) {
          e.hp -= BEAN_DAMAGE;
          hit = true;
          if (e.hp <= 0) {
            this._killEnemy(eId, e, b.ownerId);
          }
          break;
        }
      }
      if (hit) delete this.projectiles[bId];
    }

    // 3. Move enemies & check vs players
    for (const [eId, e] of Object.entries(this.enemies)) {
      // Find nearest alive player
      let nearest = null, nearestD2 = Infinity;
      for (const p of alivePlayers) {
        const d2 = dist2(e.x, e.z, p.x, p.z);
        if (d2 < nearestD2) { nearestD2 = d2; nearest = p; }
      }

      if (nearest) {
        const dx = nearest.x - e.x, dz = nearest.z - e.z;
        const d  = Math.sqrt(dx * dx + dz * dz);
        if (d > 0.001) {
          e.x += (dx / d) * e.speed * dt;
          e.z += (dz / d) * e.speed * dt;
        }

        // Collision with player
        const hitDist = e.radius + PLAYER_RADIUS;
        if (dist2(e.x, e.z, nearest.x, nearest.z) < hitDist * hitDist) {
          if (nearest.iFrameTimer <= 0) {
            nearest.hp        -= e.damage;
            nearest.iFrameTimer = PLAYER_IFRAME;
            this._broadcast({
              type: 'event', kind: 'hurt',
              data: { playerId: nearest.id, damage: e.damage, hp: nearest.hp, enemyKind: e.kind },
            });
            if (nearest.hp <= 0) {
              nearest.hp   = 0;
              nearest.dead = true;
              this._broadcast({ type: 'event', kind: 'death', data: { playerId: nearest.id } });
              this._checkGameOver();
            }
          }
        }
      }
    }

    // 4. Pickup collection
    for (const [pId, pu] of Object.entries(this.pickups)) {
      pu.life -= dt;
      if (pu.life <= 0) { delete this.pickups[pId]; continue; }

      for (const p of alivePlayers) {
        if (dist2(p.x, p.z, pu.x, pu.z) < PICKUP_RADIUS * PICKUP_RADIUS) {
          if (pu.kind === 'bean') {
            p.mag       = MAG_SIZE;
            p.reloading = false;
          } else if (pu.kind === 'heal') {
            p.hp = Math.min(p.hp + HEAL_AMOUNT, p.maxHp);
          }
          this._broadcast({ type: 'event', kind: 'pickup', data: { playerId: p.id, kind: pu.kind } });
          delete this.pickups[pId];
          break;
        }
      }
    }

    // 5. Enemy spawning
    if (alivePlayers.length > 0) {
      this.spawnAccum += dt;
      const interval = spawnInterval(this.wave);
      const cap      = enemyCap(this.wave, playerCount);
      while (this.spawnAccum >= interval && Object.keys(this.enemies).length < cap) {
        this.spawnAccum -= interval;
        this._spawnEnemy();
      }
      // Clamp accumulator to avoid burst spawns after lag
      if (this.spawnAccum > interval * 2) this.spawnAccum = interval * 2;
    }
  }

  _spawnEnemy() {
    const pool  = enemyPoolForWave(this.wave);
    const kind  = pool[Math.floor(Math.random() * pool.length)];
    const stats = ENEMY_TYPES[kind];
    const pos   = spawnOnEdge();
    const eId   = uid('e');
    this.enemies[eId] = {
      id:     eId,
      kind,
      x:      pos.x,
      z:      pos.z,
      hp:     stats.hp,
      maxHp:  stats.hp,
      speed:  stats.speed,
      radius: stats.radius,
      damage: stats.damage,
      score:  stats.score,
    };
  }

  _killEnemy(eId, e, killedBy) {
    this._broadcast({
      type: 'event', kind: 'kill',
      data: { enemyId: eId, killedBy, kind: e.kind, score: e.score, x: e.x, z: e.z },
    });

    this.score       += e.score;
    this.killsInWave += 1;

    // Award score to the shooting player too
    if (this.players[killedBy]) this.players[killedBy].score += e.score;

    delete this.enemies[eId];

    // Pickup drop
    if (Math.random() < PICKUP_DROP_CHANCE) {
      const kind = Math.random() < 0.5 ? 'bean' : 'heal';
      const pId  = uid('p');
      this.pickups[pId] = { id: pId, x: e.x, z: e.z, kind, life: PICKUP_LIFETIME };
    }

    // Wave advancement
    const target = killTarget(this.wave);
    if (this.killsInWave >= target) {
      this.wave++;
      this.killsInWave = 0;
      this._broadcast({
        type: 'event', kind: 'wave',
        data: { wave: this.wave, killTarget: killTarget(this.wave) },
      });
      // Level-up every 5 waves (cosmetic)
      if (this.wave % 5 === 1) {
        this._broadcast({
          type: 'event', kind: 'level',
          data: { level: Math.floor((this.wave - 1) / 5) + 1 },
        });
      }
    }
  }

  _checkGameOver() {
    const allDead = Object.values(this.players).every(p => p.dead);
    if (!allDead) return;

    const survived = (Date.now() - this.gameStartTime) / 1000;
    this._broadcast({
      type: 'event', kind: 'gameover',
      data: { score: this.score, wave: this.wave, survived },
    });

    this._stopGame();
    this.phase = 'gameover';
    // Reset ready flags so players can rematch
    this._restartForRematch();
  }

  // ── Broadcast ──────────────────────────────────────────────────────────────

  _broadcastState() {
    const msg = {
      type:        'state',
      tick:        this.tick,
      players:     Object.values(this.players).map(p => ({
        id:        p.id,
        x:         p.x,
        z:         p.z,
        hp:        p.hp,
        maxHp:     p.maxHp,
        aimX:      p.aimX,
        aimZ:      p.aimZ,
        score:     p.score,
        mag:       p.mag,
        reloading: p.reloading,
      })),
      enemies:     Object.values(this.enemies).map(e => ({
        id:   e.id,
        x:    e.x,
        z:    e.z,
        hp:   e.hp,
        kind: e.kind,
      })),
      projectiles: Object.values(this.projectiles).map(b => ({
        id:      b.id,
        x:       b.x,
        z:       b.z,
        vx:      b.vx,
        vz:      b.vz,
        ownerId: b.ownerId,
      })),
      pickups:     Object.values(this.pickups).map(pu => ({
        id:   pu.id,
        x:    pu.x,
        z:    pu.z,
        kind: pu.kind,
      })),
      wave:        this.wave,
      killsInWave: this.killsInWave,
      killTarget:  killTarget(this.wave),
      score:       this.score,
    };
    this._broadcast(msg);
  }

  _broadcast(obj) {
    const str = JSON.stringify(obj);
    for (const ws of Object.values(this.sockets)) {
      if (ws.readyState === 1) ws.send(str);
    }
  }

  // ── Idle Cleanup ───────────────────────────────────────────────────────────

  _resetIdleTimer() {
    this._clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      console.log(`[room ${this.code}] idle timeout — cleaning up`);
      this._stopGame();
      rooms.delete(this.code);
    }, ROOM_IDLE_MS);
  }

  _clearIdleTimer() {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
  }

  destroy() {
    this._stopGame();
    this._clearIdleTimer();
    for (const ws of Object.values(this.sockets)) {
      try { ws.close(); } catch (_) {}
    }
  }
}

// ─── Global Room Registry ─────────────────────────────────────────────────────

/** @type {Map<string, Room>} */
const rooms = new Map();

/** @type {WeakMap<WebSocket, {room:Room, playerId:number}>} */
const clientMeta = new WeakMap();

// ─── WebSocket Server ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: PORT });
console.log(`Butt Shooting Server listening on :${PORT}`);

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const meta = clientMeta.get(ws);

    // ── ping (echo back for latency measurement) ──────────────────────────────────
    if (msg.type === 'ping') {
      send(ws, { type: 'pong', seq: msg.seq });
      return;
    }

    // ── create ──────────────────────────────────────────────────────────────
    if (msg.type === 'create') {
      if (meta) { send(ws, { type: 'error', message: 'Already in a room' }); return; }

      // Generate a unique code
      let code;
      do { code = randCode(); } while (rooms.has(code));

      const room = new Room(code);
      rooms.set(code, room);
      room.addPlayer(1, ws);
      clientMeta.set(ws, { room, playerId: 1 });

      send(ws, { type: 'room', code, playerId: 1 });
      console.log(`[room ${code}] created by player 1`);
      return;
    }

    // ── join ────────────────────────────────────────────────────────────────
    if (msg.type === 'join') {
      if (meta) { send(ws, { type: 'error', message: 'Already in a room' }); return; }

      const code = (msg.code || '').toUpperCase();
      const room = rooms.get(code);
      if (!room) { send(ws, { type: 'error', message: 'Room not found' }); return; }
      if (room.connectedCount() >= 2) { send(ws, { type: 'error', message: 'Room full' }); return; }

      room.addPlayer(2, ws);
      clientMeta.set(ws, { room, playerId: 2 });

      send(ws, { type: 'room', code, playerId: 2 });
      console.log(`[room ${code}] player 2 joined`);
      return;
    }

    // All subsequent messages require room membership
    if (!meta) { send(ws, { type: 'error', message: 'Not in a room' }); return; }
    const { room, playerId } = meta;

    // ── ready ───────────────────────────────────────────────────────────────
    if (msg.type === 'ready') {
      if (room.phase === 'playing') return; // ignore mid-game
      room.markReady(playerId);
      return;
    }

    // ── input ───────────────────────────────────────────────────────────────
    if (msg.type === 'input') {
      if (room.phase !== 'playing') return;
      const p = room.players[playerId];
      if (!p || p.dead) return;

      if (msg.keys) {
        p.keys.w = !!msg.keys.w;
        p.keys.a = !!msg.keys.a;
        p.keys.s = !!msg.keys.s;
        p.keys.d = !!msg.keys.d;
      }
      if (typeof msg.aimX === 'number') p.aimX = msg.aimX;
      if (typeof msg.aimZ === 'number') p.aimZ = msg.aimZ;
      p.shoot  = !!msg.shoot;
      p.reload = !!msg.reload;
      return;
    }
  });

  // ── disconnect ─────────────────────────────────────────────────────────────
  ws.on('close', () => {
    const meta = clientMeta.get(ws);
    if (!meta) return;

    const { room, playerId } = meta;
    console.log(`[room ${room.code}] player ${playerId} disconnected`);

    room.removePlayer(playerId);
    clientMeta.delete(ws);

    if (room.connectedCount() === 0) {
      // Both gone — destroy room
      console.log(`[room ${room.code}] empty, destroying`);
      room.destroy();
      rooms.delete(room.code);
    } else {
      // Notify remaining player
      room._broadcast({ type: 'peer_disconnect' });

      // If game was running, remove the player entity so the game continues
      if (room.phase === 'playing' && room.players[playerId]) {
        room.players[playerId].dead = true;
        // Don't trigger gameover here — let the remaining player keep playing
        // (gameover only fires when ALL alive players die from enemies)
      }
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
});

wss.on('error', (err) => {
  console.error('Server error:', err);
});

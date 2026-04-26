// network.mjs — client-side networking for 2-player co-op multiplayer
// Handles WebSocket connection, room management, input sending, and state interpolation.
// Runs in the browser as an ES module (no bundler, no Node ws package).

// ─── Connection Management ────────────────────────────────────────────────────

/**
 * createNetwork(url) → network object
 *
 * url: WebSocket server URL, e.g. "ws://localhost:8080"
 *
 * Returns an object with:
 *   connect(), disconnect(), isConnected()
 *   onMessage(cb), send(msg)
 *   createRoom(), joinRoom(code), setReady()
 *   startInputLoop(getInputFn), stopInputLoop()
 *   ping() → Promise<ms>
 *   latency → last measured RTT in ms (or null)
 */
export function createNetwork(url) {
  let ws = null;
  let connected = false;
  const messageHandlers = [];

  // Pending promises keyed by message type (for one-shot responses)
  const pendingPromises = {};

  // Ping state
  let pingSeq = 0;
  const pendingPings = new Map(); // seq → {resolve, sentAt}
  let latency = null;

  // ── Internal helpers ──────────────────────────────────────────────────────

  // Disconnect callbacks
  const disconnectHandlers = [];

  function _onOpen() {
    connected = true;
    console.log('[network] connected to', url);
  }

  function _onClose(e) {
    connected = false;
    console.log('[network] disconnected', e.code, e.reason);
    // Reject any pending promises
    for (const [type, { reject }] of Object.entries(pendingPromises)) {
      reject(new Error('WebSocket closed'));
      delete pendingPromises[type];
    }
    for (const [seq, { reject }] of pendingPings) {
      reject(new Error('WebSocket closed'));
    }
    pendingPings.clear();
    // Notify disconnect handlers
    for (const cb of disconnectHandlers) {
      try { cb(e); } catch (err) { console.error('[network] disconnect handler error', err); }
    }
  }

  function _onError(e) {
    console.error('[network] WebSocket error', e);
  }

  function _onMessage(e) {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      console.warn('[network] non-JSON message:', e.data);
      return;
    }

    // Handle pong internally
    if (msg.type === 'pong' && msg.seq != null) {
      const pending = pendingPings.get(msg.seq);
      if (pending) {
        latency = performance.now() - pending.sentAt;
        pending.resolve(latency);
        pendingPings.delete(msg.seq);
      }
      return;
    }

    // Resolve one-shot pending promises (room, start)
    if (msg.type === 'room' && pendingPromises.room) {
      pendingPromises.room.resolve({ code: msg.code, playerId: msg.playerId });
      delete pendingPromises.room;
      // Still fall through so handlers can also receive it
    }

    // Notify all registered handlers
    for (const cb of messageHandlers) {
      try { cb(msg); } catch (err) { console.error('[network] handler error', err); }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function connect() {
    return new Promise((resolve, reject) => {
      if (ws) { resolve(); return; }
      ws = new WebSocket(url);
      ws.addEventListener('open', () => { _onOpen(); resolve(); });
      ws.addEventListener('close', _onClose);
      ws.addEventListener('error', (e) => { _onError(e); reject(new Error('WebSocket connection failed')); });
      ws.addEventListener('message', _onMessage);
    });
  }

  function disconnect() {
    if (ws) {
      ws.close();
      ws = null;
    }
  }

  function isConnected() {
    return connected && ws !== null && ws.readyState === WebSocket.OPEN;
  }

  /** Register a message handler. Called for every server message. */
  function onMessage(callback) {
    messageHandlers.push(callback);
  }

  /** Send a JSON message to the server. */
  function send(msg) {
    if (!isConnected()) {
      console.warn('[network] send() called while not connected, dropping:', msg);
      return;
    }
    ws.send(JSON.stringify(msg));
  }

  // ── Room Operations ───────────────────────────────────────────────────────

  /**
   * createRoom() → Promise<{code, playerId}>
   * Sends {type:"create"} and waits for {type:"room"} response.
   */
  function createRoom() {
    return new Promise((resolve, reject) => {
      pendingPromises.room = { resolve, reject };
      send({ type: 'create' });
    });
  }

  /**
   * joinRoom(code) → Promise<{code, playerId}>
   * Sends {type:"join", code} and waits for {type:"room"} response.
   */
  function joinRoom(code) {
    return new Promise((resolve, reject) => {
      pendingPromises.room = { resolve, reject };
      send({ type: 'join', code });
    });
  }

  /** setReady() — signals the player is ready to start. */
  function setReady() {
    send({ type: 'ready' });
  }

  // ── Input Loop (30 Hz) ────────────────────────────────────────────────────

  let inputIntervalId = null;

  /**
   * startInputLoop(getInputFn)
   * Calls getInputFn() at 30 Hz and sends the result to the server.
   * getInputFn must return: {keys:{w,a,s,d}, aimX, aimZ, shoot, dash, stomp, reload}
   */
  function startInputLoop(getInputFn) {
    if (inputIntervalId !== null) stopInputLoop();
    inputIntervalId = setInterval(() => {
      if (!isConnected()) return;
      const input = getInputFn();
      send({
        type: 'input',
        keys: input.keys,
        aimX: input.aimX,
        aimZ: input.aimZ,
        shoot: input.shoot,
        dash: input.dash,
        stomp: input.stomp,
        reload: input.reload,
      });
    }, 1000 / 30); // ~33ms interval
  }

  function stopInputLoop() {
    if (inputIntervalId !== null) {
      clearInterval(inputIntervalId);
      inputIntervalId = null;
    }
  }

  // ── Ping / Latency ────────────────────────────────────────────────────────

  /**
   * ping() → Promise<ms>
   * Sends a ping and resolves with round-trip time in milliseconds.
   */
  function ping() {
    return new Promise((resolve, reject) => {
      const seq = pingSeq++;
      pendingPings.set(seq, { resolve, reject, sentAt: performance.now() });
      send({ type: 'ping', seq });
    });
  }

  /** Register a disconnect handler. */
  function onDisconnect(callback) {
    disconnectHandlers.push(callback);
  }

  return {
    connect,
    disconnect,
    isConnected,
    onMessage,
    onDisconnect,
    send,
    createRoom,
    joinRoom,
    setReady,
    startInputLoop,
    stopInputLoop,
    ping,
    get latency() { return latency; },
  };
}

// ─── State Interpolation ──────────────────────────────────────────────────────

/**
 * createInterpolator()
 *
 * Buffers server state snapshots (20 Hz) and interpolates between them
 * for smooth 60fps rendering.
 *
 * Usage:
 *   const interp = createInterpolator();
 *   // On each server state message:
 *   interp.pushState(serverState);
 *   // In render loop (renderTime = Date.now() - 100 for 100ms delay):
 *   const state = interp.getInterpolated(renderTime);
 */
export function createInterpolator() {
  // Ring buffer of the last 3 snapshots: [{receivedAt, state}, ...]
  // Each state has a `tick` field from the server.
  const MAX_SNAPSHOTS = 3;
  const snapshots = [];

  // Track which entity IDs we've seen, for creation/destruction handling
  const knownEntityIds = new Set();

  /**
   * pushState(serverState)
   * serverState: {tick, players, enemies, projectiles, pickups, wave, level}
   */
  function pushState(serverState) {
    const snapshot = {
      receivedAt: performance.now(),
      state: serverState,
    };
    snapshots.push(snapshot);
    if (snapshots.length > MAX_SNAPSHOTS) {
      snapshots.shift(); // drop oldest
    }
  }

  /**
   * getInterpolated(renderTime)
   * renderTime: performance.now() - INTERP_DELAY_MS (typically 100ms)
   *
   * Finds the two snapshots that bracket renderTime and lerps between them.
   * Returns a state object with interpolated positions.
   */
  function getInterpolated(renderTime) {
    if (snapshots.length === 0) return null;
    if (snapshots.length === 1) return snapshots[0].state;

    // Find the pair of snapshots that bracket renderTime
    let prev = null;
    let next = null;

    for (let i = 0; i < snapshots.length - 1; i++) {
      if (snapshots[i].receivedAt <= renderTime && renderTime <= snapshots[i + 1].receivedAt) {
        prev = snapshots[i];
        next = snapshots[i + 1];
        break;
      }
    }

    // If renderTime is ahead of all snapshots, extrapolate from the last two
    if (!prev) {
      prev = snapshots[snapshots.length - 2];
      next = snapshots[snapshots.length - 1];
    }

    const duration = next.receivedAt - prev.receivedAt;
    // Clamp t to [0,1] to avoid wild extrapolation
    const t = duration > 0
      ? Math.max(0, Math.min(1, (renderTime - prev.receivedAt) / duration))
      : 1;

    return _lerpState(prev.state, next.state, t);
  }

  /** Linearly interpolate between two full game states. */
  function _lerpState(a, b, t) {
    return {
      tick: b.tick,
      wave: b.wave,
      level: b.level,
      players: _lerpEntities(a.players || [], b.players || [], t),
      enemies: _lerpEntities(a.enemies || [], b.enemies || [], t),
      projectiles: _lerpEntities(a.projectiles || [], b.projectiles || [], t),
      pickups: _lerpEntities(a.pickups || [], b.pickups || [], t),
    };
  }

  /**
   * Interpolate a list of entities by ID.
   * - New entities (not in prev): snap to position (t=1)
   * - Removed entities (not in next): omit entirely
   * - Present in both: lerp position/rotation
   */
  function _lerpEntities(prevList, nextList, t) {
    const prevMap = new Map(prevList.map(e => [e.id, e]));
    const result = [];

    for (const nextEnt of nextList) {
      const prevEnt = prevMap.get(nextEnt.id);
      if (!prevEnt) {
        // New entity: snap to its position
        result.push({ ...nextEnt });
      } else {
        // Interpolate
        result.push(_lerpEntity(prevEnt, nextEnt, t));
      }
    }

    // Entities in prev but not next are simply omitted (destroyed)
    return result;
  }

  /** Lerp a single entity's numeric fields. Non-numeric fields take next's value. */
  function _lerpEntity(a, b, t) {
    const out = { ...b }; // start with next state (non-interpolated fields)
    // Interpolate position
    if (a.x != null && b.x != null) out.x = _lerp(a.x, b.x, t);
    if (a.z != null && b.z != null) out.z = _lerp(a.z, b.z, t);
    if (a.y != null && b.y != null) out.y = _lerp(a.y, b.y, t);
    // Interpolate rotation (handle wrap-around)
    if (a.rot != null && b.rot != null) out.rot = _lerpAngle(a.rot, b.rot, t);
    // HP doesn't need interpolation — use latest value
    return out;
  }

  function _lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Lerp angle, taking the shortest path around the circle. */
  function _lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  return {
    pushState,
    getInterpolated,
    /** How many snapshots are buffered (0–3). */
    get bufferSize() { return snapshots.length; },
  };
}

// ─── Remote Player Rendering Helper ──────────────────────────────────────────

/**
 * createRemotePlayer(THREE, ctx)
 *
 * ctx: same context object used in game.mjs (has THREE, C, toon, withOutline, blobShadow, scene)
 *
 * Returns an object with:
 *   update(state)   — state: {x, z, rot, hp, maxHp}
 *   setName(name)   — set the floating nametag text
 *   destroy()       — remove from scene and clean up
 *   mesh            — the Three.js Group
 */
export function createRemotePlayer(THREE, ctx) {
  const { scene } = ctx;

  // Build a butt mesh with blue-tinted cheeks for the remote player
  const mesh = _buildRemoteButt(THREE, ctx);
  scene.add(mesh);

  // HP bar (simple sprite above the butt)
  const hpBar = _buildHpBar(THREE);
  mesh.add(hpBar.group);

  // Nametag (HTML overlay)
  const nametag = _buildNametag();

  let displayName = 'Player 2';
  let destroyed = false;

  function update(state) {
    if (destroyed) return;
    if (state.x != null) mesh.position.x = state.x;
    if (state.z != null) mesh.position.z = state.z;
    mesh.position.y = 0;
    if (state.rot != null) mesh.rotation.y = state.rot;

    // Update HP bar
    const hp = state.hp ?? 100;
    const maxHp = state.maxHp ?? 100;
    hpBar.update(hp, maxHp);

    // Update nametag screen position
    _updateNametagPosition(nametag, mesh, ctx);
  }

  function setName(name) {
    displayName = name;
    nametag.el.textContent = name;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    scene.remove(mesh);
    _disposeGroup(mesh);
    nametag.el.remove();
  }

  // Set initial name
  setName(displayName);

  return { update, setName, destroy, mesh };
}

// ── Remote butt mesh (blue-tinted) ───────────────────────────────────────────

function _buildRemoteButt(THREE, ctx) {
  const { toon, withOutline, blobShadow } = ctx;

  // Blue tint palette for the remote player
  const BLUE_CHEEK = 0x5FA8E8;
  const BLUE_CLEFT = 0x3A78C8;
  const INK = 0x2A1A0E;

  const g = new THREE.Group();

  // Two cheek spheres (blue tinted)
  for (const sx of [-0.38, 0.38]) {
    const cheek = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 18, 14),
      toon(BLUE_CHEEK)
    );
    cheek.scale.set(1, 0.95, 1.1);
    cheek.position.set(sx, 0.65, 0);
    withOutline(cheek, 0.06);
    g.add(cheek);
  }

  // Cleft
  const cleft = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.9, 0.6),
    toon(BLUE_CLEFT)
  );
  cleft.position.set(0, 0.65, 0);
  g.add(cleft);

  // Stubby legs
  for (const sx of [-0.25, 0.25]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.2, 0.28, 8),
      toon(BLUE_CHEEK)
    );
    leg.position.set(sx, 0.15, 0);
    withOutline(leg, 0.05);
    g.add(leg);
  }

  // Feet
  for (const sx of [-0.25, 0.25]) {
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.08, 0.35),
      toon(INK)
    );
    foot.position.set(sx, 0.04, 0.05);
    g.add(foot);
  }

  // Facing arrow
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.25, 3),
    toon(INK)
  );
  arrow.rotation.x = Math.PI / 2;
  arrow.position.set(0, 0.7, -0.7);
  g.add(arrow);

  g.add(blobShadow(0.7));
  return g;
}

// ── HP bar (Three.js plane above the butt) ───────────────────────────────────

function _buildHpBar(THREE) {
  const group = new THREE.Group();
  group.position.set(0, 1.6, 0);

  // Background (dark)
  const bgGeo = new THREE.PlaneGeometry(0.9, 0.12);
  const bgMat = new THREE.MeshBasicMaterial({ color: 0x333333, depthTest: false });
  const bg = new THREE.Mesh(bgGeo, bgMat);
  bg.renderOrder = 10;
  group.add(bg);

  // Foreground (green → red)
  const fgGeo = new THREE.PlaneGeometry(0.9, 0.12);
  const fgMat = new THREE.MeshBasicMaterial({ color: 0x44DD44, depthTest: false });
  const fg = new THREE.Mesh(fgGeo, fgMat);
  fg.renderOrder = 11;
  fg.position.z = 0.001;
  group.add(fg);

  function update(hp, maxHp) {
    const pct = Math.max(0, Math.min(1, hp / maxHp));
    fg.scale.x = pct;
    fg.position.x = -(1 - pct) * 0.45; // anchor left
    // Color: green → yellow → red
    if (pct > 0.5) {
      fgMat.color.setHex(0x44DD44);
    } else if (pct > 0.25) {
      fgMat.color.setHex(0xDDCC22);
    } else {
      fgMat.color.setHex(0xDD3333);
    }
  }

  return { group, update };
}

// ── HTML nametag overlay ──────────────────────────────────────────────────────

function _buildNametag() {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:absolute',
    'pointer-events:none',
    'font-family:sans-serif',
    'font-size:13px',
    'font-weight:bold',
    'color:#fff',
    'text-shadow:0 1px 3px #000, 0 0 6px #000',
    'white-space:nowrap',
    'transform:translate(-50%,-100%)',
    'padding:2px 6px',
    'border-radius:4px',
    'background:rgba(0,0,0,0.35)',
    'display:none',
  ].join(';');
  el.textContent = 'Player 2';
  document.body.appendChild(el);
  return { el };
}

/**
 * Project the mesh's world position into screen space and move the nametag.
 * ctx must have a `camera` (THREE.Camera) and the renderer canvas.
 */
function _updateNametagPosition(nametag, mesh, ctx) {
  if (!ctx.camera) return;
  const canvas = ctx.renderer ? ctx.renderer.domElement : document.getElementById('view');
  if (!canvas) return;

  // World position slightly above the butt
  const worldPos = new ctx.THREE.Vector3();
  mesh.getWorldPosition(worldPos);
  worldPos.y += 2.0; // above HP bar

  // Project to NDC
  worldPos.project(ctx.camera);

  // Convert NDC to CSS pixels
  const x = (worldPos.x * 0.5 + 0.5) * canvas.clientWidth;
  const y = (-worldPos.y * 0.5 + 0.5) * canvas.clientHeight;

  // Hide if behind camera
  if (worldPos.z > 1) {
    nametag.el.style.display = 'none';
    return;
  }

  nametag.el.style.display = 'block';
  nametag.el.style.left = x + 'px';
  nametag.el.style.top = y + 'px';
}

// ── Geometry disposal helper ──────────────────────────────────────────────────

function _disposeGroup(group) {
  group.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Recommended interpolation delay in ms (render this far behind server time). */
export const INTERP_DELAY_MS = 100;

/** Input send rate in Hz. */
export const INPUT_HZ = 30;

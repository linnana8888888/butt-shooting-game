/**
 * mp_hud.mjs — Multiplayer HUD overlay elements
 *
 * Usage:
 *   import { createMpHud } from './mp_hud.mjs';
 *   const mpHud = createMpHud(document.body);
 *
 *   // Each frame:
 *   mpHud.updatePartnerHp(0.65);
 *   mpHud.updatePartnerNametag(camera, partnerMesh, 'Player 2');
 *   mpHud.updatePing(42);
 *   mpHud.updateScore(1200);
 *   mpHud.showWaveBanner('Wave 3');
 *   mpHud.addKillFeedEntry('Player1', 'Buttling');
 *   mpHud.showPartnerDisconnected(true);
 *   mpHud.destroy();
 */

export function createMpHud(container) {
  // ── Root wrapper ────────────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.id = 'mp-hud';
  root.style.cssText = `
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 100;
    font-family: 'Fredoka', system-ui, sans-serif;
  `;
  container.appendChild(root);

  // ── CSS variables (match game palette) ─────────────────────────────────────
  const COLORS = {
    peach:  '#F5B08A',
    cream:  '#FFF4D6',
    ink:    '#2A1A0E',
    red:    '#E85C4A',
    gold:   '#FFD24D',
    pink:   '#FF5FA2',
    green:  '#9DD96A',
    sky:    '#5FD9FF',
  };

  // ── Shared styles helper ────────────────────────────────────────────────────
  function panelStyle(extra = '') {
    return `
      background: rgba(42,26,14,0.82);
      border: 3px solid ${COLORS.ink};
      border-radius: 12px;
      box-shadow: 0 3px 0 ${COLORS.ink};
      color: ${COLORS.cream};
      font-family: 'Fredoka', system-ui, sans-serif;
      font-weight: 700;
      ${extra}
    `;
  }

  // ── 1. Partner HP bar ───────────────────────────────────────────────────────
  const partnerHpWrap = document.createElement('div');
  partnerHpWrap.style.cssText = `
    position: absolute;
    top: 16px; right: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    ${panelStyle('padding: 6px 12px;')}
  `;
  partnerHpWrap.innerHTML = `
    <span style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;opacity:.85">Partner HP</span>
    <div style="
      width: 110px; height: 12px;
      background: rgba(0,0,0,0.4);
      border-radius: 6px;
      overflow: hidden;
      border: 2px solid ${COLORS.ink};
    ">
      <span id="mp-partnerHpFill" style="
        display: block; height: 100%; width: 100%;
        background: ${COLORS.green};
        transition: width 0.15s ease, background 0.3s;
        border-radius: 6px;
      "></span>
    </div>
    <span id="mp-partnerHpPct" style="font-size:13px;min-width:36px;text-align:right">100%</span>
  `;
  root.appendChild(partnerHpWrap);

  // ── 2. Partner nametag (HTML overlay, positioned per-frame) ────────────────
  const nametag = document.createElement('div');
  nametag.id = 'mp-nametag';
  nametag.style.cssText = `
    position: absolute;
    transform: translate(-50%, -100%);
    padding: 3px 10px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    color: ${COLORS.cream};
    background: rgba(42,26,14,0.75);
    border: 2px solid ${COLORS.sky};
    pointer-events: none;
    white-space: nowrap;
    display: none;
  `;
  nametag.textContent = 'Player 2';
  root.appendChild(nametag);

  // ── 3. Kill feed ────────────────────────────────────────────────────────────
  const killFeed = document.createElement('div');
  killFeed.id = 'mp-killfeed';
  killFeed.style.cssText = `
    position: absolute;
    top: 80px; right: 16px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    max-width: 260px;
  `;
  root.appendChild(killFeed);

  // ── 4. Wave banner ──────────────────────────────────────────────────────────
  const waveBanner = document.createElement('div');
  waveBanner.id = 'mp-waveBanner';
  waveBanner.style.cssText = `
    position: absolute;
    left: 50%; top: 38%;
    transform: translate(-50%, -50%);
    font-family: 'Fredoka One', Fredoka, sans-serif;
    font-size: 52px;
    color: ${COLORS.cream};
    text-shadow: -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.35s;
    text-align: center;
    white-space: nowrap;
  `;
  root.appendChild(waveBanner);

  // ── 5. Shared score display ─────────────────────────────────────────────────
  const sharedScore = document.createElement('div');
  sharedScore.id = 'mp-sharedScore';
  sharedScore.style.cssText = `
    position: absolute;
    top: 16px; left: 50%; transform: translateX(-50%);
    ${panelStyle('padding: 5px 18px; text-align: center;')}
    font-size: 15px;
  `;
  sharedScore.innerHTML = `
    <span style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;opacity:.8">Co-op Score</span>
    <div id="mp-scoreVal" style="font-size:26px;color:${COLORS.gold};line-height:1.1">0</div>
  `;
  root.appendChild(sharedScore);

  // ── 6. Partner disconnected warning ────────────────────────────────────────
  const disconnectWarn = document.createElement('div');
  disconnectWarn.id = 'mp-disconnectWarn';
  disconnectWarn.style.cssText = `
    position: absolute;
    left: 50%; top: 16px;
    transform: translateX(-50%);
    ${panelStyle(`
      padding: 8px 20px;
      text-align: center;
      border-color: ${COLORS.red};
      box-shadow: 0 0 0 2px ${COLORS.red}, 0 3px 0 ${COLORS.ink};
    `)}
    font-size: 14px;
    display: none;
    pointer-events: none;
    opacity: 0.9;
  `;
  disconnectWarn.innerHTML = `
    <span style="font-size:16px;margin-right:6px">💔</span>
    <span style="color:${COLORS.red};font-size:14px;font-family:'Fredoka One',Fredoka,sans-serif">
      Partner disconnected — solo mode
    </span>
  `;
  root.appendChild(disconnectWarn);

  // ── 7. Connection quality indicator ────────────────────────────────────────
  const connQuality = document.createElement('div');
  connQuality.id = 'mp-connQuality';
  connQuality.style.cssText = `
    position: absolute;
    bottom: 16px; right: 16px;
    ${panelStyle('padding: 4px 10px; font-size: 12px; display: flex; align-items: center; gap: 6px;')}
  `;
  connQuality.innerHTML = `
    <span id="mp-connDot">🟢</span>
    <span id="mp-connPing" style="min-width:52px">-- ms</span>
  `;
  root.appendChild(connQuality);

  // ── Responsive: push partner HP below partner HP on mobile ─────────────────
  const mq = window.matchMedia('(max-width: 820px), (pointer: coarse)');
  function applyMobileLayout(matches) {
    if (matches) {
      partnerHpWrap.style.top = '60px';
      partnerHpWrap.style.right = '8px';
      sharedScore.style.top = '8px';
      killFeed.style.top = '110px';
      killFeed.style.right = '8px';
    } else {
      partnerHpWrap.style.top = '16px';
      partnerHpWrap.style.right = '16px';
      sharedScore.style.top = '16px';
      killFeed.style.top = '80px';
      killFeed.style.right = '16px';
    }
  }
  applyMobileLayout(mq.matches);
  mq.addEventListener('change', e => applyMobileLayout(e.matches));

  // ── Update API ──────────────────────────────────────────────────────────────

  /**
   * Update partner HP bar.
   * @param {number} fraction  0.0 – 1.0
   */
  function updatePartnerHp(fraction) {
    const pct = Math.max(0, Math.min(1, fraction)) * 100;
    const fill = document.getElementById('mp-partnerHpFill');
    const label = document.getElementById('mp-partnerHpPct');
    if (fill) {
      fill.style.width = `${pct}%`;
      fill.style.background = pct > 50 ? COLORS.green : pct > 25 ? COLORS.gold : COLORS.red;
    }
    if (label) label.textContent = `${Math.round(pct)}%`;
  }

  /**
   * Position the partner nametag using 3D→2D projection.
   * Call each frame while partner is visible.
   * @param {THREE.Camera} camera
   * @param {THREE.Object3D} partnerObject  — the partner mesh/group
   * @param {string} name
   */
  function updatePartnerNametag(camera, partnerObject, name) {
    if (!camera || !partnerObject) { nametag.style.display = 'none'; return; }
    try {
      // Project world position to NDC
      const pos = partnerObject.position.clone();
      pos.project(camera);

      // Convert NDC to CSS pixels
      const hw = window.innerWidth  / 2;
      const hh = window.innerHeight / 2;
      const x = ( pos.x + 1) * hw;
      const y = (-pos.y + 1) * hh - 28; // 28px above the projected point

      // Hide if behind camera
      if (pos.z > 1) { nametag.style.display = 'none'; return; }

      nametag.style.display = '';
      nametag.style.left = `${x}px`;
      nametag.style.top  = `${y}px`;
      nametag.textContent = name || 'Partner';
    } catch (_) {
      nametag.style.display = 'none';
    }
  }

  /**
   * Add a kill-feed entry.
   * @param {string} killerName
   * @param {string} victimName
   */
  function addKillFeedEntry(killerName, victimName) {
    const entry = document.createElement('div');
    entry.style.cssText = `
      ${panelStyle('padding: 3px 10px; font-size: 13px; opacity: 1; transition: opacity 2s;')}
      white-space: nowrap;
    `;
    entry.innerHTML = `<b style="color:${COLORS.sky}">${_esc(killerName)}</b> 🍑💨 <b style="color:${COLORS.peach}">${_esc(victimName)}</b>`;
    killFeed.prepend(entry);

    // Fade out after 2.5 s, remove at 3 s
    setTimeout(() => { entry.style.opacity = '0'; }, 2500);
    setTimeout(() => { entry.remove(); }, 3000);

    // Cap feed at 5 entries
    while (killFeed.children.length > 5) killFeed.lastChild?.remove();
  }

  /**
   * Show a wave banner ("Wave 3 🍑") for ~2 seconds.
   * @param {string} text
   */
  function showWaveBanner(text) {
    waveBanner.textContent = text;
    waveBanner.style.opacity = '1';
    clearTimeout(waveBanner._hideTimer);
    waveBanner._hideTimer = setTimeout(() => { waveBanner.style.opacity = '0'; }, 2000);
  }

  /**
   * Update shared co-op score display.
   * @param {number} score
   */
  function updateScore(score) {
    const el = document.getElementById('mp-scoreVal');
    if (el) el.textContent = score.toLocaleString();
  }

  /**
   * Show/hide the "Partner disconnected!" overlay.
   * @param {boolean} visible
   */
  function showPartnerDisconnected(visible) {
    disconnectWarn.style.display = visible ? '' : 'none';
  }

  /**
   * Update connection quality indicator.
   * @param {number|null} ms  — null means disconnected
   */
  function updatePing(ms) {
    const dot  = document.getElementById('mp-connDot');
    const ping = document.getElementById('mp-connPing');
    if (ms === null || ms === undefined) {
      if (dot)  dot.textContent  = '🔴';
      if (ping) ping.textContent = 'offline';
    } else {
      if (dot)  dot.textContent  = ms < 100 ? '🟢' : ms < 250 ? '🟡' : '🔴';
      if (ping) ping.textContent = `${ms} ms`;
    }
  }

  /** Show the entire MP HUD. */
  function show() { root.style.display = ''; }

  /** Hide the entire MP HUD. */
  function hide() { root.style.display = 'none'; }

  /** Remove the MP HUD from the DOM entirely. */
  function destroy() { root.remove(); }

  // ── Utility ─────────────────────────────────────────────────────────────────
  function _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return {
    show,
    hide,
    destroy,
    updatePartnerHp,
    updatePartnerNametag,
    addKillFeedEntry,
    showWaveBanner,
    updateScore,
    showPartnerDisconnected,
    updatePing,
  };
}

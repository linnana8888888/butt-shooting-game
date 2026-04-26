/**
 * lobby.mjs — Lobby UI for 2-player co-op mode
 *
 * Usage:
 *   import { createLobby } from './lobby.mjs';
 *   const lobby = createLobby({
 *     onSinglePlayer() { ... },
 *     onMultiplayerStart(network, playerId, roomCode) { ... }
 *   });
 *   lobby.show();
 */

export function createLobby(callbacks) {
  const { onSinglePlayer, onMultiplayerStart } = callbacks;

  // ── State ──────────────────────────────────────────────────────────────────
  let network = null;
  let playerId = null;
  let roomCode = null;
  let myReady = false;
  let partnerReady = false;
  let pingMs = null;
  let connected = false;
  let pingInterval = null;
  let pollInterval = null;

  // ── DOM refs (populated in show()) ────────────────────────────────────────
  const el = {};

  // ── Helpers ────────────────────────────────────────────────────────────────
  function show() {
    const overlay = document.getElementById('lobby');
    if (overlay) overlay.classList.remove('hide');
    showScreen('modeSelect');
    _startConnectionMonitor();
  }

  function hide() {
    const overlay = document.getElementById('lobby');
    if (overlay) overlay.classList.add('hide');
    _stopConnectionMonitor();
  }

  function showScreen(name) {
    ['modeSelect', 'roomScreen', 'waitingScreen'].forEach(id => {
      const el = document.getElementById(`lobby-${id}`);
      if (el) el.style.display = id === name ? '' : 'none';
    });
  }

  // ── Connection monitor ─────────────────────────────────────────────────────
  function _startConnectionMonitor() {
    _updateConnStatus(false, null);
    // If a real network object is attached, it should call back via setNetwork()
  }

  function _stopConnectionMonitor() {
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    if (pollInterval)  { clearInterval(pollInterval);  pollInterval = null; }
  }

  function _updateConnStatus(isConnected, ms) {
    connected = isConnected;
    pingMs = ms;
    const dot  = document.getElementById('lobby-connDot');
    const text = document.getElementById('lobby-connText');
    if (!dot || !text) return;
    if (isConnected) {
      dot.textContent = '🟢';
      text.textContent = ms !== null ? `${ms} ms` : 'Connected';
    } else {
      dot.textContent = '🔴';
      text.textContent = 'Disconnected';
    }
  }

  // ── Mode Select ────────────────────────────────────────────────────────────
  function _bindModeSelect() {
    document.getElementById('lobby-soloBtn')?.addEventListener('click', () => {
      hide();
      onSinglePlayer();
    });
    document.getElementById('lobby-coopBtn')?.addEventListener('click', () => {
      showScreen('roomScreen');
    });
  }

  // ── Room Screen ────────────────────────────────────────────────────────────
  function _bindRoomScreen() {
    document.getElementById('lobby-createBtn')?.addEventListener('click', async () => {
      if (!network) {
        _showRoomError('No network connection. Start a server first.');
        return;
      }
      try {
        const result = await network.createRoom();
        roomCode = result.roomCode;
        playerId = result.playerId || 'P1';
        _enterWaiting();
      } catch (e) {
        _showRoomError('Could not create room: ' + e.message);
      }
    });

    document.getElementById('lobby-joinBtn')?.addEventListener('click', async () => {
      const input = document.getElementById('lobby-codeInput');
      const code = (input?.value || '').trim().toUpperCase();
      if (code.length !== 4) {
        _showRoomError('Enter a 4-letter Butt Link code.');
        return;
      }
      if (!network) {
        _showRoomError('No network connection. Start a server first.');
        return;
      }
      try {
        const result = await network.joinRoom(code);
        roomCode = result.roomCode;
        playerId = result.playerId || 'P2';
        _enterWaiting();
      } catch (e) {
        _showRoomError('Could not join room: ' + e.message);
      }
    });

    // Allow Enter key in code input
    document.getElementById('lobby-codeInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('lobby-joinBtn')?.click();
    });

    // Auto-uppercase input
    document.getElementById('lobby-codeInput')?.addEventListener('input', e => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    });

    document.getElementById('lobby-roomBackBtn')?.addEventListener('click', () => {
      showScreen('modeSelect');
    });
  }

  function _showRoomError(msg) {
    const err = document.getElementById('lobby-roomError');
    if (err) { err.textContent = msg; err.style.display = ''; }
  }

  // ── Waiting Screen ─────────────────────────────────────────────────────────
  function _enterWaiting() {
    myReady = false;
    partnerReady = false;
    _updateWaitingUI();
    showScreen('waitingScreen');

    // Poll for partner state if network supports it
    if (network && typeof network.onRoomUpdate === 'function') {
      network.onRoomUpdate(_handleRoomUpdate);
    }
    if (network && typeof network.pollRoom === 'function') {
      pollInterval = setInterval(async () => {
        try {
          const state = await network.pollRoom(roomCode);
          _handleRoomUpdate(state);
        } catch (_) {}
      }, 1500);
    }
  }

  function _handleRoomUpdate(state) {
    if (!state) return;
    // state: { players: [{id, ready}, ...], ping: number }
    if (typeof state.ping === 'number') _updateConnStatus(true, state.ping);
    const players = state.players || [];
    const me = players.find(p => p.id === playerId);
    const partner = players.find(p => p.id !== playerId);
    if (me)      myReady      = me.ready;
    if (partner) partnerReady = partner.ready;
    _updateWaitingUI();
    _checkBothReady();
  }

  function _updateWaitingUI() {
    const codeEl = document.getElementById('lobby-roomCode');
    if (codeEl) codeEl.textContent = roomCode || '????';

    const p1El = document.getElementById('lobby-player1status');
    const p2El = document.getElementById('lobby-player2status');

    if (playerId === 'P1' || playerId?.startsWith('P1')) {
      if (p1El) p1El.textContent = myReady ? '✓ Ready' : '…';
      if (p2El) p2El.textContent = partnerReady ? '✓ Ready' : 'Waiting...';
    } else {
      if (p1El) p1El.textContent = partnerReady ? '✓ Ready' : 'Waiting...';
      if (p2El) p2El.textContent = myReady ? '✓ Ready' : '…';
    }

    const readyBtn = document.getElementById('lobby-readyBtn');
    if (readyBtn) {
      readyBtn.textContent = myReady ? '✓ READY!' : 'READY UP';
      readyBtn.style.background = myReady ? 'var(--lobby-green, #9DD96A)' : 'var(--lobby-gold, #FFD24D)';
    }
  }

  function _checkBothReady() {
    if (myReady && partnerReady) {
      _stopConnectionMonitor();
      hide();
      onMultiplayerStart(network, playerId, roomCode);
    }
  }

  function _bindWaitingScreen() {
    document.getElementById('lobby-readyBtn')?.addEventListener('click', async () => {
      myReady = !myReady;
      _updateWaitingUI();
      if (network && typeof network.setReady === 'function') {
        try { await network.setReady(roomCode, playerId, myReady); } catch (_) {}
      }
      _checkBothReady();
    });

    document.getElementById('lobby-waitBackBtn')?.addEventListener('click', () => {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
      myReady = false;
      partnerReady = false;
      roomCode = null;
      playerId = null;
      showScreen('roomScreen');
    });
  }

  // ── Network injection ──────────────────────────────────────────────────────
  function setNetwork(net) {
    network = net;
    if (net && typeof net.onPing === 'function') {
      net.onPing(ms => _updateConnStatus(true, ms));
    }
    if (net && typeof net.onDisconnect === 'function') {
      net.onDisconnect(() => _updateConnStatus(false, null));
    }
    if (net && typeof net.onConnect === 'function') {
      net.onConnect(() => _updateConnStatus(true, null));
    }
    _updateConnStatus(net ? true : false, null);
  }

  // ── Init (bind all handlers once DOM is ready) ─────────────────────────────
  function init() {
    _bindModeSelect();
    _bindRoomScreen();
    _bindWaitingScreen();
  }

  // Bind after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Use a microtask so callers can finish setup before we bind
    Promise.resolve().then(init);
  }

  return { show, hide, setNetwork };
}

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

import { createNetwork } from './network.mjs';

// Server URL — use ?server=host:port query param, or same host on port 3000
function getServerUrl() {
  const params = new URLSearchParams(location.search);
  const server = params.get('server');
  if (server) return `ws://${server}`;
  // If opened via file:// or hostname is empty, we need the user to specify
  const host = location.hostname || 'localhost';
  return `ws://${host}:3000`;
}
const WS_URL = getServerUrl();

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
      // Pre-fill server input with default
      const serverInput = document.getElementById('lobby-serverInput');
      if (serverInput && !serverInput.value) {
        serverInput.value = (location.hostname || 'localhost') + ':3000';
      }
    });
  }

  // ── Ensure connected ──────────────────────────────────────────────────────
  async function _ensureConnected() {
    const serverInput = document.getElementById('lobby-serverInput');
    const addr = (serverInput?.value || '').trim() || (location.hostname || 'localhost') + ':3000';
    const url = `ws://${addr}`;

    if (network && network.isConnected()) return true;

    if (network) { try { network.disconnect(); } catch (_) {} }
    network = null;

    try {
      network = createNetwork(url);
      await network.connect();
      _updateConnStatus(true, null);
      network.onDisconnect(() => _updateConnStatus(false, null));
      return true;
    } catch (e) {
      _showRoomError(`Cannot connect to ${url}. Is the server running?`);
      network = null;
      return false;
    }
  }

  // ── Room Screen ────────────────────────────────────────────────────────────
  function _bindRoomScreen() {
    document.getElementById('lobby-createBtn')?.addEventListener('click', async () => {
      if (!(await _ensureConnected())) return;
      try {
        const result = await network.createRoom();
        roomCode = result.code;
        playerId = result.playerId || 1;
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
      if (!(await _ensureConnected())) return;
      try {
        const result = await network.joinRoom(code);
        roomCode = result.code;
        playerId = result.playerId || 2;
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

    // Show connection info for the host to share
    const hostIpEl = document.getElementById('lobby-hostIp');
    const hostCodeEl = document.getElementById('lobby-hostCode');
    if (hostCodeEl) hostCodeEl.textContent = roomCode || '????';
    if (hostIpEl) {
      const serverInput = document.getElementById('lobby-serverInput');
      const addr = (serverInput?.value || '').trim();
      // If host used localhost, try to show a helpful hint
      if (!addr || addr.startsWith('localhost') || addr.startsWith('127.')) {
        hostIpEl.textContent = '(your IP):3000';
        // Try WebRTC trick to get local IP
        try {
          const pc = new RTCPeerConnection({iceServers:[]});
          pc.createDataChannel('');
          pc.createOffer().then(o => pc.setLocalDescription(o));
          pc.onicecandidate = (e) => {
            if (!e.candidate) return;
            const m = e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
            if (m && m[1] !== '0.0.0.0' && !m[1].startsWith('127.')) {
              hostIpEl.textContent = m[1] + ':3000';
              pc.close();
            }
          };
        } catch (_) {}
      } else {
        hostIpEl.textContent = addr;
      }
    }

    // Listen for server messages (peer join, start)
    if (network) {
      network.onMessage((msg) => {
        if (msg.type === 'room' && msg.playerId !== playerId) {
          // Partner joined
          partnerReady = false;
          _updateWaitingUI();
        }
        if (msg.type === 'start') {
          // Server says both ready, game starting
          _stopConnectionMonitor();
          hide();
          onMultiplayerStart(network, playerId, roomCode);
        }
      });
    }
  }

  function _updateWaitingUI() {
    const codeEl = document.getElementById('lobby-roomCode');
    if (codeEl) codeEl.textContent = roomCode || '????';

    const p1El = document.getElementById('lobby-player1status');
    const p2El = document.getElementById('lobby-player2status');

    if (playerId === 1) {
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
    // Server handles the actual start — we just update UI locally
    _updateWaitingUI();
  }

  function _bindWaitingScreen() {
    document.getElementById('lobby-readyBtn')?.addEventListener('click', async () => {
      myReady = !myReady;
      _updateWaitingUI();
      if (network && typeof network.setReady === 'function') {
        try { network.setReady(); } catch (_) {}
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

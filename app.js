/**
 * ESP Web Flasher — app.js (Local Storage Version)
 * Core logic: Firmware fetching from local /firmware/ folder, esptool-js flash engine
 */

import { ESPLoader, Transport } from "https://unpkg.com/esptool-js@0.4.6/bundle.js";

// ════════════════════════════════════════════════════
//  GLOBALS
// ════════════════════════════════════════════════════
const STATE = {
  selectedProject: null,
  port:            null,
  transport:       null,
  espLoader:       null,
  isFlashing:      false,
  abortFlash:      false,
  config:          null,
};

// ════════════════════════════════════════════════════
//  THEME
// ════════════════════════════════════════════════════
window.setTheme = function(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('esp-flasher-theme', theme);
  document.getElementById('btn-dark').classList.toggle('active',  theme === 'dark');
  document.getElementById('btn-light').classList.toggle('active', theme === 'light');
};

// Restore saved theme on load
(function() {
  const saved = localStorage.getItem('esp-flasher-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
})();

// ════════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  const savedTheme = localStorage.getItem('esp-flasher-theme') || 'light';
  setTheme(savedTheme);

  checkWebSerial();
  await loadConfig();
});

// ════════════════════════════════════════════════════
//  WEB SERIAL CHECK
// ════════════════════════════════════════════════════
function checkWebSerial() {
  if (!('serial' in navigator)) {
    document.getElementById('webserial-warning').style.display = 'flex';
    disableFlashUI(true);
    log('warn', 'Web Serial API not available. Use Chrome or Edge 89+.');
  }
}

// ════════════════════════════════════════════════════
//  CONFIG LOADING
// ════════════════════════════════════════════════════
async function loadConfig() {
  try {
    const res = await fetch(`./config.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    STATE.config = await res.json();
    log('info', `Loaded ${STATE.config.projects.length} project(s) from config.`);
    renderProjects();
    
    // Auto-select if only one project exists
    if (STATE.config.projects.length === 1) {
      selectProject(STATE.config.projects[0].id);
    }
  } catch (e) {
    log('error', `Failed to load config.json: ${e.message}`);
    showToast('Failed to load project config', 'error');
  }
}

// ════════════════════════════════════════════════════
//  PROJECT RENDERING
// ════════════════════════════════════════════════════
function renderProjects() {
  const select = document.getElementById('project-select');
  if (!STATE.config || !STATE.config.projects.length) {
    select.innerHTML = '<option value="" disabled>No projects found.</option>';
    return;
  }

  const options = STATE.config.projects.map(p => 
    `<option value="${p.id}">${p.name} (v${p.version || '—'}) [${p.chip}]</option>`
  ).join('');

  select.innerHTML = '<option value="" disabled>— Choose a Project —</option>' + options;
}

function selectProject(id) {
  if (!id) return;
  STATE.selectedProject = STATE.config.projects.find(p => p.id === id);
  if (!STATE.selectedProject) return;

  const select = document.getElementById('project-select');
  if (select.value !== id) select.value = id;

  const cfg = STATE.selectedProject;
  
  // Enable config controls and update labels
  const configControls = document.getElementById('config-controls');
  if (configControls) configControls.classList.remove('config-disabled');
  
  document.getElementById('project-desc-text').textContent = cfg.description || cfg.name;

  const badge = document.getElementById('chip-badge');
  badge.textContent = cfg.chip;
  badge.className = `project-chip chip-active`; 

  const bauds = document.getElementById('baud-select');
  if (bauds) {
    bauds.innerHTML = cfg.baud_options.map(b =>
      `<option value="${b}" ${b === cfg.baud_default ? 'selected' : ''}>${b.toLocaleString()} baud</option>`
    ).join('');
  }

  updateFileBadges();
  updateFlashButtons();

  log('accent', `Project selected: ${cfg.name} (${cfg.chip})`);
}

function updateFileBadges() {
  const p = STATE.selectedProject;
  if (!p) return;
  document.getElementById('progress-files').innerHTML = p.flash.map(f =>
    `<span class="file-badge pending" id="badge-${f.file_id}">📄 ${f.label || f.file_id}</span>`
  ).join('');
}

// ════════════════════════════════════════════════════
//  SERIAL CONNECTION
// ════════════════════════════════════════════════════
window.handleConnect = async function() {
  if (!('serial' in navigator)) {
    showToast('Web Serial not supported in this browser', 'error');
    return;
  }

  try {
    log('info', 'Requesting serial port…');
    STATE.port = await navigator.serial.requestPort();
    
    // We don't open it here to avoid conflicts later.
    // handleFlash or handleErase will open it at the correct baud rate.
    setConnectionState('connected');
    log('success', 'Serial port selected and ready.');
    showToast('Device connected', 'success');

    STATE.port.addEventListener('disconnect', () => {
      setConnectionState('disconnected');
      log('warn', 'Device disconnected.');
    });

  } catch (e) {
    if (e.name !== 'NotFoundError') {
      log('error', `Connection error: ${e.message}`);
      showToast('Connection failed: ' + e.message, 'error');
    } else {
      log('dim', 'Port selection cancelled.');
    }
  }
};

window.handleReset = async function() {
  if (!STATE.port) return;
  try {
    log('info', 'Hard resetting device…');
    
    // If not already flashing, we need to create a temporary loader
    if (!STATE.transport) {
      if (STATE.port.readable) await STATE.port.close();
      const transport = new Transport(STATE.port, true);
      const loader = new ESPLoader({ transport, baudrate: 115200, terminal: makeTerminal() });
      await loader.main();
      await loader.hardReset();
      await transport.disconnect();
    } else {
      // If we have an active loader (during flash), it might be busy,
      // but hardReset is usually safe. 
      // Actually, it's better to only allow Reset when NOT flashing.
      showToast('Cannot reset while flashing', 'warning');
    }
  } catch (e) {
    log('error', `Reset failed: ${e.message}`);
  }
};

window.handleCancel = function() {
  if (STATE.isFlashing) {
    STATE.abortFlash = true;
    log('warn', '🛑 Cancellation requested…');
  }
};

window.handleDisconnect = async function() {
  try {
    if (STATE.transport) { STATE.transport.disconnect(); STATE.transport = null; }
    if (STATE.port && STATE.port.readable) await STATE.port.close();
    STATE.port = null;
    setConnectionState('disconnected');
    log('info', 'Disconnected.');
  } catch (e) {
    log('error', `Disconnect error: ${e.message}`);
  }
};

function setConnectionState(status) {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const btnC = document.getElementById('btn-connect');
  const connActions = document.getElementById('connection-actions');

  dot.className = `status-dot ${status}`;

  if (status === 'connected') {
    text.innerHTML = '<strong>Device connected</strong> — ready to flash';
    btnC.style.display = 'none';
    if (connActions) connActions.style.display = 'flex';
  } else if (status === 'flashing') {
    text.innerHTML = '<strong>Flashing…</strong> — do not disconnect';
  } else {
    text.innerHTML = 'No device connected';
    btnC.style.display = 'block';
    if (connActions) connActions.style.display = 'none';
  }

  updateFlashButtons();
}

function updateFlashButtons() {
  const connected = !!STATE.port;
  const hasProject = !!STATE.selectedProject;
  const flashing = STATE.isFlashing;

  document.getElementById('btn-flash').disabled = !(connected && hasProject) || flashing;
  document.getElementById('btn-erase').disabled = !connected || flashing;
  
  const cancelBtn = document.getElementById('btn-cancel');
  if (cancelBtn) {
    cancelBtn.style.display = flashing ? 'inline-block' : 'none';
  }

  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) {
    resetBtn.disabled = flashing;
  }
}

// ════════════════════════════════════════════════════
//  LOCAL FIRMWARE FETCH
// ════════════════════════════════════════════════════
async function fetchFirmwareBinary(projectId, fileId) {
  // Local path: ./firmware/{projectId}/{fileId}
  const url = `./firmware/${projectId}/${fileId}`;

  log('info', `  Fetching binary → ${url}…`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Binary fetch HTTP ${response.status} (Check if file exists at ${url})`);
  }

  const buffer = await response.arrayBuffer();
  log('success', `  ✓ Loaded ${(buffer.byteLength / 1024).toFixed(1)} KB`);

  return buffer;
}

// ════════════════════════════════════════════════════
//  ERASE
// ════════════════════════════════════════════════════
window.handleErase = async function() {
  if (!STATE.port) { showToast('Connect a device first', 'warning'); return; }
  if (!confirm('⚠️ This will completely erase the flash memory. Continue?')) return;

  STATE.isFlashing = true; STATE.abortFlash = false;
  updateFlashButtons();
  setConnectionState('flashing');
  setProgress(0, 'Erasing flash…');
  document.getElementById('progress-section').style.display = 'block';

  try {
    const baud = parseInt(document.getElementById('baud-select')?.value || 115200);

    // Ensure port is closed before ESPLoader takes over
    if (STATE.port.readable) {
      log('dim', '  Closing manual connection…');
      await STATE.port.close();
    }
    const transport = new Transport(STATE.port, true);
    const loader    = new ESPLoader({ transport, baudrate: baud, terminal: makeTerminal() });

    await loader.main();
    await loader.eraseFlash();

    log('success', '✓ Flash erased successfully.');
    showToast('Flash erased', 'success');
    setProgress(100, 'Erase complete');

  } catch (e) {
    log('error', `Erase failed: ${e.message}`);
    showToast('Erase failed: ' + e.message, 'error');
  } finally {
    STATE.isFlashing = false;
    setConnectionState('connected');
    updateFlashButtons();
    setTimeout(() => { document.getElementById('progress-section').style.display = 'none'; }, 3000);
  }
};

// ════════════════════════════════════════════════════
//  FLASH
// ════════════════════════════════════════════════════
window.handleFlash = async function() {
  if (!STATE.selectedProject) { showToast('Select a project first', 'warning'); return; }
  if (!STATE.port)            { showToast('Connect a device first',  'warning'); return; }
  if (STATE.isFlashing)       return;

  STATE.isFlashing = true; STATE.abortFlash = false;
  updateFlashButtons();
  setConnectionState('flashing');

  const project = STATE.selectedProject;
  const baud    = parseInt(document.getElementById('baud-select').value);

  document.getElementById('progress-section').style.display = 'block';
  updateFileBadges();
  setProgress(0, 'Starting…');

  log('accent', `══ Flashing ${project.name} @ ${baud.toLocaleString()} baud ══`);

  try {
    const flashFiles = [];
    const totalFiles = project.flash.length;

    for (let i = 0; i < totalFiles; i++) {
      if (STATE.abortFlash) throw new Error('Flash aborted by user.');
      const f = project.flash[i];
      setBadgeState(f.file_id, 'active');
      setProgress(Math.round((i / totalFiles) * 30), `Fetching ${f.label || f.file_id}…`);

      try {
        const binary = await fetchFirmwareBinary(project.id, f.file_id);
        flashFiles.push({ data: arrayBufferToBinaryString(binary), address: parseInt(f.address, 16) });
        setBadgeState(f.file_id, 'done');
      } catch (e) {
        setBadgeState(f.file_id, 'error');
        throw new Error(`Failed to fetch ${f.file_id}: ${e.message}`);
      }
    }

    log('success', `✓ All binaries loaded.`);
    setProgress(35, 'Connecting to chip…');

    // Ensure port is closed before ESPLoader takes over
    if (STATE.port.readable) {
      log('dim', '  Closing manual connection…');
      await STATE.port.close();
    }

    const transport = new Transport(STATE.port, true);
    STATE.transport = transport;

    const loader = new ESPLoader({
      transport,
      baudrate: baud,
      terminal: makeTerminal(),
      enableTracing: false,
    });

    setProgress(40, 'Detecting chip…');
    const chip = await loader.main();
    log('success', `✓ Chip detected: ${chip}`);
    setProgress(50, 'Writing firmware…');

    await loader.writeFlash({
      fileArray:    flashFiles,
      flashSize:    project.flash_size || 'keep',
      flashMode:    'keep',
      flashFreq:    'keep',
      eraseAll:     false,
      compress:     true,
      reportProgress(fileIndex, written, total) {
        if (STATE.abortFlash) throw new Error('Flash aborted by user.');
        
        const filePct    = (written / total);
        const overallPct = Math.round(50 + ((fileIndex + filePct) / totalFiles) * 50);
        
        const fileLabel  = project.flash[fileIndex]?.label || `File ${fileIndex + 1}`;
        setProgress(Math.min(overallPct, 100), `Writing ${fileLabel}…`);
      },
      calculateMD5Hash(image) {
        return CryptoJS.MD5(CryptoJS.lib.WordArray.create(image)).toString();
      },
    });

    setProgress(100, '✓ Flash complete!');
    await loader.hardReset();

    log('success', '══ ✓ Flash complete! Device rebooting… ══');
    showToast('Firmware flashed successfully!', 'success');
    STATE.transport = null;

  } catch (e) {
    log('error', `Flash failed: ${e.message}`);
    showToast('Flash failed: ' + e.message, 'error');
    console.error(e);
  } finally {
    STATE.isFlashing = false;
    setConnectionState('connected');
    updateFlashButtons();
  }
};

// ════════════════════════════════════════════════════
//  PROGRESS HELPERS
// ════════════════════════════════════════════════════
function setProgress(pct, label) {
  const bar = document.getElementById('progress-bar');
  if (bar) bar.style.width   = `${pct}%`;
  const pctEl = document.getElementById('progress-pct');
  if (pctEl) pctEl.textContent   = `${pct}%`;
  const lbl = document.getElementById('progress-label');
  if (lbl) lbl.textContent = label;
}

function setBadgeState(fileId, state) {
  const el = document.getElementById(`badge-${fileId}`);
  if (el) el.className = `file-badge ${state}`;
}

// ════════════════════════════════════════════════════
//  TERMINAL ADAPTER (esptool-js)
// ════════════════════════════════════════════════════
function makeTerminal() {
  return {
    clean()         { /* no-op */ },
    writeLine(data) { log('dim', data); },
    write(data) {
      if (typeof data === 'string') {
        log('dim', data);
      } else if (data instanceof Uint8Array) {
        const str = new TextDecoder().decode(data);
        if (str.trim()) log('dim', str);
      }
    },
  };
}

// ════════════════════════════════════════════════════
//  UTILITY
// ════════════════════════════════════════════════════
function arrayBufferToBinaryString(buffer) {
  const bytes  = new Uint8Array(buffer);
  const chunks = [];
  const CHUNK  = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return chunks.join('');
}

function disableFlashUI(disabled) {
  ['btn-connect', 'btn-flash', 'btn-erase'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  });
}

// ════════════════════════════════════════════════════
//  LOG CONSOLE
// ════════════════════════════════════════════════════
function log(type, message) {
  const console = document.getElementById('log-console');
  const time    = new Date().toLocaleTimeString('en-US', { hour12: false });

  const line = document.createElement('div');
  line.className = 'log-line';
  
  let sanitized = message.replace(/[^\x20-\x7E\s\u00A0-\u00FF]/g, '');

  if (sanitized.length > 1500) {
    sanitized = sanitized.substring(0, 1500) + '... [TRUNCATED]';
  }

  if (!sanitized.trim() && message.length > 0) return;

  line.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-text ${type}">${escapeHtml(sanitized)}</span>
  `;
  console.appendChild(line);
  console.scrollTop = console.scrollHeight;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

window.clearLog = function() {
  document.getElementById('log-console').innerHTML = '';
};

window.copyLog = function() {
  const text = [...document.querySelectorAll('.log-text')]
    .map(el => el.textContent).join('\n');
  navigator.clipboard.writeText(text).then(() => showToast('Log copied', 'success'));
};

window.showToast = showToast;
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast     = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span></span> ${escapeHtml(message)}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

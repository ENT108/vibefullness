#!/usr/bin/env node
// vibefullness — shared configuration resolver + symlink-safe flag I/O.
//
// Deliberately standalone (does not require caveman-config) so vibefullness works
// whether or not caveman is installed. The safe flag I/O is duplicated on
// purpose: it is a security primitive that must not depend on a sibling tool.
//
// Default mode resolution order:
//   1. VIBEFULLNESS_DEFAULT_MODE environment variable
//   2. config.json `defaultMode` field:
//      - $XDG_CONFIG_HOME/vibefullness/config.json (if XDG set)
//      - ~/.config/vibefullness/config.json (macOS / Linux)
//      - %APPDATA%\vibefullness\config.json (Windows)
//   3. 'full'

const fs = require('fs');
const path = require('path');
const os = require('os');

const VALID_MODES = ['off', 'lite', 'full', 'ultra'];

function getConfigDir() {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'vibefullness');
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'vibefullness'
    );
  }
  return path.join(os.homedir(), '.config', 'vibefullness');
}

function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

function getDefaultMode() {
  const envMode = process.env.VIBEFULLNESS_DEFAULT_MODE;
  if (envMode && VALID_MODES.includes(envMode.toLowerCase())) {
    return envMode.toLowerCase();
  }
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
    if (config.defaultMode && VALID_MODES.includes(config.defaultMode.toLowerCase())) {
      return config.defaultMode.toLowerCase();
    }
  } catch (e) {
    // missing/invalid config — fall through
  }
  return 'full';
}

// Symlink-safe, atomic flag write with 0600 perms. Refuses symlinks at the
// target and at the immediate parent dir, uses O_NOFOLLOW where available.
// Protects the predictable flag path (~/.claude/.vibefullness-active) from a local
// attacker swapping it for a symlink to clobber other files. Silent best-effort.
function safeWriteFlag(flagPath, content) {
  try {
    const flagDir = path.dirname(flagPath);
    fs.mkdirSync(flagDir, { recursive: true });

    try {
      if (fs.lstatSync(flagDir).isSymbolicLink()) return;
    } catch (e) {
      return;
    }
    try {
      if (fs.lstatSync(flagPath).isSymbolicLink()) return;
    } catch (e) {
      if (e.code !== 'ENOENT') return;
    }

    const tempPath = path.join(flagDir, `.vibefullness-active.${process.pid}.${Date.now()}`);
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
    let fd;
    try {
      fd = fs.openSync(tempPath, flags, 0o600);
      fs.writeSync(fd, String(content));
      try { fs.fchmodSync(fd, 0o600); } catch (e) { /* best-effort on Windows */ }
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    fs.renameSync(tempPath, flagPath);
  } catch (e) {
    // silent — flag is best-effort
  }
}

// Symlink-safe, size-capped, whitelist-validated read. Returns null on any
// anomaly so a swapped symlink (e.g. -> ~/.ssh/id_rsa) is never slurped into
// terminal output or model context. Longest valid value is "ultra" (5 bytes);
// 64 leaves slack without enabling exfiltration.
const MAX_FLAG_BYTES = 64;

function readFlag(flagPath) {
  try {
    let st;
    try {
      st = fs.lstatSync(flagPath);
    } catch (e) {
      return null;
    }
    if (st.isSymbolicLink() || !st.isFile()) return null;
    if (st.size > MAX_FLAG_BYTES) return null;

    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_RDONLY | O_NOFOLLOW;
    let fd;
    let out;
    try {
      fd = fs.openSync(flagPath, flags);
      const buf = Buffer.alloc(MAX_FLAG_BYTES);
      const n = fs.readSync(fd, buf, 0, MAX_FLAG_BYTES, 0);
      out = buf.slice(0, n).toString('utf8');
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }

    const raw = out.trim().toLowerCase();
    if (!VALID_MODES.includes(raw)) return null;
    return raw;
  } catch (e) {
    return null;
  }
}

module.exports = { getDefaultMode, getConfigDir, getConfigPath, VALID_MODES, safeWriteFlag, readFlag };

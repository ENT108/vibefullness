// Tests for vibefullness-config: getDefaultMode, getConfigDir, getConfigPath,
// VALID_MODES, safeWriteFlag, readFlag.
// Built-in node:test, zero deps. Run: node --test hooks/vibefullness-config.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  getDefaultMode,
  getConfigDir,
  getConfigPath,
  VALID_MODES,
  normalizeMode,
  safeWriteFlag,
  readFlag,
} = require('./vibefullness-config');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-'));
}

function rmTmpDir(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {}
}

// Save / restore env keys so tests don't bleed
function withEnv(overrides, fn) {
  const saved = {};
  const keys = Object.keys(overrides);
  for (const k of keys) {
    saved[k] = process.env[k];
    if (overrides[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = overrides[k];
    }
  }
  try {
    return fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    }
  }
}

// ---------------------------------------------------------------------------
// VALID_MODES
// ---------------------------------------------------------------------------

test('VALID_MODES contains exactly on and off', () => {
  assert.deepStrictEqual([...VALID_MODES].sort(), ['off', 'on'].sort());
});

// ---------------------------------------------------------------------------
// normalizeMode — on|off + legacy aliases
// ---------------------------------------------------------------------------

test('normalizeMode passes through on/off (case-insensitive, trimmed)', () => {
  assert.strictEqual(normalizeMode('on'), 'on');
  assert.strictEqual(normalizeMode('  OFF \n'), 'off');
  assert.strictEqual(normalizeMode('On'), 'on');
});

test('normalizeMode returns null for dropped legacy names (lite/full/ultra)', () => {
  assert.strictEqual(normalizeMode('lite'), null);
  assert.strictEqual(normalizeMode('full'), null);
  assert.strictEqual(normalizeMode('ULTRA'), null);
});

test('normalizeMode returns null for unknown / non-string', () => {
  assert.strictEqual(normalizeMode('turbo'), null);
  assert.strictEqual(normalizeMode(''), null);
  assert.strictEqual(normalizeMode(undefined), null);
  assert.strictEqual(normalizeMode(42), null);
});

// ---------------------------------------------------------------------------
// getConfigDir / getConfigPath
// ---------------------------------------------------------------------------

test('getConfigDir uses XDG_CONFIG_HOME when set', () => {
  const tmp = makeTmpDir();
  try {
    withEnv({ XDG_CONFIG_HOME: tmp }, () => {
      const dir = getConfigDir();
      assert.strictEqual(dir, path.join(tmp, 'vibefullness'));
    });
  } finally {
    rmTmpDir(tmp);
  }
});

test('getConfigPath ends with config.json under XDG dir', () => {
  const tmp = makeTmpDir();
  try {
    withEnv({ XDG_CONFIG_HOME: tmp }, () => {
      const p = getConfigPath();
      assert.ok(p.endsWith('config.json'), `expected to end with config.json, got: ${p}`);
      assert.ok(p.startsWith(tmp), `expected to start with ${tmp}, got: ${p}`);
    });
  } finally {
    rmTmpDir(tmp);
  }
});

// NOTE: win32 APPDATA branch is not covered — test is running on
// process.platform !== 'win32' and mocking platform is unsafe in CJS.

// ---------------------------------------------------------------------------
// getDefaultMode — env var branch
// ---------------------------------------------------------------------------

test('VIBEFULLNESS_DEFAULT_MODE env overrides everything (off)', () => {
  const tmp = makeTmpDir();
  try {
    withEnv({ VIBEFULLNESS_DEFAULT_MODE: 'off', XDG_CONFIG_HOME: tmp }, () => {
      // No config.json written — env alone is enough
      assert.strictEqual(getDefaultMode(), 'off');
    });
  } finally {
    rmTmpDir(tmp);
  }
});

test('VIBEFULLNESS_DEFAULT_MODE is case-insensitive (ON -> on)', () => {
  const tmp = makeTmpDir();
  try {
    withEnv({ VIBEFULLNESS_DEFAULT_MODE: 'ON', XDG_CONFIG_HOME: tmp }, () => {
      assert.strictEqual(getDefaultMode(), 'on');
    });
  } finally {
    rmTmpDir(tmp);
  }
});

test('dropped legacy VIBEFULLNESS_DEFAULT_MODE (uLtRa) is ignored; falls through to config', () => {
  const tmp = makeTmpDir();
  try {
    const cfgDir = path.join(tmp, 'vibefullness');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify({ defaultMode: 'off' }));

    withEnv({ VIBEFULLNESS_DEFAULT_MODE: 'uLtRa', XDG_CONFIG_HOME: tmp }, () => {
      assert.strictEqual(getDefaultMode(), 'off');
    });
  } finally {
    rmTmpDir(tmp);
  }
});

test('invalid VIBEFULLNESS_DEFAULT_MODE is ignored; falls through to config', () => {
  const tmp = makeTmpDir();
  try {
    // Write a valid config so we can confirm fall-through, not just default
    const cfgDir = path.join(tmp, 'vibefullness');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify({ defaultMode: 'off' }));

    withEnv({ VIBEFULLNESS_DEFAULT_MODE: 'bogus', XDG_CONFIG_HOME: tmp }, () => {
      assert.strictEqual(getDefaultMode(), 'off');
    });
  } finally {
    rmTmpDir(tmp);
  }
});

test('empty string VIBEFULLNESS_DEFAULT_MODE is ignored (default on)', () => {
  const tmp = makeTmpDir();
  try {
    withEnv({ VIBEFULLNESS_DEFAULT_MODE: '', XDG_CONFIG_HOME: tmp }, () => {
      assert.strictEqual(getDefaultMode(), 'on');
    });
  } finally {
    rmTmpDir(tmp);
  }
});

// ---------------------------------------------------------------------------
// getDefaultMode — config.json branch
// ---------------------------------------------------------------------------

test('config.json defaultMode is used when env is unset (off)', () => {
  const tmp = makeTmpDir();
  try {
    const cfgDir = path.join(tmp, 'vibefullness');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify({ defaultMode: 'off' }));

    withEnv({ VIBEFULLNESS_DEFAULT_MODE: undefined, XDG_CONFIG_HOME: tmp }, () => {
      assert.strictEqual(getDefaultMode(), 'off');
    });
  } finally {
    rmTmpDir(tmp);
  }
});

test('dropped legacy config.json defaultMode (ULTRA) is ignored; falls back to on', () => {
  const tmp = makeTmpDir();
  try {
    const cfgDir = path.join(tmp, 'vibefullness');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify({ defaultMode: 'ULTRA' }));

    withEnv({ VIBEFULLNESS_DEFAULT_MODE: undefined, XDG_CONFIG_HOME: tmp }, () => {
      assert.strictEqual(getDefaultMode(), 'on');
    });
  } finally {
    rmTmpDir(tmp);
  }
});

test('missing config.json falls back to on', () => {
  const tmp = makeTmpDir();
  try {
    // XDG set but no config.json inside
    withEnv({ VIBEFULLNESS_DEFAULT_MODE: undefined, XDG_CONFIG_HOME: tmp }, () => {
      assert.strictEqual(getDefaultMode(), 'on');
    });
  } finally {
    rmTmpDir(tmp);
  }
});

test('malformed JSON in config.json falls back to on', () => {
  const tmp = makeTmpDir();
  try {
    const cfgDir = path.join(tmp, 'vibefullness');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'config.json'), '{ not json !!');

    withEnv({ VIBEFULLNESS_DEFAULT_MODE: undefined, XDG_CONFIG_HOME: tmp }, () => {
      assert.strictEqual(getDefaultMode(), 'on');
    });
  } finally {
    rmTmpDir(tmp);
  }
});

test('invalid defaultMode value in config.json falls back to on', () => {
  const tmp = makeTmpDir();
  try {
    const cfgDir = path.join(tmp, 'vibefullness');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify({ defaultMode: 'turbo' }));

    withEnv({ VIBEFULLNESS_DEFAULT_MODE: undefined, XDG_CONFIG_HOME: tmp }, () => {
      assert.strictEqual(getDefaultMode(), 'on');
    });
  } finally {
    rmTmpDir(tmp);
  }
});

test('config.json with no defaultMode field falls back to on', () => {
  const tmp = makeTmpDir();
  try {
    const cfgDir = path.join(tmp, 'vibefullness');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify({ someOtherKey: 'lite' }));

    withEnv({ VIBEFULLNESS_DEFAULT_MODE: undefined, XDG_CONFIG_HOME: tmp }, () => {
      assert.strictEqual(getDefaultMode(), 'on');
    });
  } finally {
    rmTmpDir(tmp);
  }
});

// ---------------------------------------------------------------------------
// readFlag
// ---------------------------------------------------------------------------

test('readFlag returns valid mode from a normal file', () => {
  const tmp = makeTmpDir();
  try {
    const p = path.join(tmp, '.vibefullness-active');
    fs.writeFileSync(p, 'on');
    assert.strictEqual(readFlag(p), 'on');
  } finally {
    rmTmpDir(tmp);
  }
});

test('readFlag trims whitespace and lowercases (  ON\\n -> on)', () => {
  const tmp = makeTmpDir();
  try {
    const p = path.join(tmp, '.vibefullness-active');
    fs.writeFileSync(p, '  ON\n');
    assert.strictEqual(readFlag(p), 'on');
  } finally {
    rmTmpDir(tmp);
  }
});

test('readFlag returns null for a dropped legacy value (ULTRA)', () => {
  const tmp = makeTmpDir();
  try {
    const p = path.join(tmp, '.vibefullness-active');
    fs.writeFileSync(p, '  ULTRA\n');
    assert.strictEqual(readFlag(p), null);
  } finally {
    rmTmpDir(tmp);
  }
});

test('readFlag returns null for non-whitelisted content', () => {
  const tmp = makeTmpDir();
  try {
    const p = path.join(tmp, '.vibefullness-active');
    fs.writeFileSync(p, 'garbage');
    assert.strictEqual(readFlag(p), null);
  } finally {
    rmTmpDir(tmp);
  }
});

test('readFlag returns null for file larger than 64 bytes', () => {
  const tmp = makeTmpDir();
  try {
    const p = path.join(tmp, '.vibefullness-active');
    fs.writeFileSync(p, 'x'.repeat(100));
    assert.strictEqual(readFlag(p), null);
  } finally {
    rmTmpDir(tmp);
  }
});

test('readFlag returns null for missing file', () => {
  const tmp = makeTmpDir();
  try {
    const p = path.join(tmp, '.vibefullness-active');
    // Do NOT create the file
    assert.strictEqual(readFlag(p), null);
  } finally {
    rmTmpDir(tmp);
  }
});

test('readFlag returns null for symlink at flagPath (refuses to follow)', () => {
  const tmp = makeTmpDir();
  try {
    const real = path.join(tmp, 'real-flag');
    const link = path.join(tmp, '.vibefullness-active');
    fs.writeFileSync(real, 'on');
    try {
      fs.symlinkSync(real, link);
    } catch (e) {
      if (e.code === 'EPERM' || e.code === 'ENOTSUP') {
        console.log('NOTE: symlink creation not supported on this platform — skipping symlink-at-flagPath test');
        return;
      }
      throw e;
    }
    assert.strictEqual(readFlag(link), null, 'symlink at flagPath must return null');
  } finally {
    rmTmpDir(tmp);
  }
});

test('readFlag returns null when flagPath is a directory', () => {
  const tmp = makeTmpDir();
  try {
    const p = path.join(tmp, 'adir');
    fs.mkdirSync(p);
    assert.strictEqual(readFlag(p), null);
  } finally {
    rmTmpDir(tmp);
  }
});

// ---------------------------------------------------------------------------
// safeWriteFlag
// ---------------------------------------------------------------------------

test('safeWriteFlag writes content readable via readFlag round-trip', () => {
  const tmp = makeTmpDir();
  try {
    const p = path.join(tmp, '.vibefullness-active');
    safeWriteFlag(p, 'on');
    assert.strictEqual(readFlag(p), 'on');
  } finally {
    rmTmpDir(tmp);
  }
});

test('safeWriteFlag sets file mode 0600 (POSIX only)', () => {
  if (process.platform === 'win32') {
    console.log('NOTE: Skipping 0600 mode check on win32');
    return;
  }
  const tmp = makeTmpDir();
  try {
    const p = path.join(tmp, '.vibefullness-active');
    safeWriteFlag(p, 'on');
    const mode = fs.statSync(p).mode & 0o777;
    assert.strictEqual(mode, 0o600, `expected 0600, got 0${mode.toString(8)}`);
  } finally {
    rmTmpDir(tmp);
  }
});

test('safeWriteFlag leaves no temp files in the dir after write', () => {
  const tmp = makeTmpDir();
  try {
    const p = path.join(tmp, '.vibefullness-active');
    safeWriteFlag(p, 'off');
    const files = fs.readdirSync(tmp);
    const temps = files.filter(f => f.startsWith('.vibefullness-active.'));
    assert.deepStrictEqual(temps, [], `leftover temp files: ${temps.join(', ')}`);
  } finally {
    rmTmpDir(tmp);
  }
});

test('safeWriteFlag creates parent directory when missing', () => {
  const tmp = makeTmpDir();
  try {
    const nested = path.join(tmp, 'nested', 'dir');
    const p = path.join(nested, '.vibefullness-active');
    safeWriteFlag(p, 'on');
    assert.strictEqual(readFlag(p), 'on');
  } finally {
    rmTmpDir(tmp);
  }
});

test('safeWriteFlag refuses to write when parent dir is a symlink', () => {
  const tmp = makeTmpDir();
  try {
    const real = path.join(tmp, 'real-dir');
    const link = path.join(tmp, 'linked-dir');
    fs.mkdirSync(real);
    try {
      fs.symlinkSync(real, link);
    } catch (e) {
      if (e.code === 'EPERM' || e.code === 'ENOTSUP') {
        console.log('NOTE: symlink creation not supported — skipping symlinked-parent-dir test');
        return;
      }
      throw e;
    }
    const flagPath = path.join(link, '.vibefullness-active');
    safeWriteFlag(flagPath, 'on');
    // Target must NOT have been written
    assert.ok(!fs.existsSync(flagPath), 'flag file must not be created when parent is a symlink');
  } finally {
    rmTmpDir(tmp);
  }
});

test('safeWriteFlag refuses to clobber an existing symlink at flagPath', () => {
  const tmp = makeTmpDir();
  try {
    const victim = path.join(tmp, 'victim');
    const link = path.join(tmp, '.vibefullness-active');
    const original = 'original-content';
    fs.writeFileSync(victim, original);
    try {
      fs.symlinkSync(victim, link);
    } catch (e) {
      if (e.code === 'EPERM' || e.code === 'ENOTSUP') {
        console.log('NOTE: symlink creation not supported — skipping symlink-at-flagPath clobber test');
        return;
      }
      throw e;
    }
    safeWriteFlag(link, 'on');
    // The victim must be unchanged
    assert.strictEqual(
      fs.readFileSync(victim, 'utf8'),
      original,
      'victim file must not be clobbered through symlink'
    );
  } finally {
    rmTmpDir(tmp);
  }
});

test('safeWriteFlag overwrites a previously written flag on second call', () => {
  const tmp = makeTmpDir();
  try {
    const p = path.join(tmp, '.vibefullness-active');
    safeWriteFlag(p, 'off');
    safeWriteFlag(p, 'on');
    assert.strictEqual(readFlag(p), 'on');
  } finally {
    rmTmpDir(tmp);
  }
});

// test/shared-process.test.js — Unit tests for hooks/shared-process.js
const { describe, it, beforeEach, mock } = require("node:test");
const assert = require("node:assert");

const { getPlatformConfig, createPidResolver, readStdinJson } = require("../hooks/shared-process");

// ═════════════════════════════════════════════════════════════════════════════
// getPlatformConfig()
// ═════════════════════════════════════════════════════════════════════════════

describe("getPlatformConfig()", () => {
  it("returns terminalNames, systemBoundary, editorMap, editorPathChecks", () => {
    const cfg = getPlatformConfig();
    assert.ok(cfg.terminalNames instanceof Set);
    assert.ok(cfg.systemBoundary instanceof Set);
    assert.ok(typeof cfg.editorMap === "object");
    assert.ok(Array.isArray(cfg.editorPathChecks));
  });

  it("base terminal names include common terminals", () => {
    const cfg = getPlatformConfig();
    // At least one terminal should be present regardless of platform
    const all = [...cfg.terminalNames];
    assert.ok(all.length > 5, "should have several terminals");
  });

  it("merges extraTerminals into base set", () => {
    const cfg = getPlatformConfig({
      extraTerminals: { win: ["custom.exe"], mac: ["custom"], linux: ["custom"] },
    });
    // The extra should be present (exact key depends on platform)
    const isWin = process.platform === "win32";
    const isLinux = process.platform === "linux";
    if (isWin) assert.ok(cfg.terminalNames.has("custom.exe"));
    else if (isLinux) assert.ok(cfg.terminalNames.has("custom"));
    else assert.ok(cfg.terminalNames.has("custom"));
  });

  it("merges extraEditors into base map", () => {
    const cfg = getPlatformConfig({
      extraEditors: { win: { "foo.exe": "foo" }, mac: { "foo": "foo" }, linux: { "foo": "foo" } },
    });
    // Base editors should still be present
    const isWin = process.platform === "win32";
    if (isWin) {
      assert.strictEqual(cfg.editorMap["code.exe"], "code");
      assert.strictEqual(cfg.editorMap["foo.exe"], "foo");
    } else {
      assert.strictEqual(cfg.editorMap["code"], "code");
      assert.strictEqual(cfg.editorMap["foo"], "foo");
    }
  });

  it("prepends extraEditorPathChecks before defaults", () => {
    const cfg = getPlatformConfig({
      extraEditorPathChecks: [["myeditor", "mine"]],
    });
    assert.deepStrictEqual(cfg.editorPathChecks[0], ["myeditor", "mine"]);
    // Default checks still present after
    assert.ok(cfg.editorPathChecks.some(([p]) => p === "visual studio code"));
  });

  it("returns defaults when no options given", () => {
    const cfg = getPlatformConfig();
    assert.ok(cfg.editorPathChecks.length === 2); // visual studio code + cursor.app
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// createPidResolver() — factory + caching behavior
// ═════════════════════════════════════════════════════════════════════════════

describe("createPidResolver()", () => {
  it("returns a function", () => {
    const cfg = getPlatformConfig();
    const resolve = createPidResolver({ platformConfig: cfg });
    assert.strictEqual(typeof resolve, "function");
  });

  it("caches result after first call", () => {
    const cfg = getPlatformConfig();
    const resolve = createPidResolver({ platformConfig: cfg, startPid: process.pid, maxDepth: 1 });
    const r1 = resolve();
    const r2 = resolve();
    assert.strictEqual(r1, r2, "should return same object reference");
  });

  it("result has expected shape", () => {
    const cfg = getPlatformConfig();
    const resolve = createPidResolver({ platformConfig: cfg, startPid: process.pid, maxDepth: 1 });
    const result = resolve();
    assert.ok("stablePid" in result);
    assert.ok("agentPid" in result);
    assert.ok("detectedEditor" in result);
    assert.ok(Array.isArray(result.pidChain));
  });

  it("reads the current process through the platform provider", () => {
    const cfg = getPlatformConfig();
    const resolve = createPidResolver({ platformConfig: cfg, startPid: process.pid, maxDepth: 1 });
    const { pidChain } = resolve();
    // Keep the live provider check bounded; deterministic tests cover ancestors.
    assert.deepStrictEqual(pidChain, [process.pid]);
  });

  it("respects maxDepth", () => {
    const cfg = getPlatformConfig();
    const resolve = createPidResolver({ platformConfig: cfg, startPid: process.pid, maxDepth: 1 });
    const { pidChain } = resolve();
    assert.ok(pidChain.length <= 1);
  });
});

// readStdinJson() is not unit-tested here — it attaches listeners to
// process.stdin (singleton) which prevents process exit. Validated by
// real agent integration tests + the finishOnce/timeout logic is trivial.


describe('Windows CIM process discovery', { skip: process.platform !== 'win32' }, () => {
  it('finds the terminal and editor with one cached ancestor snapshot without WMIC', t => {
    const cp = require('node:child_process');
    let calls = 0;
    t.mock.method(cp, 'execSync', () => { throw Error('WMIC unavailable'); });
    t.mock.method(cp, 'execFileSync', (exe, args, options) => {
      calls++;
      assert.strictEqual(exe, 'powershell.exe');
      assert.ok(args.join(' ').includes('Get-CimInstance'));
      assert.strictEqual(options.windowsHide, true);
      return JSON.stringify([{ ProcessId: 100, ParentProcessId: 90, Name: 'node.exe' }, { ProcessId: 90, ParentProcessId: 80, Name: 'code.exe' }, { ProcessId: 80, ParentProcessId: 4, Name: 'explorer.exe' }]);
    });
    const resolve = createPidResolver({ platformConfig: getPlatformConfig(), startPid: 100 });
    const result = resolve();
    assert.deepStrictEqual(result.pidChain, [100, 90, 80]);
    assert.strictEqual(result.stablePid, 90);
    assert.strictEqual(result.detectedEditor, 'code');
    assert.strictEqual(resolve(), result);
    assert.strictEqual(calls, 1);
  });
  it('checks a node agent command line and respects the depth limit', t => {
    t.mock.method(require('node:child_process'), 'execFileSync', () => JSON.stringify([{ ProcessId: 100, ParentProcessId: 90, Name: 'node.exe', CommandLine: 'node example-agent.js' }, { ProcessId: 90, ParentProcessId: 4, Name: 'code.exe' }]));
    const result = createPidResolver({ platformConfig: getPlatformConfig(), startPid: 100, maxDepth: 1, agentCmdlineCheck: line => line.includes('example-agent') })();
    assert.deepStrictEqual(result.pidChain, [100]);
    assert.strictEqual(result.agentPid, 100);
    assert.strictEqual(result.detectedEditor, null);
  });
  it('keeps a stable fallback when CIM access fails', t => {
    t.mock.method(require('node:child_process'), 'execFileSync', () => { throw Error('Process disappeared'); });
    const resolve = createPidResolver({ platformConfig: getPlatformConfig(), startPid: 100 });
    const result = resolve();
    assert.strictEqual(result.stablePid, 100);
    assert.deepStrictEqual(result.pidChain, []);
    assert.strictEqual(resolve(), result);
  });
});

const { describe, it } = require("node:test");
const assert = require("node:assert");
const EventEmitter = require("node:events");
const { startAgentMonitors, setupAppBootstrap } = require("../src/app-bootstrap");

class FakeMonitor {
  constructor(agent, onEvent) {
    this.agent = agent;
    this.onEvent = onEvent;
    this.started = false;
    this.stopped = false;
  }

  start() {
    this.started = true;
  }

  stop() {
    this.stopped = true;
  }
}

class FakeApp extends EventEmitter {
  constructor({ lock = true } = {}) {
    super();
    this.lock = lock;
    this.quitCalls = 0;
    this.whenReadyCalls = 0;
    this.userDataPath = "C:\\tmp\\user-data";
    this.dockHidden = 0;
    this.dock = { hide: () => { this.dockHidden += 1; } };
  }

  requestSingleInstanceLock() {
    return this.lock;
  }

  quit() {
    this.quitCalls += 1;
  }

  whenReady() {
    this.whenReadyCalls += 1;
    return Promise.resolve();
  }

  getPath(name) {
    if (name === "userData") return this.userDataPath;
    return "";
  }
}

describe("app-bootstrap", () => {
  it("starts codex/gemini monitors and routes codex permission events", () => {
    let codexMonitor = null;
    let geminiMonitor = null;
    let codexPermission = null;
    const codexStates = [];
    const geminiStates = [];
    let extensionInstallCalls = 0;

    const requireImpl = (id) => {
      if (id === "../agents/codex-log-monitor") return FakeMonitor;
      if (id === "../agents/gemini-log-monitor") return FakeMonitor;
      if (id === "../agents/codex") return { id: "codex" };
      if (id === "../agents/gemini-cli") return { id: "gemini" };
      throw new Error(`unexpected module: ${id}`);
    };

    startAgentMonitors({
      isRiosDashboardMode: false,
      dashboardBridge: { startMonitor: () => {} },
      requireImpl,
      onCodexPermission: (sid, event, extra) => { codexPermission = { sid, event, extra }; },
      onCodexState: (sid, state, event, extra) => { codexStates.push({ sid, state, event, extra }); },
      onGeminiState: (sid, state, event, extra) => { geminiStates.push({ sid, state, event, extra }); },
      setCodexMonitor: (monitor) => { codexMonitor = monitor; },
      setGeminiMonitor: (monitor) => { geminiMonitor = monitor; },
      installTerminalFocusExtension: () => { extensionInstallCalls += 1; },
      baseDir: "C:\\workspace\\apps\\pet-desktop\\src",
      logger: { warn: () => {} },
    });

    assert.ok(codexMonitor && codexMonitor.started);
    assert.ok(geminiMonitor && geminiMonitor.started);
    assert.strictEqual(extensionInstallCalls, 1);

    codexMonitor.onEvent("sid-1", "codex-permission", "PermissionRequest", { cwd: "C:\\tmp", permissionDetail: { command: "ls" } });
    codexMonitor.onEvent("sid-1", "working", "task_started", { cwd: "C:\\tmp" });
    geminiMonitor.onEvent("sid-g", "thinking", "user_message", { cwd: "C:\\tmp" });

    assert.strictEqual(codexPermission.sid, "sid-1");
    assert.strictEqual(codexStates.length, 1);
    assert.strictEqual(geminiStates.length, 1);
  });

  it("quits immediately when single-instance lock is not acquired", () => {
    const app = new FakeApp({ lock: false });
    const ok = setupAppBootstrap({
      app,
      path: require("path"),
      isMac: false,
      isLinux: false,
      loadPrefs: () => null,
      getMainWindow: () => null,
      getHitWindow: () => null,
      reapplyMacVisibility: () => {},
      createWindow: () => {},
      setupAutoUpdater: () => {},
      setPermDebugLog: () => {},
      setUpdateDebugLog: () => {},
      setIsQuitting: () => {},
      isQuitting: () => false,
      onBeforeQuit: () => {},
      startAgentMonitorsArgs: {},
      startAgentMonitorsImpl: () => {},
    });

    assert.strictEqual(ok, false);
    assert.strictEqual(app.quitCalls, 1);
  });

  it("wires ready/second-instance/before-quit/window-all-closed lifecycle", async () => {
    const app = new FakeApp({ lock: true });
    let permLog = null;
    let updateLog = null;
    let createWindowCalls = 0;
    let setupAutoUpdaterCalls = 0;
    let beforeQuitCalls = 0;
    let monitorStartCalls = 0;
    let reapplyCalls = 0;
    let isQuitting = false;

    const mainWin = {
      destroyed: false,
      isDestroyed() { return this.destroyed; },
      showInactiveCalls: 0,
      setSkipTaskbarCalls: 0,
      showInactive() { this.showInactiveCalls += 1; },
      setSkipTaskbar() { this.setSkipTaskbarCalls += 1; },
    };
    const hitWin = {
      destroyed: false,
      isDestroyed() { return this.destroyed; },
      showInactiveCalls: 0,
      setSkipTaskbarCalls: 0,
      showInactive() { this.showInactiveCalls += 1; },
      setSkipTaskbar() { this.setSkipTaskbarCalls += 1; },
    };

    const ok = setupAppBootstrap({
      app,
      path: require("path"),
      isMac: true,
      isLinux: true,
      loadPrefs: () => ({ showDock: false }),
      getMainWindow: () => mainWin,
      getHitWindow: () => hitWin,
      reapplyMacVisibility: () => { reapplyCalls += 1; },
      createWindow: () => { createWindowCalls += 1; },
      setupAutoUpdater: () => { setupAutoUpdaterCalls += 1; },
      setPermDebugLog: (next) => { permLog = next; },
      setUpdateDebugLog: (next) => { updateLog = next; },
      setIsQuitting: (next) => { isQuitting = next; },
      isQuitting: () => isQuitting,
      onBeforeQuit: () => { beforeQuitCalls += 1; },
      startAgentMonitorsArgs: { marker: "ok" },
      startAgentMonitorsImpl: () => { monitorStartCalls += 1; },
    });

    assert.strictEqual(ok, true);
    await Promise.resolve();
    assert.strictEqual(app.whenReadyCalls, 1);
    assert.strictEqual(createWindowCalls, 1);
    assert.strictEqual(setupAutoUpdaterCalls, 1);
    assert.strictEqual(monitorStartCalls, 1);
    assert.ok(permLog && permLog.includes("permission-debug.log"));
    assert.ok(updateLog && updateLog.includes("update-debug.log"));
    assert.strictEqual(app.dockHidden, 1);

    app.emit("second-instance");
    assert.strictEqual(mainWin.showInactiveCalls, 1);
    assert.strictEqual(mainWin.setSkipTaskbarCalls, 1);
    assert.strictEqual(hitWin.showInactiveCalls, 1);
    assert.strictEqual(hitWin.setSkipTaskbarCalls, 1);
    assert.strictEqual(reapplyCalls, 1);

    app.emit("window-all-closed");
    assert.strictEqual(app.quitCalls, 0);
    app.emit("before-quit");
    assert.strictEqual(beforeQuitCalls, 1);
    assert.strictEqual(isQuitting, true);
    app.emit("window-all-closed");
    assert.strictEqual(app.quitCalls, 1);
  });
});

const { describe, it } = require("node:test");
const assert = require("node:assert");
const EventEmitter = require("node:events");
const {
  getNearestWorkArea,
  looseClampToDisplays,
  clampToScreen,
  bootstrapWindows,
  attachWindowLifecycle,
} = require("../src/window-orchestrator");

class FakeWebContents extends EventEmitter {
  constructor() {
    super();
    this.reloadCalls = 0;
  }

  reload() {
    this.reloadCalls += 1;
  }
}

class FakeWindow {
  constructor(bounds) {
    this.bounds = { ...bounds };
    this.webContents = new FakeWebContents();
  }

  isDestroyed() {
    return false;
  }

  getBounds() {
    return { ...this.bounds };
  }

  setBounds(next) {
    this.bounds = { ...this.bounds, ...next };
  }
}

class FakeBrowserWindow {
  static instances = [];

  constructor(options = {}) {
    this.options = options;
    this.bounds = {
      x: options.x || 0,
      y: options.y || 0,
      width: options.width || 0,
      height: options.height || 0,
    };
    this.webContents = new FakeWebContents();
    this.events = new EventEmitter();
    this.skipTaskbarCalls = 0;
    this.alwaysOnTopCalls = 0;
    this.isMouseIgnored = false;
    this.shape = null;
    FakeBrowserWindow.instances.push(this);
  }

  static reset() {
    FakeBrowserWindow.instances = [];
  }

  on(event, handler) {
    this.events.on(event, handler);
  }

  emit(event, ...args) {
    this.events.emit(event, ...args);
  }

  isDestroyed() {
    return false;
  }

  getBounds() {
    return { ...this.bounds };
  }

  setBounds(next) {
    this.bounds = { ...this.bounds, ...next };
  }

  setFocusable() {}
  loadFile() {}
  showInactive() {}

  setSkipTaskbar() {
    this.skipTaskbarCalls += 1;
  }

  setAlwaysOnTop() {
    this.alwaysOnTopCalls += 1;
  }

  setShape(shape) {
    this.shape = shape;
  }

  setIgnoreMouseEvents(flag) {
    this.isMouseIgnored = !!flag;
  }
}

describe("window-orchestrator", () => {
  it("computes nearest display and clamp bounds", () => {
    const screen = {
      getAllDisplays: () => ([
        { workArea: { x: 0, y: 0, width: 1000, height: 800 } },
        { workArea: { x: 1000, y: 0, width: 1000, height: 800 } },
      ]),
    };

    const nearest = getNearestWorkArea(screen, 1500, 200);
    assert.strictEqual(nearest.x, 1000);

    const loose = looseClampToDisplays(screen, 2500, 1200, 300, 300);
    assert.ok(loose.x <= 1775);
    assert.ok(loose.y <= 575);

    const clamped = clampToScreen(screen, -500, -500, 300, 300);
    assert.ok(clamped.x >= 12);
    assert.ok(clamped.y >= 12);
  });

  it("attaches lifecycle hooks and reacts to display/render events", () => {
    const screen = new EventEmitter();
    screen.getAllDisplays = () => ([{ workArea: { x: 0, y: 0, width: 1200, height: 900 } }]);

    const win = new FakeWindow({ x: 100, y: 120, width: 240, height: 240 });

    let initFocusCalls = 0;
    let startMainTickCalls = 0;
    let startHttpCalls = 0;
    let startStaleCleanupCalls = 0;
    let resetIdleTimerCalls = 0;
    let guardAlwaysOnTopCalls = 0;
    let startTopmostCalls = 0;
    let reapplyCalls = 0;
    let syncHitCalls = 0;
    let dragLocked = true;
    let idlePaused = true;
    let mouseOverPet = true;
    const appliedStates = [];
    const themedIdleSvg = "mint-chip-idle-follow.svg";

    attachWindowLifecycle({
      screen,
      getMainWindow: () => win,
      miniApi: {
        getMiniMode: () => false,
        getMiniEdge: () => "right",
        handleDisplayChange: () => {},
        exitMiniMode: () => {},
      },
      displayApi: {
        applyState: (...args) => appliedStates.push(args),
        resolveDisplayState: () => "working",
        getSvgOverride: (state) => state === "idle" ? themedIdleSvg : "mint-chip-working-typing.svg",
        getSessionCount: () => 0,
        detectRunningAgentProcesses: (cb) => cb(false),
        startStartupRecovery: () => {},
      },
      runtimeState: {
        getDoNotDisturb: () => false,
        setDragLocked: (next) => { dragLocked = next; },
        setIdlePaused: (next) => { idlePaused = next; },
        setMouseOverPet: (next) => { mouseOverPet = next; },
      },
      windowApi: {
        getCurrentPixelSize: () => ({ width: 240, height: 240 }),
        clampToScreen: () => ({ x: 130, y: 140 }),
        syncHitWindow: () => { syncHitCalls += 1; },
      },
      rendererApi: {
        sendToRenderer: () => {},
        sendToHitWin: () => {},
      },
      lifecycleApi: {
        initFocusHelper: () => { initFocusCalls += 1; },
        startMainTick: () => { startMainTickCalls += 1; },
        startHttpServer: () => { startHttpCalls += 1; },
        startStaleCleanup: () => { startStaleCleanupCalls += 1; },
        resetIdleTimer: () => { resetIdleTimerCalls += 1; },
      },
      reapplyMacVisibility: () => { reapplyCalls += 1; },
      guardAlwaysOnTop: () => { guardAlwaysOnTopCalls += 1; },
      startTopmostWatchdog: () => { startTopmostCalls += 1; },
      isProportionalMode: () => false,
    });

    assert.strictEqual(initFocusCalls, 1);
    assert.strictEqual(startMainTickCalls, 1);
    assert.strictEqual(startHttpCalls, 1);
    assert.strictEqual(startStaleCleanupCalls, 1);
    assert.strictEqual(guardAlwaysOnTopCalls, 1);
    assert.strictEqual(startTopmostCalls, 1);

    win.webContents.emit("did-finish-load");
    assert.strictEqual(appliedStates.length >= 1, true);
    assert.strictEqual(appliedStates[0][0], "idle");
    assert.strictEqual(appliedStates[0][1], themedIdleSvg);

    win.webContents.emit("render-process-gone", {}, { reason: "crashed" });
    assert.strictEqual(dragLocked, false);
    assert.strictEqual(idlePaused, false);
    assert.strictEqual(mouseOverPet, false);
    assert.strictEqual(win.webContents.reloadCalls, 1);

    screen.emit("display-metrics-changed");
    assert.strictEqual(syncHitCalls, 1);
    assert.strictEqual(win.bounds.x, 130);
    assert.strictEqual(win.bounds.y, 140);

    screen.emit("display-added");
    assert.strictEqual(reapplyCalls >= 2, true);
    assert.strictEqual(resetIdleTimerCalls, 0);
  });

  it("continues lifecycle startup when one startup hook throws", () => {
    const screen = new EventEmitter();
    screen.getAllDisplays = () => ([{ workArea: { x: 0, y: 0, width: 1200, height: 900 } }]);
    const win = new FakeWindow({ x: 40, y: 60, width: 200, height: 200 });
    let startMainTickCalls = 0;
    let startHttpCalls = 0;
    let startStaleCleanupCalls = 0;

    attachWindowLifecycle({
      screen,
      getMainWindow: () => win,
      miniApi: {
        getMiniMode: () => false,
        getMiniEdge: () => "right",
        handleDisplayChange: () => {},
        exitMiniMode: () => {},
      },
      displayApi: {
        applyState: () => {},
        resolveDisplayState: () => "idle",
        getSvgOverride: () => "clawd-idle-follow.svg",
        getSessionCount: () => 0,
        detectRunningAgentProcesses: (cb) => cb(false),
        startStartupRecovery: () => {},
      },
      runtimeState: {
        getDoNotDisturb: () => false,
        setDragLocked: () => {},
        setIdlePaused: () => {},
        setMouseOverPet: () => {},
      },
      windowApi: {
        getCurrentPixelSize: () => ({ width: 200, height: 200 }),
        clampToScreen: () => ({ x: 40, y: 60 }),
        syncHitWindow: () => {},
      },
      rendererApi: {
        sendToRenderer: () => {},
        sendToHitWin: () => {},
      },
      lifecycleApi: {
        initFocusHelper: () => { throw new Error("focus-helper-unavailable"); },
        startMainTick: () => { startMainTickCalls += 1; },
        startHttpServer: () => { startHttpCalls += 1; },
        startStaleCleanup: () => { startStaleCleanupCalls += 1; },
        resetIdleTimer: () => {},
      },
      reapplyMacVisibility: () => {},
      guardAlwaysOnTop: () => {},
      startTopmostWatchdog: () => {},
      isProportionalMode: () => false,
    });

    assert.strictEqual(startMainTickCalls, 1);
    assert.strictEqual(startHttpCalls, 1);
    assert.strictEqual(startStaleCleanupCalls, 1);
  });

  it("injects dashboard mode and legacy interaction config into hit window args", () => {
    FakeBrowserWindow.reset();
    const fakePath = { join: (...parts) => parts.join("/") };
    const screen = {
      getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1200, height: 800 } }),
    };
    const legacyInteraction = {
      dashboardClickWindowMs: 260,
      defaultClickWindowMs: 400,
      dashboardHoverCards: true,
      dashboardDoubleClickOpen: true,
      reactionDurationScale: 1.2,
      statePriorityOverrides: { working: 9 },
      rewardSignalCooldownMs: 12000,
    };
    let ensureCreatedCalls = 0;

    bootstrapWindows({
      BrowserWindow: FakeBrowserWindow,
      path: fakePath,
      baseDir: "C:/tmp/pet",
      screen,
      isMac: false,
      isLinux: false,
      isWin: false,
      linuxWindowType: "toolbar",
      winTopmostLevel: "pop-up-menu",
      sizePresets: { S: { width: 200, height: 200 } },
      isRiosDashboardMode: true,
      loadPrefs: () => null,
      savePrefs: () => {},
      isProportionalMode: () => false,
      getCurrentPixelSize: () => ({ width: 220, height: 220 }),
      clampToScreen: (x, y) => ({ x, y }),
      applyDockVisibility: () => {},
      themeLoader: {
        getRendererConfig: () => ({ theme: "clawd" }),
        getHitRendererConfig: () => ({ reactions: {} }),
      },
      hitInteractionConfig: legacyInteraction,
      menuApi: {
        buildContextMenu: () => {},
        createTray: () => {},
        ensureContextMenuOwner: () => {},
      },
      quickTaskPanel: {
        ensureCreated: () => { ensureCreatedCalls += 1; },
        positionWindow: () => {},
      },
      miniApi: {
        restoreFromPrefs: () => ({ x: 20, y: 20 }),
        getMiniMode: () => false,
      },
      runtimeApi: {
        setCurrentSize: () => {},
        setLang: () => {},
        setShowTray: () => {},
        setShowDock: () => {},
        setAutoStartWithClaude: () => {},
        setBubbleFollowPet: () => {},
        setHideBubbles: () => {},
        setShowSessionId: () => {},
        setSoundMuted: () => {},
        getShowTray: () => true,
        isQuitting: () => false,
        sendToHitWin: () => {},
        getDoNotDisturb: () => false,
      },
      getHitRectScreen: ({ x, y }) => ({
        left: x + 10,
        top: y + 12,
        right: x + 110,
        bottom: y + 112,
      }),
      reapplyMacVisibility: () => {},
      guardAlwaysOnTop: () => {},
      syncHitWindow: () => {},
      getCurrentSvg: () => "clawd-idle-follow.svg",
    });

    assert.strictEqual(ensureCreatedCalls, 1);
    assert.strictEqual(FakeBrowserWindow.instances.length, 2);
    const hitWindow = FakeBrowserWindow.instances[1];
    const args = (((hitWindow || {}).options || {}).webPreferences || {}).additionalArguments || [];
    const modeArg = args.find((item) => typeof item === "string" && item.startsWith("--dashboard-mode="));
    const interactionArg = args.find((item) => typeof item === "string" && item.startsWith("--hit-interaction-config="));

    assert.strictEqual(modeArg, "--dashboard-mode=1");
    assert.ok(interactionArg);
    const parsed = JSON.parse(interactionArg.slice("--hit-interaction-config=".length));
    assert.strictEqual(parsed.dashboardHoverCards, true);
    assert.strictEqual(parsed.dashboardDoubleClickOpen, true);
    assert.strictEqual(parsed.reactionDurationScale, 1.2);
    assert.strictEqual(parsed.rewardSignalCooldownMs, 12000);
  });
});

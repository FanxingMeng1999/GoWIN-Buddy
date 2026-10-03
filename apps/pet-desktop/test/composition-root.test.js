const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  createWindowRuntimeEntry,
  setupMainLifecycle,
  createBeforeQuitHandler,
  createAgentMonitorHooks,
} = require("../src/composition-root");

describe("composition-root", () => {
  it("wires bootstrap/ipc/lifecycle with the created windows", () => {
    const mainWindow = { id: "main" };
    const hitWindow = { id: "hit" };
    const applyStateCalls = [];
    const lifecycleCalls = [];
    let bootstrapArgs = null;
    let ipcArgs = null;
    let lifecycleArgs = null;

    const stateController = {
      sessions: new Map([["s1", {}]]),
      STATE_PRIORITY: { idle: 0, working: 1 },
      getCurrentState: () => "idle",
      getCurrentSvg: () => "idle.svg",
      getSvgOverride: (state) => `${state}.svg`,
      applyState: (...args) => applyStateCalls.push(args),
      resolveDisplayState: () => "working",
      detectRunningAgentProcesses: (cb) => cb(false),
      startStartupRecovery: () => lifecycleCalls.push("startup"),
      buildSessionSubmenu: () => [],
    };

    const result = createWindowRuntimeEntry({
      bootstrapWindowsImpl: (args) => {
        bootstrapArgs = args;
        return { mainWindow, hitWindow };
      },
      registerIpcRouterImpl: (args) => {
        ipcArgs = args;
      },
      attachWindowLifecycleImpl: (args) => {
        lifecycleArgs = args;
      },
      core: {
        BrowserWindow: {},
        pathModule: require("path"),
        baseDir: __dirname,
        screen: {},
        isMac: false,
        isLinux: false,
        isWin: true,
        linuxWindowType: "toolbar",
        winTopmostLevel: "pop-up-menu",
        sizePresets: { S: { width: 200, height: 200 } },
        isRiosDashboardMode: true,
        loadPrefs: () => null,
        savePrefs: () => {},
        isProportionalMode: () => true,
        getCurrentPixelSize: () => ({ width: 200, height: 200 }),
        clampToScreen: () => ({ x: 0, y: 0 }),
        applyDockVisibility: () => {},
        themeLoader: {},
        getHitRectScreen: () => ({ left: 0, top: 0, right: 1, bottom: 1 }),
        reapplyMacVisibility: () => {},
        guardAlwaysOnTop: () => {},
        startTopmostWatchdog: () => {},
        looseClampToDisplays: () => ({ x: 0, y: 0 }),
      },
      runtimeState: {
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
        getDoNotDisturb: () => false,
        setIdlePaused: () => {},
        setDragLocked: () => {},
        setMouseOverPet: () => {},
        bubbleShouldFollowPet: () => false,
        bubbleHasPending: () => false,
        bubbleReposition: () => {},
      },
      controllers: {
        miniController: {
          restoreFromPrefs: () => ({ x: 0, y: 0 }),
          getMiniMode: () => false,
          getMiniTransitioning: () => false,
          checkMiniModeSnap: () => {},
          exitMiniMode: () => {},
          getMiniEdge: () => "right",
          handleDisplayChange: () => {},
        },
        stateController,
        permissionController: {
          handleBubbleHeight: () => {},
          handleDecide: () => {},
        },
      },
      services: {
        quickTaskPanel: {},
        dashboardBridge: {},
        menu: {
          buildContextMenu: () => {},
          createTray: () => {},
          ensureContextMenuOwner: () => {},
          showPetContextMenu: () => {},
        },
        focusTerminalWindow: () => {},
        popupMenuAt: () => {},
        lifecycle: {
          initFocusHelper: () => lifecycleCalls.push("focus"),
          startMainTick: () => lifecycleCalls.push("tick"),
          startHttpServer: () => lifecycleCalls.push("http"),
          startStaleCleanup: () => lifecycleCalls.push("stale"),
          resetIdleTimer: () => lifecycleCalls.push("idle"),
        },
      },
      io: {
        sendToRenderer: () => {},
        sendToHitWin: () => {},
        syncHitWindow: () => {},
      },
      electron: {
        ipcMain: {},
        Menu: {},
      },
    });

    assert.strictEqual(result.mainWindow, mainWindow);
    assert.strictEqual(result.hitWindow, hitWindow);
    assert.strictEqual(typeof bootstrapArgs.runtimeApi.setCurrentSize, "function");
    assert.strictEqual(ipcArgs.windowApi.getMainWindow(), mainWindow);
    assert.strictEqual(ipcArgs.windowApi.getHitWindow(), hitWindow);
    assert.strictEqual(ipcArgs.statePriority, stateController.STATE_PRIORITY);
    assert.strictEqual(lifecycleArgs.getMainWindow(), mainWindow);
    assert.strictEqual(lifecycleArgs.displayApi.getSessionCount(), 1);

    lifecycleArgs.displayApi.applyState("idle", "idle.svg");
    assert.deepStrictEqual(applyStateCalls, [["idle", "idle.svg"]]);
  });

  it("builds setupAppBootstrap payload and preserves lifecycle hooks", () => {
    let payload = null;
    let createWindowCalls = 0;
    let registerShortcutCalls = 0;
    let codexStateCalls = 0;

    const onCodexState = () => {
      codexStateCalls += 1;
    };

    setupMainLifecycle({
      setupAppBootstrapImpl: (args) => {
        payload = args;
      },
      core: {
        app: {},
        pathModule: require("path"),
        isMac: false,
        isLinux: false,
        loadPrefs: () => ({}),
        reapplyMacVisibility: () => {},
      },
      windows: {
        getMainWindow: () => null,
        getHitWindow: () => null,
        createWindow: () => {
          createWindowCalls += 1;
        },
        registerToggleShortcut: () => {
          registerShortcutCalls += 1;
        },
      },
      updater: {
        setupAutoUpdater: () => {},
      },
      runtime: {
        setPermDebugLog: () => {},
        setUpdateDebugLog: () => {},
        setIsQuitting: () => {},
        isQuitting: () => false,
      },
      lifecycle: {
        onBeforeQuit: () => {},
      },
      monitors: {
        isRiosDashboardMode: true,
        dashboardBridge: {},
        onCodexPermission: () => {},
        onCodexState,
        onGeminiState: () => {},
        setCodexMonitor: () => {},
        setGeminiMonitor: () => {},
        installTerminalFocusExtension: () => {},
        baseDir: "C:/tmp",
      },
    });

    assert.ok(payload);
    assert.strictEqual(typeof payload.createWindow, "function");
    payload.createWindow();
    assert.strictEqual(createWindowCalls, 1);
    assert.strictEqual(registerShortcutCalls, 1);
    payload.startAgentMonitorsArgs.onCodexState();
    assert.strictEqual(codexStateCalls, 1);
  });

  it("builds monitor hooks and before-quit handler with expected side effects", () => {
    const events = [];
    let codex = null;
    let gemini = null;
    const hitWindow = {
      isDestroyed: () => false,
      destroy: () => events.push("hit.destroy"),
    };
    const panel = {
      destroy: () => events.push("panel.destroy"),
    };

    const monitors = createAgentMonitorHooks({
      isRiosDashboardMode: true,
      dashboardBridge: { id: "dashboard" },
      updateSession: (...args) => events.push(["session", ...args]),
      showCodexNotifyBubble: (payload) => events.push(["notify", payload]),
      clearCodexNotifyBubbles: (sid) => events.push(["clear", sid]),
      setCodexMonitor: (monitor) => { codex = monitor; },
      setGeminiMonitor: (monitor) => { gemini = monitor; },
      installTerminalFocusExtension: () => {},
      baseDir: "C:/tmp",
    });

    monitors.onCodexPermission("s1", "PermissionRequest", {
      cwd: "C:/repo",
      permissionDetail: { command: "npm run build" },
    });
    monitors.onCodexState("s1", "working", "task_started", { cwd: "C:/repo" });
    monitors.onGeminiState("g1", "thinking", "user_message", { cwd: "C:/repo" });

    const quit = createBeforeQuitHandler({
      dashboardBridge: { stopMonitor: () => events.push("dashboard.stop") },
      savePrefs: () => events.push("prefs.save"),
      unregisterToggleShortcut: () => events.push("shortcut.unregister"),
      globalShortcut: { unregisterAll: () => events.push("shortcut.unregisterAll") },
      permissionController: { cleanup: () => events.push("perm.cleanup") },
      serverController: { cleanup: () => events.push("server.cleanup") },
      stateController: { cleanup: () => events.push("state.cleanup") },
      tickController: { cleanup: () => events.push("tick.cleanup") },
      miniController: { cleanup: () => events.push("mini.cleanup") },
      getCodexMonitor: () => ({ stop: () => events.push("codex.stop") }),
      getGeminiMonitor: () => ({ stop: () => events.push("gemini.stop") }),
      windowPolicy: { cleanup: () => events.push("window.cleanup") },
      focusController: { cleanup: () => events.push("focus.cleanup") },
      getHitWindow: () => hitWindow,
      quickTaskPanel: panel,
    });

    monitors.setCodexMonitor({ id: "c" });
    monitors.setGeminiMonitor({ id: "g" });
    assert.deepStrictEqual(codex, { id: "c" });
    assert.deepStrictEqual(gemini, { id: "g" });

    quit();

    assert.strictEqual(events.includes("dashboard.stop"), true);
    assert.strictEqual(events.includes("prefs.save"), true);
    assert.strictEqual(events.includes("codex.stop"), true);
    assert.strictEqual(events.includes("gemini.stop"), true);
    assert.strictEqual(events.includes("hit.destroy"), true);
    assert.strictEqual(events.includes("panel.destroy"), true);
  });
});

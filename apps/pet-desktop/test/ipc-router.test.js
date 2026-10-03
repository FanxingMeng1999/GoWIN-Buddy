const { describe, it } = require("node:test");
const assert = require("node:assert");
const { registerIpcRouter, chooseBestFocusSession } = require("../src/ipc-router");

class FakeIpcMain {
  constructor() {
    this.listeners = new Map();
    this.handlers = new Map();
  }

  on(channel, listener) {
    if (!this.listeners.has(channel)) this.listeners.set(channel, []);
    this.listeners.get(channel).push(listener);
  }

  handle(channel, handler) {
    this.handlers.set(channel, handler);
  }

  emit(channel, ...args) {
    const listeners = this.listeners.get(channel) || [];
    for (const listener of listeners) {
      listener({}, ...args);
    }
  }

  async invoke(channel, payload) {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`No handler for ${channel}`);
    return handler({}, payload);
  }
}

describe("ipc-router", () => {
  it("chooses the highest priority and most recent focus session", () => {
    const sessions = new Map([
      ["s1", { state: "thinking", sourcePid: 100, updatedAt: 1 }],
      ["s2", { state: "working", sourcePid: 101, updatedAt: 2 }],
      ["s3", { state: "working", sourcePid: 102, updatedAt: 5 }],
    ]);
    const best = chooseBestFocusSession(sessions, { idle: 0, thinking: 1, working: 3 });
    assert.strictEqual(best.sourcePid, 102);
  });

  it("registers handlers and routes window/quick-task/focus events", async () => {
    const ipcMain = new FakeIpcMain();
    const win = {
      bounds: { x: 100, y: 100, width: 200, height: 200 },
      isDestroyed: () => false,
      getBounds() { return { ...this.bounds }; },
      setBounds(next) { this.bounds = { ...this.bounds, ...next }; },
      showInactiveCalled: 0,
      showInactive() { this.showInactiveCalled += 1; },
      setSkipTaskbarCalled: 0,
      setSkipTaskbar() { this.setSkipTaskbarCalled += 1; },
    };
    const hitWin = {
      isDestroyed: () => false,
      showInactiveCalled: 0,
      showInactive() { this.showInactiveCalled += 1; },
      setSkipTaskbarCalled: 0,
      setSkipTaskbar() { this.setSkipTaskbarCalled += 1; },
    };

    let syncHitWindowCalls = 0;
    let repositionCalls = 0;
    let reapplyMacVisibilityCalls = 0;
    let focusCalls = [];
    let idlePaused = false;
    let dragLocked = false;
    let mouseOverPet = false;
    const sentRenderer = [];

    const quickTaskPanelCalls = { hover: 0, hoverPanel: 0, close: 0 };
    const quickTaskPanel = {
      setPetHover: () => { quickTaskPanelCalls.hover += 1; },
      setPanelHover: () => { quickTaskPanelCalls.hoverPanel += 1; },
      closePanel: () => { quickTaskPanelCalls.close += 1; },
    };

    const dashboardBridge = {
      openDashboardCalls: 0,
      openDashboard() { this.openDashboardCalls += 1; },
      getQuickTaskPayload: () => ({ ok: true }),
      setQuickTaskQuest: (payload) => ({ type: "quest", payload }),
      setQuickTaskTodo: (payload) => ({ type: "todo", payload }),
      addQuickTaskTodo: (payload) => ({ type: "add", payload }),
    };

    const sessions = new Map([
      ["a", { state: "thinking", sourcePid: 10, updatedAt: 1, cwd: "A" }],
      ["b", { state: "working", sourcePid: 20, updatedAt: 2, cwd: "B", editor: "cursor", pidChain: [20] }],
    ]);

    registerIpcRouter({
      ipcMain,
      Menu: { buildFromTemplate: (items) => ({ items }) },
      showPetContextMenu: () => {},
      miniApi: {
        getMiniMode: () => false,
        getMiniTransitioning: () => false,
        checkMiniModeSnap: () => {},
        exitMiniMode: () => {},
      },
      windowApi: {
        getMainWindow: () => win,
        getHitWindow: () => hitWin,
        getCurrentPixelSize: () => ({ width: 200, height: 200 }),
        looseClampToDisplays: () => ({ x: 130, y: 150 }),
        clampToScreen: () => ({ x: 140, y: 160 }),
        syncHitWindow: () => { syncHitWindowCalls += 1; },
      },
      quickTaskPanel,
      dashboardBridge,
      rendererApi: {
        sendToRenderer: (...args) => sentRenderer.push(args),
      },
      runtimeState: {
        setIdlePaused: (next) => { idlePaused = next; },
        setDragLocked: (next) => { dragLocked = next; },
        setMouseOverPet: (next) => { mouseOverPet = next; },
      },
      displayApi: {
        getCurrentState: () => "idle",
        getCurrentSvg: () => "clawd-idle-follow.svg",
      },
      sessions,
      statePriority: { idle: 0, thinking: 1, working: 3 },
      focusTerminalWindow: (...args) => { focusCalls.push(args); },
      popupMenuAt: () => {},
      buildSessionSubmenu: () => [{ label: "x" }],
      permissionApi: {
        handleBubbleHeight: () => {},
        handleDecide: () => {},
      },
      isRiosDashboardMode: false,
      isLinux: false,
      reapplyMacVisibility: () => { reapplyMacVisibilityCalls += 1; },
      bubbleApi: {
        shouldFollowPet: () => true,
        hasPending: () => true,
        reposition: () => { repositionCalls += 1; },
      },
    });

    ipcMain.emit("move-window-by", 3, 4);
    assert.strictEqual(win.bounds.x, 130);
    assert.strictEqual(win.bounds.y, 150);
    assert.strictEqual(syncHitWindowCalls, 1);
    assert.strictEqual(repositionCalls, 1);

    ipcMain.emit("pause-cursor-polling");
    assert.strictEqual(idlePaused, true);
    ipcMain.emit("resume-from-reaction");
    assert.strictEqual(idlePaused, false);
    assert.strictEqual(sentRenderer.length > 0, true);

    ipcMain.emit("drag-lock", true);
    assert.strictEqual(dragLocked, true);
    assert.strictEqual(mouseOverPet, true);

    ipcMain.emit("quick-task:hover", true);
    ipcMain.emit("quick-task:hover-panel", true);
    ipcMain.emit("quick-task:close");
    assert.deepStrictEqual(quickTaskPanelCalls, { hover: 1, hoverPanel: 1, close: 1 });

    const added = await ipcMain.invoke("quick-task:add-todo", { text: "t1" });
    assert.strictEqual(added.type, "add");
    assert.strictEqual(added.payload.text, "t1");

    ipcMain.emit("open-dashboard");
    assert.strictEqual(dashboardBridge.openDashboardCalls, 1);
    assert.strictEqual(reapplyMacVisibilityCalls, 1);

    ipcMain.emit("focus-terminal");
    assert.strictEqual(focusCalls.length, 1);
    assert.strictEqual(focusCalls[0][0], 20);
  });

  it("routes focus-terminal to dashboard in dashboard mode", () => {
    const ipcMain = new FakeIpcMain();
    let dashboardOpenCalls = 0;
    let focusCalls = 0;

    registerIpcRouter({
      ipcMain,
      Menu: { buildFromTemplate: (items) => ({ items }) },
      showPetContextMenu: () => {},
      miniApi: {
        getMiniMode: () => false,
        getMiniTransitioning: () => false,
        checkMiniModeSnap: () => {},
        exitMiniMode: () => {},
      },
      windowApi: {
        getMainWindow: () => null,
        getHitWindow: () => null,
        getCurrentPixelSize: () => ({ width: 200, height: 200 }),
        looseClampToDisplays: () => ({ x: 0, y: 0 }),
        clampToScreen: () => ({ x: 0, y: 0 }),
        syncHitWindow: () => {},
      },
      quickTaskPanel: {
        setPetHover: () => {},
        setPanelHover: () => {},
        show: () => {},
        closePanel: () => {},
      },
      dashboardBridge: {
        openDashboard: () => { dashboardOpenCalls += 1; },
        getQuickTaskPayload: () => ({}),
        setQuickTaskQuest: () => ({}),
        setQuickTaskTodo: () => ({}),
        addQuickTaskTodo: () => ({}),
      },
      rendererApi: {
        sendToRenderer: () => {},
      },
      runtimeState: {
        setIdlePaused: () => {},
        setDragLocked: () => {},
        setMouseOverPet: () => {},
      },
      displayApi: {
        getCurrentState: () => "idle",
        getCurrentSvg: () => "clawd-idle-follow.svg",
      },
      sessions: new Map([
        ["s1", { state: "working", sourcePid: 123, updatedAt: Date.now() }],
      ]),
      statePriority: { idle: 0, working: 3 },
      focusTerminalWindow: () => { focusCalls += 1; },
      popupMenuAt: () => {},
      buildSessionSubmenu: () => [],
      permissionApi: {
        handleBubbleHeight: () => {},
        handleDecide: () => {},
      },
      isRiosDashboardMode: true,
      isLinux: false,
      reapplyMacVisibility: () => {},
      bubbleApi: {
        shouldFollowPet: () => false,
        hasPending: () => false,
        reposition: () => {},
      },
    });

    ipcMain.emit("focus-terminal");
    assert.strictEqual(dashboardOpenCalls, 1);
    assert.strictEqual(focusCalls, 0);
  });
});

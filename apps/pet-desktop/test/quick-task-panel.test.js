const { describe, it } = require("node:test");
const assert = require("node:assert");
const { computeQuickTaskBounds, buildRoundedRectShape, createQuickTaskPanelController } = require("../src/quick-task-panel");

class FakeWebContents {
  constructor() {
    this._handlers = new Map();
    this.sent = [];
  }

  on(event, handler) {
    this._handlers.set(event, handler);
  }

  emit(event, ...args) {
    const handler = this._handlers.get(event);
    if (handler) handler(...args);
  }

  send(channel, payload) {
    this.sent.push({ channel, payload });
  }
}

class FakeBrowserWindow {
  static instances = [];

  constructor(opts) {
    this.opts = opts;
    this._handlers = new Map();
    this.webContents = new FakeWebContents();
    this.bounds = { x: 0, y: 0, width: opts.width, height: opts.height };
    this.visible = false;
    this.destroyed = false;
    this.loadedFile = null;
    this.topMostCalls = [];
    this.shapes = [];
    FakeBrowserWindow.instances.push(this);
  }

  on(event, handler) {
    this._handlers.set(event, handler);
  }

  emit(event, ...args) {
    const handler = this._handlers.get(event);
    if (handler) handler(...args);
  }

  isDestroyed() {
    return this.destroyed;
  }

  destroy() {
    this.destroyed = true;
    this.visible = false;
  }

  showInactive() {
    this.visible = true;
  }

  hide() {
    this.visible = false;
  }

  isVisible() {
    return this.visible;
  }

  loadFile(filePath) {
    this.loadedFile = filePath;
  }

  getBounds() {
    return { ...this.bounds };
  }

  setBounds(next) {
    this.bounds = { ...this.bounds, ...next };
  }

  setAlwaysOnTop(isTopMost, level) {
    this.topMostCalls.push({ isTopMost, level });
  }

  setShape(shape) {
    this.shapes.push(shape);
  }

  setSkipTaskbar() {}
}

function resetFakes() {
  FakeBrowserWindow.instances.length = 0;
}

describe("quick-task-panel", () => {
  it("builds rounded-rectangle window shape", () => {
    const shape = buildRoundedRectShape(120, 80, 16);
    assert.ok(Array.isArray(shape));
    assert.ok(shape.length > 1);
    assert.ok(shape.every((rect) => rect.width > 0 && rect.height > 0));
    assert.ok(shape[0].x > 0);
    assert.ok(shape[0].width < 120);
  });

  it("computes panel bounds and keeps it inside work area", () => {
    const bounds = computeQuickTaskBounds({
      petBounds: { x: 1000, y: 900, width: 200, height: 200 },
      popupBounds: { width: 372, height: 486 },
      workArea: { x: 0, y: 0, width: 1280, height: 960 },
    });

    assert.strictEqual(bounds.width, 372);
    assert.strictEqual(bounds.height, 486);
    assert.ok(bounds.x >= 8);
    assert.ok(bounds.x + bounds.width <= 1272);
    assert.ok(bounds.y >= 8);
    assert.ok(bounds.y + bounds.height <= 952);
  });

  it("creates, positions, and refreshes panel data only when visible", () => {
    resetFakes();
    let macVisibilityApplied = 0;
    const petWin = {
      isDestroyed: () => false,
      getBounds: () => ({ x: 700, y: 300, width: 220, height: 220 }),
    };
    let payloadVersion = 0;
    const panel = createQuickTaskPanelController({
      enabled: true,
      BrowserWindow: FakeBrowserWindow,
      screen: {
        getDisplayNearestPoint: () => ({
          workArea: { x: 0, y: 0, width: 1600, height: 900 },
        }),
      },
      isLinux: false,
      isMac: false,
      isWin: true,
      linuxWindowType: "toolbar",
      winTopmostLevel: "pop-up-menu",
      preloadPath: "preload.js",
      htmlPath: "quick-tasks.html",
      isQuitting: () => false,
      isPetHidden: () => false,
      getPetWindow: () => petWin,
      getQuickTaskPayload: () => ({ version: ++payloadVersion }),
      getQuickTaskTheme: () => ({ variant: "paper", chipText: "#d97706" }),
      reapplyMacVisibility: () => { macVisibilityApplied += 1; },
      guardAlwaysOnTop: () => {},
    });

    panel.show({ pinned: true, immediate: true });
    assert.strictEqual(FakeBrowserWindow.instances.length, 1);
    const win = FakeBrowserWindow.instances[0];
    assert.strictEqual(win.loadedFile, "quick-tasks.html");
    assert.strictEqual(win.isVisible(), true);
    assert.ok(macVisibilityApplied >= 1);
    assert.strictEqual(win.opts.backgroundColor, "#00000000");
    assert.ok(win.shapes.length >= 1);

    const sentAfterShow = win.webContents.sent.length;
    assert.ok(sentAfterShow >= 1);
    assert.strictEqual(win.webContents.sent[sentAfterShow - 1].channel, "quick-task:data");
    assert.strictEqual(win.webContents.sent[sentAfterShow - 1].payload.theme.variant, "paper");

    panel.refreshDataIfVisible();
    assert.strictEqual(win.webContents.sent.length, sentAfterShow + 1);

    panel.hide(true);
    panel.refreshDataIfVisible();
    assert.strictEqual(win.webContents.sent.length, sentAfterShow + 1);

    panel.destroy();
    assert.strictEqual(win.isDestroyed(), true);
  });

  it("does not show panel at default center before anchor window is ready", async () => {
    resetFakes();
    let petWin = null;

    const panel = createQuickTaskPanelController({
      enabled: true,
      BrowserWindow: FakeBrowserWindow,
      screen: {
        getDisplayNearestPoint: () => ({
          workArea: { x: 0, y: 0, width: 1600, height: 900 },
        }),
      },
      isLinux: false,
      isMac: false,
      isWin: true,
      linuxWindowType: "toolbar",
      winTopmostLevel: "pop-up-menu",
      preloadPath: "preload.js",
      htmlPath: "quick-tasks.html",
      isQuitting: () => false,
      isPetHidden: () => false,
      getPetWindow: () => petWin,
      getQuickTaskPayload: () => ({ ok: true }),
      getQuickTaskTheme: () => ({ variant: "aurora" }),
      reapplyMacVisibility: () => {},
      guardAlwaysOnTop: () => {},
    });

    panel.show({ pinned: true, immediate: true });
    assert.strictEqual(FakeBrowserWindow.instances.length, 1);
    const win = FakeBrowserWindow.instances[0];
    assert.strictEqual(win.isVisible(), false);

    petWin = {
      isDestroyed: () => false,
      getBounds: () => ({ x: 920, y: 440, width: 160, height: 160 }),
    };

    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.strictEqual(win.isVisible(), true);
    assert.ok(win.getBounds().x > 0);

    panel.destroy();
  });

  it("hides stale-hover panel when cursor is already outside", () => {
    resetFakes();
    let cursorPoint = { x: -120, y: -120 };
    const panel = createQuickTaskPanelController({
      enabled: true,
      BrowserWindow: FakeBrowserWindow,
      screen: {
        getDisplayNearestPoint: () => ({
          workArea: { x: 0, y: 0, width: 1600, height: 900 },
        }),
        getCursorScreenPoint: () => cursorPoint,
      },
      isLinux: false,
      isMac: false,
      isWin: true,
      linuxWindowType: "toolbar",
      winTopmostLevel: "pop-up-menu",
      preloadPath: "preload.js",
      htmlPath: "quick-tasks.html",
      isQuitting: () => false,
      isPetHidden: () => false,
      getPetWindow: () => ({
        isDestroyed: () => false,
        getBounds: () => ({ x: 420, y: 260, width: 180, height: 180 }),
      }),
      getQuickTaskPayload: () => ({ ok: true }),
      getQuickTaskTheme: () => ({ variant: "cocoa" }),
      reapplyMacVisibility: () => {},
      guardAlwaysOnTop: () => {},
    });

    panel.show({ immediate: true });
    const win = FakeBrowserWindow.instances[0];
    assert.strictEqual(win.isVisible(), true);
    panel.setPanelHover(true);
    panel.hide(false);
    assert.strictEqual(win.isVisible(), false);
    panel.destroy();
  });

  it("keeps panel visible when cursor is inside even if hover flag is missing", () => {
    resetFakes();
    const panel = createQuickTaskPanelController({
      enabled: true,
      BrowserWindow: FakeBrowserWindow,
      screen: {
        getDisplayNearestPoint: () => ({
          workArea: { x: 0, y: 0, width: 1600, height: 900 },
        }),
        getCursorScreenPoint: () => {
          const win = FakeBrowserWindow.instances[0];
          const bounds = win ? win.getBounds() : { x: 0, y: 0, width: 10, height: 10 };
          return {
            x: bounds.x + Math.floor(bounds.width / 2),
            y: bounds.y + Math.floor(bounds.height / 2),
          };
        },
      },
      isLinux: false,
      isMac: false,
      isWin: true,
      linuxWindowType: "toolbar",
      winTopmostLevel: "pop-up-menu",
      preloadPath: "preload.js",
      htmlPath: "quick-tasks.html",
      isQuitting: () => false,
      isPetHidden: () => false,
      getPetWindow: () => ({
        isDestroyed: () => false,
        getBounds: () => ({ x: 520, y: 260, width: 180, height: 180 }),
      }),
      getQuickTaskPayload: () => ({ ok: true }),
      reapplyMacVisibility: () => {},
      guardAlwaysOnTop: () => {},
    });

    panel.show({ immediate: true });
    const win = FakeBrowserWindow.instances[0];
    assert.strictEqual(win.isVisible(), true);
    panel.setPanelHover(false);
    panel.hide(false);
    assert.strictEqual(win.isVisible(), true);
    panel.destroy();
  });

  it("shows only while the cursor is over the pet or panel", async () => {
    resetFakes();
    let cursorPoint = { x: -200, y: -200 };
    const panel = createQuickTaskPanelController({
      enabled: true,
      BrowserWindow: FakeBrowserWindow,
      screen: {
        getDisplayNearestPoint: () => ({
          workArea: { x: 0, y: 0, width: 1600, height: 900 },
        }),
        getCursorScreenPoint: () => cursorPoint,
      },
      isLinux: false,
      isMac: false,
      isWin: true,
      linuxWindowType: "toolbar",
      winTopmostLevel: "pop-up-menu",
      preloadPath: "preload.js",
      htmlPath: "quick-tasks.html",
      isQuitting: () => false,
      isPetHidden: () => false,
      getPetWindow: () => ({
        isDestroyed: () => false,
        getBounds: () => ({ x: 520, y: 260, width: 180, height: 180 }),
      }),
      getQuickTaskPayload: () => ({ ok: true }),
      reapplyMacVisibility: () => {},
      guardAlwaysOnTop: () => {},
    });

    panel.setPetHover(true);
    await new Promise((resolve) => setTimeout(resolve, 260));

    const win = FakeBrowserWindow.instances[0];
    assert.strictEqual(win.isVisible(), true);

    const bounds = win.getBounds();
    cursorPoint = {
      x: bounds.x + Math.floor(bounds.width / 2),
      y: bounds.y + Math.floor(bounds.height / 2),
    };
    panel.setPanelHover(true);
    panel.setPetHover(false);
    await new Promise((resolve) => setTimeout(resolve, 280));
    assert.strictEqual(win.isVisible(), true);

    cursorPoint = { x: bounds.x - 30, y: bounds.y - 30 };
    panel.setPanelHover(false);
    await new Promise((resolve) => setTimeout(resolve, 280));
    assert.strictEqual(win.isVisible(), false);

    panel.destroy();
  });
});

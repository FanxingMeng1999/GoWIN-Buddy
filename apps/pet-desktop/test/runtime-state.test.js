const { describe, it } = require("node:test");
const assert = require("node:assert");
const { normalizePrefs, createRuntimeStateStore } = require("../src/runtime-state");

class MemoryFs {
  constructor(initial = {}) {
    this.files = new Map(Object.entries(initial));
  }

  mkdirSync() {}

  renameSync(source, target) {
    if (!this.files.has(source)) throw new Error("ENOENT");
    this.files.set(target, this.files.get(source));
    this.files.delete(source);
  }

  unlinkSync(filePath) { this.files.delete(filePath); }

  existsSync(filePath) {
    return this.files.has(filePath);
  }

  readFileSync(filePath) {
    if (!this.files.has(filePath)) throw new Error("ENOENT");
    return this.files.get(filePath);
  }

  writeFileSync(filePath, value) {
    this.files.set(filePath, String(value));
  }
}

function createFakeThemeLoader() {
  return {
    initCalls: [],
    loaded: null,
    init(baseDir, userData) {
      this.initCalls.push({ baseDir, userData });
    },
    loadTheme(themeId) {
      this.loaded = themeId;
      return {
        _id: themeId,
        miniMode: { supported: themeId !== "no-mini" },
      };
    },
    getRendererConfig() {
      return { renderer: true };
    },
    getHitRendererConfig() {
      return { hit: true };
    },
  };
}

function createFakeWindow() {
  const onceHandlers = new Map();
  return {
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    webContents: {
      reloadCalls: 0,
      sent: [],
      reload() {
        this.reloadCalls += 1;
      },
      once(event, handler) {
        onceHandlers.set(event, handler);
      },
      send(channel, payload) {
        this.sent.push({ channel, payload });
      },
      trigger(event) {
        const handler = onceHandlers.get(event);
        if (handler) handler();
      },
    },
  };
}

describe("runtime-state", () => {
  it("normalizes prefs numeric fields and miniEdge", () => {
    const prefs = normalizePrefs({
      miniEdge: "bad",
      x: "1",
      y: NaN,
      preMiniX: Infinity,
      preMiniY: 11,
    });
    assert.strictEqual(prefs.miniEdge, "right");
    assert.strictEqual(prefs.x, 0);
    assert.strictEqual(prefs.y, 0);
    assert.strictEqual(prefs.preMiniX, 0);
    assert.strictEqual(prefs.preMiniY, 11);
  });

  it("loads legacy prefs and migrates to gowin path", () => {
    const userData = "C:\\tmp\\ud";
    const prefsPath = `${userData}\\gowin-prefs.json`;
    const legacyPath = `${userData}\\clawd-prefs.json`;
    const fsImpl = new MemoryFs({
      [legacyPath]: JSON.stringify({ miniEdge: "left", x: 1, y: 2 }),
    });
    const themeLoader = createFakeThemeLoader();
    const store = createRuntimeStateStore({
      app: { getPath: () => userData },
      baseDir: "C:\\workspace\\src",
      themeLoader,
      fsImpl,
      pathImpl: require("path"),
    });

    const prefs = store.loadPrefs();
    assert.strictEqual(prefs.x, 1);
    assert.strictEqual(fsImpl.existsSync(prefsPath), true);
  });

  it("saves prefs snapshot and switches theme with lifecycle callbacks", () => {
    const userData = "C:\\tmp\\ud";
    const themeLoader = createFakeThemeLoader();
    const store = createRuntimeStateStore({
      app: { getPath: () => userData },
      baseDir: "C:\\workspace\\src",
      themeLoader,
      fsImpl: new MemoryFs(),
      pathImpl: require("path"),
    });

    const saveOk = store.savePrefs({ x: 1, y: 2 });
    assert.strictEqual(saveOk, true);

    const mainWindow = createFakeWindow();
    const hitWindow = createFakeWindow();
    let activeTheme = { _id: "clawd" };
    let stateCleanup = 0;
    let tickCleanup = 0;
    let miniCleanup = 0;
    let startMainTick = 0;
    let exitMiniMode = 0;
    let persistCalls = 0;
    let rebuildCalls = 0;
    const sentToRenderer = [];
    let syncHitWindow = 0;

    const changed = store.switchTheme({
      themeId: "gowin",
      getActiveTheme: () => activeTheme,
      setActiveTheme: (next) => { activeTheme = next; },
      getMainWindow: () => mainWindow,
      getHitWindow: () => hitWindow,
      modulesApi: {
        stateCleanup: () => { stateCleanup += 1; },
        tickCleanup: () => { tickCleanup += 1; },
        miniCleanup: () => { miniCleanup += 1; },
        startMainTick: () => { startMainTick += 1; },
      },
      miniApi: {
        getMiniMode: () => true,
        exitMiniMode: () => { exitMiniMode += 1; },
      },
      displayApi: {
        resolveDisplayState: () => "working",
        getSvgOverride: () => "clawd-working-typing.svg",
      },
      rendererApi: {
        sendToRenderer: (...args) => sentToRenderer.push(args),
        syncHitWindow: () => { syncHitWindow += 1; },
      },
      persistPrefs: () => { persistCalls += 1; },
      rebuildMenus: () => { rebuildCalls += 1; },
    });

    assert.strictEqual(changed, true);
    assert.strictEqual(themeLoader.loaded, "gowin");
    assert.strictEqual(stateCleanup, 1);
    assert.strictEqual(tickCleanup, 1);
    assert.strictEqual(miniCleanup, 1);
    assert.strictEqual(exitMiniMode, 0);
    assert.strictEqual(mainWindow.webContents.reloadCalls, 1);
    assert.strictEqual(hitWindow.webContents.reloadCalls, 1);

    mainWindow.webContents.trigger("did-finish-load");
    hitWindow.webContents.trigger("did-finish-load");
    assert.strictEqual(sentToRenderer.length, 1);
    assert.strictEqual(syncHitWindow, 1);
    assert.strictEqual(startMainTick, 1);
    assert.strictEqual(persistCalls, 1);
    assert.strictEqual(rebuildCalls, 1);
  });
});

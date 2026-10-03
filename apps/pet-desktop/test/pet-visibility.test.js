const { describe, it } = require("node:test");
const assert = require("node:assert");
const { createPetVisibilityController, DEFAULT_TOGGLE_SHORTCUT } = require("../src/pet-visibility");

class FakeWindow {
  constructor() {
    this.destroyed = false;
    this.hideCalls = 0;
    this.showInactiveCalls = 0;
    this.skipTaskbarCalls = 0;
  }

  isDestroyed() {
    return this.destroyed;
  }

  hide() {
    this.hideCalls += 1;
  }

  showInactive() {
    this.showInactiveCalls += 1;
  }

  setSkipTaskbar() {
    this.skipTaskbarCalls += 1;
  }
}

describe("pet-visibility", () => {
  it("hides pet windows and permission bubbles when toggled from visible state", () => {
    let petHidden = false;
    let syncCalls = 0;
    let menuCalls = 0;
    const mainWindow = new FakeWindow();
    const hitWindow = new FakeWindow();
    const panelWindow = new FakeWindow();
    const bubbleWindow = new FakeWindow();

    const controller = createPetVisibilityController({
      isLinux: false,
      globalShortcut: {},
      getMainWindow: () => mainWindow,
      getHitWindow: () => hitWindow,
      getQuickTaskWindow: () => panelWindow,
      getPendingPermissions: () => [{ bubble: bubbleWindow }],
      isMiniTransitioning: () => false,
      reapplyMacVisibility: () => {},
      syncPermissionShortcuts: () => { syncCalls += 1; },
      rebuildMenus: () => { menuCalls += 1; },
      getPetHidden: () => petHidden,
      setPetHidden: (next) => { petHidden = next; },
    });

    controller.togglePetVisibility();

    assert.strictEqual(petHidden, true);
    assert.strictEqual(mainWindow.hideCalls, 1);
    assert.strictEqual(hitWindow.hideCalls, 1);
    assert.strictEqual(panelWindow.hideCalls, 1);
    assert.strictEqual(bubbleWindow.hideCalls, 1);
    assert.strictEqual(syncCalls, 1);
    assert.strictEqual(menuCalls, 1);
  });

  it("shows pet windows, re-applies visibility, and restores skip-taskbar on linux", () => {
    let petHidden = true;
    let reapplyCalls = 0;
    const mainWindow = new FakeWindow();
    const hitWindow = new FakeWindow();
    const bubbleWindow = new FakeWindow();

    const controller = createPetVisibilityController({
      isLinux: true,
      globalShortcut: {},
      getMainWindow: () => mainWindow,
      getHitWindow: () => hitWindow,
      getQuickTaskWindow: () => null,
      getPendingPermissions: () => [{ bubble: bubbleWindow }],
      isMiniTransitioning: () => false,
      reapplyMacVisibility: () => { reapplyCalls += 1; },
      syncPermissionShortcuts: () => {},
      rebuildMenus: () => {},
      getPetHidden: () => petHidden,
      setPetHidden: (next) => { petHidden = next; },
    });

    controller.togglePetVisibility();

    assert.strictEqual(petHidden, false);
    assert.strictEqual(mainWindow.showInactiveCalls, 1);
    assert.strictEqual(hitWindow.showInactiveCalls, 1);
    assert.strictEqual(bubbleWindow.showInactiveCalls, 1);
    assert.strictEqual(mainWindow.skipTaskbarCalls, 1);
    assert.strictEqual(hitWindow.skipTaskbarCalls, 1);
    assert.strictEqual(bubbleWindow.skipTaskbarCalls, 1);
    assert.strictEqual(reapplyCalls, 1);
  });

  it("is a no-op while mini transition is running", () => {
    let petHidden = false;
    let menuCalls = 0;
    const mainWindow = new FakeWindow();
    const controller = createPetVisibilityController({
      isLinux: false,
      globalShortcut: {},
      getMainWindow: () => mainWindow,
      getHitWindow: () => null,
      getQuickTaskWindow: () => null,
      getPendingPermissions: () => [],
      isMiniTransitioning: () => true,
      reapplyMacVisibility: () => {},
      syncPermissionShortcuts: () => {},
      rebuildMenus: () => { menuCalls += 1; },
      getPetHidden: () => petHidden,
      setPetHidden: (next) => { petHidden = next; },
    });

    controller.togglePetVisibility();

    assert.strictEqual(petHidden, false);
    assert.strictEqual(mainWindow.hideCalls, 0);
    assert.strictEqual(menuCalls, 0);
  });

  it("registers and unregisters global shortcut with default accelerator", () => {
    const calls = [];
    const controller = createPetVisibilityController({
      isLinux: false,
      globalShortcut: {
        register: (shortcut, handler) => { calls.push(["register", shortcut, typeof handler]); },
        unregister: (shortcut) => { calls.push(["unregister", shortcut]); },
      },
      getMainWindow: () => null,
      getHitWindow: () => null,
      getQuickTaskWindow: () => null,
      getPendingPermissions: () => [],
      isMiniTransitioning: () => false,
      reapplyMacVisibility: () => {},
      syncPermissionShortcuts: () => {},
      rebuildMenus: () => {},
      getPetHidden: () => false,
      setPetHidden: () => {},
    });

    controller.registerToggleShortcut();
    controller.unregisterToggleShortcut();

    assert.deepStrictEqual(calls, [
      ["register", DEFAULT_TOGGLE_SHORTCUT, "function"],
      ["unregister", DEFAULT_TOGGLE_SHORTCUT],
    ]);
  });

  it("fails closed when shortcut registration throws", () => {
    const controller = createPetVisibilityController({
      isLinux: false,
      globalShortcut: {
        register: () => {
          throw new Error("register failed");
        },
        unregister: () => {},
      },
      getMainWindow: () => null,
      getHitWindow: () => null,
      getQuickTaskWindow: () => null,
      getPendingPermissions: () => [],
      isMiniTransitioning: () => false,
      reapplyMacVisibility: () => {},
      syncPermissionShortcuts: () => {},
      rebuildMenus: () => {},
      getPetHidden: () => false,
      setPetHidden: () => {},
    });

    const originalWarn = console.warn;
    let warnCalls = 0;
    console.warn = () => {
      warnCalls += 1;
    };
    try {
      assert.doesNotThrow(() => controller.registerToggleShortcut());
      assert.strictEqual(warnCalls, 1);
    } finally {
      console.warn = originalWarn;
    }
  });
});

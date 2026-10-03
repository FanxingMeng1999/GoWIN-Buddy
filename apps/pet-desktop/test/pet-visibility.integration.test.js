const { describe, it } = require("node:test");
const assert = require("node:assert");
const { createPetVisibilityController } = require("../src/pet-visibility");

class FakeWindow {
  constructor() {
    this.destroyed = false;
    this.hideCalls = 0;
    this.showInactiveCalls = 0;
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

  setSkipTaskbar() {}
}

describe("pet visibility integration chain", () => {
  it("covers menu hide + shortcut show + permission bubble restore", () => {
    let petHidden = false;
    let shortcutHandler = null;
    let reapplyCalls = 0;
    let syncCalls = 0;
    let menuCalls = 0;

    const mainWindow = new FakeWindow();
    const hitWindow = new FakeWindow();
    const panelWindow = new FakeWindow();
    const bubbleWindow = new FakeWindow();

    const controller = createPetVisibilityController({
      isLinux: false,
      globalShortcut: {
        register: (_shortcut, handler) => {
          shortcutHandler = handler;
        },
        unregister: () => {},
      },
      getMainWindow: () => mainWindow,
      getHitWindow: () => hitWindow,
      getQuickTaskWindow: () => panelWindow,
      getPendingPermissions: () => [{ bubble: bubbleWindow }],
      isMiniTransitioning: () => false,
      reapplyMacVisibility: () => {
        reapplyCalls += 1;
      },
      syncPermissionShortcuts: () => {
        syncCalls += 1;
      },
      rebuildMenus: () => {
        menuCalls += 1;
      },
      getPetHidden: () => petHidden,
      setPetHidden: (next) => {
        petHidden = next;
      },
    });

    // menu click -> hide
    const menuToggle = () => controller.togglePetVisibility();
    menuToggle();
    assert.strictEqual(petHidden, true);
    assert.strictEqual(mainWindow.hideCalls, 1);
    assert.strictEqual(hitWindow.hideCalls, 1);
    assert.strictEqual(panelWindow.hideCalls, 1);
    assert.strictEqual(bubbleWindow.hideCalls, 1);

    // shortcut -> show and restore bubbles
    controller.registerToggleShortcut();
    assert.strictEqual(typeof shortcutHandler, "function");
    shortcutHandler();

    assert.strictEqual(petHidden, false);
    assert.strictEqual(mainWindow.showInactiveCalls, 1);
    assert.strictEqual(hitWindow.showInactiveCalls, 1);
    assert.strictEqual(bubbleWindow.showInactiveCalls, 1);
    assert.strictEqual(reapplyCalls, 1);
    assert.strictEqual(syncCalls, 2);
    assert.strictEqual(menuCalls, 2);
  });
});

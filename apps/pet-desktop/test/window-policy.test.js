const { describe, it } = require("node:test");
const assert = require("node:assert");
const EventEmitter = require("node:events");
const { createWindowPolicyManager } = require("../src/window-policy");

class FakeWindow extends EventEmitter {
  constructor({ x = 0, y = 0, visible = true } = {}) {
    super();
    this.destroyed = false;
    this.visible = visible;
    this.bounds = { x, y, width: 100, height: 100 };
    this.alwaysOnTopCalls = [];
    this.visibleWorkspaceCalls = [];
    this.positions = [];
  }

  isDestroyed() {
    return this.destroyed;
  }

  isVisible() {
    return this.visible;
  }

  setAlwaysOnTop(flag, level) {
    this.alwaysOnTopCalls.push({ flag, level });
  }

  setVisibleOnAllWorkspaces(flag, opts) {
    this.visibleWorkspaceCalls.push({ flag, opts });
  }

  getBounds() {
    return { ...this.bounds };
  }

  setPosition(x, y) {
    this.positions.push({ x, y });
    this.bounds.x = x;
    this.bounds.y = y;
  }
}

describe("window-policy", () => {
  it("reapplyMacVisibility applies fallback workspace visibility when native call fails", () => {
    const mainWindow = new FakeWindow();
    const hitWindow = new FakeWindow();
    const quickTaskWindow = new FakeWindow();
    const bubble = new FakeWindow();
    const contextOwner = new FakeWindow();
    let nativeCalls = 0;

    const manager = createWindowPolicyManager({
      isMac: true,
      isWin: false,
      applyStationaryCollectionBehavior: () => {
        nativeCalls += 1;
        return false;
      },
      showDock: () => false,
      getMainWindow: () => mainWindow,
      getHitWindow: () => hitWindow,
      getQuickTaskWindow: () => quickTaskWindow,
      getContextMenuOwner: () => contextOwner,
      getPermissionBubbles: () => [bubble],
      getDragLocked: () => false,
      getMiniAnimating: () => false,
      onForceEyeResend: () => {},
      syncHitWindow: () => {},
    });

    manager.reapplyMacVisibility();

    for (const target of [mainWindow, hitWindow, quickTaskWindow, bubble, contextOwner]) {
      assert.strictEqual(target.alwaysOnTopCalls.length >= 1, true);
      assert.strictEqual(target.visibleWorkspaceCalls.length >= 1, true);
      assert.strictEqual(target.visibleWorkspaceCalls[0].opts.skipTransformProcessType, true);
    }
    assert.strictEqual(nativeCalls >= 10, true);
  });

  it("guardAlwaysOnTop restores main window top-most and schedules hwnd recovery", async () => {
    const mainWindow = new FakeWindow({ x: 12, y: 20 });
    const hitWindow = new FakeWindow();
    let forceEyeResendCalls = 0;
    let syncCalls = 0;

    const manager = createWindowPolicyManager({
      isMac: false,
      isWin: true,
      applyStationaryCollectionBehavior: () => true,
      showDock: () => true,
      getMainWindow: () => mainWindow,
      getHitWindow: () => hitWindow,
      getQuickTaskWindow: () => null,
      getContextMenuOwner: () => null,
      getPermissionBubbles: () => [],
      getDragLocked: () => false,
      getMiniAnimating: () => false,
      onForceEyeResend: () => { forceEyeResendCalls += 1; },
      syncHitWindow: () => { syncCalls += 1; },
    });

    manager.guardAlwaysOnTop(mainWindow);
    mainWindow.emit("always-on-top-changed", {}, false);

    assert.strictEqual(mainWindow.alwaysOnTopCalls.length >= 1, true);
    assert.strictEqual(mainWindow.positions.length, 2);
    assert.strictEqual(syncCalls, 1);
    assert.strictEqual(forceEyeResendCalls, 1);

    await new Promise((resolve) => setTimeout(resolve, 1050));
    assert.strictEqual(forceEyeResendCalls >= 2, true);
    assert.strictEqual(hitWindow.alwaysOnTopCalls.length >= 1, true);
    manager.cleanup();
  });

  it("topmost watchdog keeps visible windows top-most and stops on cleanup", async () => {
    const mainWindow = new FakeWindow();
    const hitWindow = new FakeWindow();
    const quickTaskWindow = new FakeWindow({ visible: true });
    const bubbleWindow = new FakeWindow({ visible: true });

    const manager = createWindowPolicyManager({
      isMac: false,
      isWin: true,
      applyStationaryCollectionBehavior: () => true,
      showDock: () => true,
      getMainWindow: () => mainWindow,
      getHitWindow: () => hitWindow,
      getQuickTaskWindow: () => quickTaskWindow,
      getContextMenuOwner: () => null,
      getPermissionBubbles: () => [bubbleWindow],
      getDragLocked: () => false,
      getMiniAnimating: () => false,
      onForceEyeResend: () => {},
      syncHitWindow: () => {},
      topmostWatchdogMs: 20,
    });

    manager.startTopmostWatchdog();
    await new Promise((resolve) => setTimeout(resolve, 45));
    manager.cleanup();

    const countAfterCleanup = mainWindow.alwaysOnTopCalls.length;
    await new Promise((resolve) => setTimeout(resolve, 45));

    assert.strictEqual(mainWindow.alwaysOnTopCalls.length >= 1, true);
    assert.strictEqual(hitWindow.alwaysOnTopCalls.length >= 1, true);
    assert.strictEqual(quickTaskWindow.alwaysOnTopCalls.length >= 1, true);
    assert.strictEqual(bubbleWindow.alwaysOnTopCalls.length >= 1, true);
    assert.strictEqual(mainWindow.alwaysOnTopCalls.length, countAfterCleanup);
  });
});

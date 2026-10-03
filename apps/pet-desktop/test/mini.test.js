const { describe, it } = require("node:test");
const assert = require("node:assert");
const initMini = require("../src/mini");

function createMiniContext(overrides = {}) {
  return {
    theme: { miniMode: { offsetRatio: 0.25 } },
    screen: {
      getAllDisplays: () => ([{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]),
    },
    win: null,
    currentSize: "S",
    SIZES: {
      S: { width: 200, height: 200 },
      M: { width: 280, height: 280 },
      L: { width: 360, height: 360 },
    },
    getCurrentPixelSize: () => ({ width: 200, height: 200 }),
    syncHitWin: () => {},
    bubbleFollowPet: false,
    pendingPermissions: [],
    repositionBubbles: () => {},
    stopWakePoll: () => {},
    sendToRenderer: () => {},
    sendToHitWin: () => {},
    buildContextMenu: () => {},
    buildTrayMenu: () => {},
    doNotDisturb: false,
    applyState: () => {},
    clampToScreen: (x, y, width, height) => ({ x, y, width, height }),
    getNearestWorkArea: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    resolveDisplayState: () => "idle",
    getSvgOverride: () => null,
    ...overrides,
  };
}

describe("mini", () => {
  it("does not throw when checkMiniModeSnap is called before window is ready", () => {
    const mini = initMini(createMiniContext({ win: undefined }));
    assert.doesNotThrow(() => mini.checkMiniModeSnap());
  });

  it("returns false for resize when window is unavailable", () => {
    const mini = initMini(createMiniContext({ win: undefined }));
    assert.strictEqual(mini.handleResize("S"), false);
  });
});

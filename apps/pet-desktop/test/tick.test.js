const { describe, it } = require("node:test");
const assert = require("node:assert");

const initTick = require("../src/tick");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeTickContext(getWin) {
  return {
    theme: {
      timings: { mouseIdleTimeout: 20000, mouseSleepTimeout: 60000 },
      states: { idle: ["clawd-idle-follow.svg"] },
      idleAnimations: [],
      eyeTracking: { eyeRatioX: 0.5, eyeRatioY: 0.5, maxOffset: 3 },
    },
    get win() { return getWin(); },
    currentState: "working",
    currentSvg: "clawd-working-typing.svg",
    miniMode: false,
    miniTransitioning: false,
    dragLocked: false,
    menuOpen: false,
    idlePaused: false,
    isAnimating: false,
    miniSleepPeeked: false,
    mouseOverPet: false,
    forceEyeResend: false,
    startupRecoveryActive: false,
    sendToRenderer: () => {},
    sendToHitWin: () => {},
    setState: () => {},
    applyState: () => {},
    miniPeekIn: () => {},
    miniPeekOut: () => {},
    getObjRect: () => ({ x: 0, y: 0, w: 1, h: 1 }),
    getHitRectScreen: () => ({ left: 0, top: 0, right: 1, bottom: 1 }),
  };
}

describe("tick", () => {
  it("startMainTick does not throw when window is not ready yet", async () => {
    const tick = initTick(makeTickContext(() => null));
    assert.doesNotThrow(() => tick.startMainTick());
    await wait(80);
    tick.cleanup();
  });

  it("applies click-through after window becomes available later", async () => {
    let win = null;
    const tick = initTick(makeTickContext(() => win));
    tick.startMainTick();

    await wait(70);
    const fakeWin = {
      ignoreCalls: 0,
      isDestroyed: () => false,
      setIgnoreMouseEvents() {
        this.ignoreCalls += 1;
      },
    };
    win = fakeWin;

    await wait(120);
    tick.cleanup();
    assert.ok(fakeWin.ignoreCalls >= 1);
  });

  it("downshifts to low-frequency interval when not in idle/mini state", async () => {
    const fakeWin = {
      isDestroyed: () => false,
      setIgnoreMouseEvents: () => {},
      getBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
    };
    const ctx = makeTickContext(() => fakeWin);
    ctx.currentState = "working"; // no idle/mini → should drop to low freq
    let sendCalls = 0;
    ctx.sendToRenderer = () => { sendCalls += 1; };

    const tick = initTick(ctx);
    tick.startMainTick();

    // After ~600ms, a 50ms-only tick would have run ~12 times; an adaptive tick
    // settles to 250ms after the first call, yielding far fewer wakeups.
    await wait(600);
    tick.cleanup();

    // No eye-move events should have been sent in working state.
    assert.strictEqual(sendCalls, 0);
  });
});



it("stops native cursor polling while hidden and resumes after showing", async () => {
  const fs = require("node:fs");
  const Module = require("node:module");
  const sourcePath = require.resolve("../src/tick");
  let cursorReads = 0, visible = false, visibilityChecks = 0;
  const implementation = new Module(sourcePath, module);
  implementation.require = name => {
    assert.strictEqual(name, "electron");
    return { screen: { getCursorScreenPoint() { cursorReads += 1; return { x: 3, y: 3 }; } } };
  };
  implementation._compile(fs.readFileSync(sourcePath, "utf8"), sourcePath);
  const win = { isDestroyed: () => false, isVisible: () => { visibilityChecks += 1; return visible; }, setIgnoreMouseEvents() {}, getBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }) };
  const ctx = makeTickContext(() => win);
  ctx.currentState = "idle";
  const tick = implementation.exports(ctx);
  try {
    tick.startMainTick();
    await wait(650);
    assert.strictEqual(cursorReads, 0);
    assert.ok(visibilityChecks <= 4, "hidden pet should use the low-frequency interval");
    visible = true;
    await wait(360);
    assert.ok(cursorReads > 0, "visible pet must resume cursor tracking");
  } finally {
    tick.cleanup();
  }
});

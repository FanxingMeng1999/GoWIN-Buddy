const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createEventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, fn) {
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
    },
    dispatch(type, event = {}) {
      for (const fn of listeners.get(type) || []) fn(event);
    },
  };
}

test("hit renderer keeps quick-task panel hover-driven instead of click-pinned", async () => {
  const filePath = path.join(__dirname, "..", "src", "hit-renderer.js");
  const code = fs.readFileSync(filePath, "utf8");
  const area = createEventTarget();
  area.offsetWidth = 200;
  area.style = {};
  area.classList = { add: () => {}, remove: () => {} };
  area.setPointerCapture = () => {};

  const documentTarget = createEventTarget();
  documentTarget.getElementById = (id) => {
    assert.equal(id, "hit-area");
    return area;
  };

  const calls = [];
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Math,
    document: documentTarget,
    window: {
      addEventListener: () => {},
      hitInteractionConfig: {
        dashboardHoverCards: true,
        dashboardClickWindowMs: 10,
        dashboardDoubleClickOpen: true,
      },
      hitThemeConfig: {
        reactions: {
          clickLeft: { file: "left.apng", duration: 25 },
          clickRight: { file: "right.apng", duration: 25 },
        },
      },
      hitAPI: {
        isRiosDashboardMode: true,
        onThemeConfig: () => {},
        onStateSync: () => {},
        onCancelReaction: () => {},
        dragLock: (value) => calls.push(["dragLock", value]),
        moveWindowBy: () => {},
        dragEnd: () => {},
        showContextMenu: () => {},
        focusTerminal: () => {},
        openDashboard: () => calls.push(["openDashboard"]),
        showQuickTasks: () => calls.push(["showQuickTasks"]),
        hoverQuickTasks: (inside) => calls.push(["hoverQuickTasks", inside]),
        exitMiniMode: () => {},
        showSessionMenu: () => {},
        startDragReaction: () => {},
        endDragReaction: () => {},
        playClickReaction: (file) => calls.push(["playClickReaction", file]),
      },
    },
  };

  vm.runInNewContext(code, sandbox, { filename: filePath });

  area.dispatch("mouseenter");
  area.dispatch("mouseleave");
  area.dispatch("pointerdown", {
    button: 0,
    pointerId: 1,
    screenX: 50,
    screenY: 50,
    clientX: 50,
    clientY: 50,
  });
  documentTarget.dispatch("pointerup", {
    button: 0,
    clientX: 50,
    clientY: 50,
  });

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.deepEqual(
    calls.filter((call) => call[0] === "hoverQuickTasks"),
    [["hoverQuickTasks", true], ["hoverQuickTasks", false]],
  );
  assert.equal(calls.some((call) => call[0] === "showQuickTasks"), false);
  assert.equal(calls.some((call) => call[0] === "playClickReaction" && call[1] === "left.apng"), true);
});

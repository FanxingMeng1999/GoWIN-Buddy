const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("preload-hit works in sandboxed preload without local module requires", () => {
  const filePath = path.join(__dirname, "..", "src", "preload-hit.js");
  const code = fs.readFileSync(filePath, "utf8");
  const exposed = {};

  const sandbox = {
    process: {
      argv: [
        "electron",
        ".",
        "--dashboard-mode=1",
        "--hit-theme-config={\"theme\":\"ok\"}",
        "--hit-interaction-config={\"dashboardHoverCards\":true,\"dashboardDoubleClickOpen\":true}",
      ],
      env: {},
    },
    require: (id) => {
      if (id === "electron") {
        return {
          contextBridge: {
            exposeInMainWorld: (key, value) => {
              exposed[key] = value;
            },
          },
          ipcRenderer: {
            on: () => {},
            send: () => {},
          },
        };
      }
      throw new Error(`module not found: ${id}`);
    },
    console,
  };

  vm.runInNewContext(code, sandbox, { filename: filePath });

  assert.equal(exposed.hitThemeConfig.theme, "ok");
  assert.equal(exposed.hitInteractionConfig.dashboardHoverCards, true);
  assert.equal(exposed.hitInteractionConfig.dashboardDoubleClickOpen, true);
  assert.equal(exposed.hitAPI.isRiosDashboardMode, true);
  assert.equal(typeof exposed.hitAPI.moveWindowBy, "function");
  assert.equal(typeof exposed.hitAPI.openDashboard, "function");
  assert.equal(typeof exposed.hitAPI.showQuickTasks, "undefined");
});

const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  parseArgValue,
  resolveHitMode,
  resolveHitInteractionConfig,
} = require("../src/hit-mode");

describe("hit-mode", () => {
  it("extracts argument payload by prefix", () => {
    const argv = ["--foo=bar", "--dashboard-mode=1"];
    assert.strictEqual(parseArgValue(argv, "--dashboard-mode="), "1");
    assert.strictEqual(parseArgValue(argv, "--not-exists="), "");
  });

  it("prefers argv dashboard mode over env", () => {
    const mode = resolveHitMode(["--dashboard-mode=0"], { GOWIN_BUDDY_MODE: "dashboard" });
    assert.strictEqual(mode.isDashboardMode, false);
    assert.strictEqual(mode.source, "argv");
  });

  it("falls back to env dashboard mode when argv flag is missing", () => {
    const mode = resolveHitMode([], { GOWIN_BUDDY_MODE: "dashboard" });
    assert.strictEqual(mode.isDashboardMode, true);
    assert.strictEqual(mode.source, "env");
  });

  it("parses hit interaction config json from argv", () => {
    const cfg = resolveHitInteractionConfig([
      "--hit-interaction-config={\"dashboardClickWindowMs\":300,\"dashboardHoverCards\":false}",
    ]);
    assert.strictEqual(cfg.dashboardClickWindowMs, 300);
    assert.strictEqual(cfg.dashboardHoverCards, false);
  });

  it("returns empty object for invalid interaction config json", () => {
    const cfg = resolveHitInteractionConfig(["--hit-interaction-config={invalid"]);
    assert.deepStrictEqual(cfg, {});
  });
});


const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { isDashboardMode, resolveDashboardRuntimeConfig } = require("../src/dashboard-env");

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gowin-dashboard-env-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("dashboard-env", () => {
  it("defaults to dashboard mode when no env is provided", () => {
    assert.strictEqual(isDashboardMode({}), true);
  });

  it("supports explicit false-like values", () => {
    assert.strictEqual(isDashboardMode({ GOWIN_BUDDY_MODE: "false" }), false);
    assert.strictEqual(isDashboardMode({ GOWIN_BUDDY_MODE: "0" }), false);
    assert.strictEqual(isDashboardMode({ GOWIN_BUDDY_MODE: "classic" }), false);
  });

  it("supports explicit true-like values", () => {
    assert.strictEqual(isDashboardMode({ GOWIN_BUDDY_MODE: "dashboard" }), true);
    assert.strictEqual(isDashboardMode({ GOWIN_BUDDY_MODE: "true" }), true);
    assert.strictEqual(isDashboardMode({ GOWIN_BUDDY_MODE: "1" }), true);
  });

  it("resolves packaged runtime python before legacy tools runtime path", () => {
    const root = makeTempDir();
    const baseDir = path.join(root, "apps", "pet-desktop", "src");
    fs.mkdirSync(baseDir, { recursive: true });
    const packagedPython = path.join(root, "runtime", "python", "windows-x64", "3.11.9", "python.exe");
    fs.mkdirSync(path.dirname(packagedPython), { recursive: true });
    fs.writeFileSync(packagedPython, "binary");

    const cfg = resolveDashboardRuntimeConfig({ env: {}, baseDir, fsImpl: fs });
    assert.strictEqual(cfg.workspaceRoot, root);
    assert.strictEqual(cfg.bundledPython, packagedPython);
    assert.strictEqual(cfg.dashboardThemePath, path.join(root, "runtime", "rpg_hub", "theme.json"));
  });
});


describe("packaged standalone paths", () => {
  it("finds the installed bundle and keeps mutable state in user data on direct exe launch", () => {
    const root = makeTempDir();
    const resourcesPath = path.join(root, "pet-dist", "win-unpacked", "resources");
    const userData = path.join(root, "user-data");
    const config = resolveDashboardRuntimeConfig({ env: {}, baseDir: path.join(resourcesPath, "app.asar", "src"), isPackaged: true, resourcesPath, userDataRoot: userData });
    assert.strictEqual(config.workspaceRoot, root);
    assert.strictEqual(config.dashboardStatePath, path.join(userData, "state", "game_state.json"));
    assert.strictEqual(config.dashboardThemePath, path.join(userData, "runtime", "rpg_hub", "theme.json"));
  });
  it("honors explicit runtime and state paths before bundled defaults", () => {
    const root = makeTempDir();
    const explicitPython = path.join(root, "explicit.exe");
    fs.writeFileSync(explicitPython, "binary");
    const bundledPython = path.join(root, "bundled.exe");
    fs.writeFileSync(bundledPython, "binary");
    const config = resolveDashboardRuntimeConfig({ env: { GOWIN_BUDDY_ROOT: root, GOWIN_DASHBOARD_PYTHON: explicitPython, GOWIN_BUNDLED_PYTHON: bundledPython, GOWIN_DASHBOARD_STATE_PATH: path.join(root, "custom.json"), GOWIN_USER_DATA_ROOT: path.join(root, "userdata") } });
    assert.strictEqual(config.bundledPython, explicitPython);
    assert.strictEqual(config.dashboardStatePath, path.join(root, "custom.json"));
  });
});


it("ignores unrelated RIOS mode, root and Python path in the standalone product", () => {
  const root = makeTempDir();
  const baseDir = path.join(root, "apps/pet-desktop/src");
  const foreignPython = path.join(root, "foreign.exe");
  fs.writeFileSync(foreignPython, "binary");
  const config = resolveDashboardRuntimeConfig({ baseDir, env: { RIOS_WORKSPACE_ROOT: path.join(root, "unrelated"), RIOS_DESKTOP_PET_MODE: "classic", RIOS_BUNDLED_PYTHON: foreignPython } });
  assert.strictEqual(config.workspaceRoot, root);
  assert.strictEqual(config.dashboardMode, true);
  assert.notStrictEqual(config.bundledPython, foreignPython);
});

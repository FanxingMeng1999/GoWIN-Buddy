const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createDashboardBridge } = require("../src/dashboard-bridge");

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gowin-dashboard-bridge-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("dashboard-bridge", () => {
  it("opens runtime URL when dashboard host script is missing", async () => {
    const root = makeTempDir();
    const runtimePath = path.join(root, "runtime.json");
    fs.writeFileSync(runtimePath, JSON.stringify({ url: "http://127.0.0.1:51537/" }));

    let openedUrl = null;
    const bridge = createDashboardBridge({
      config: {
        dashboardMode: true,
        workspaceRoot: root,
        dashboardHostScript: path.join(root, "missing_host.py"),
        dashboardStatePath: path.join(root, "dashboard_state.json"),
        dashboardRuntimePath: runtimePath,
      },
      openExternal: async (url) => { openedUrl = url; },
      updateSession: () => {},
    });

    const ok = bridge.openDashboard();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(ok, true);
    assert.strictEqual(openedUrl, "http://127.0.0.1:51537/");
  });

  it("spawns dashboard host when script exists", () => {
    const root = makeTempDir();
    const hostScript = path.join(root, "personal_dashboard_host.py");
    const bundledPython = path.join(root, "python.exe");
    fs.writeFileSync(hostScript, "# host");
    fs.writeFileSync(bundledPython, "binary");

    const spawnCalls = [];
    const bridge = createDashboardBridge({
      config: {
        dashboardMode: true,
        workspaceRoot: root,
        dashboardHostScript: hostScript,
        dashboardStatePath: path.join(root, "dashboard_state.json"),
        dashboardRuntimePath: path.join(root, "runtime.json"),
        dashboardThemePath: path.join(root, "theme.json"),
        bundledPython,
      },
      spawnImpl(command, args, spawnOpts) {
        spawnCalls.push({ command, args, spawnOpts });
        return { unref() {} };
      },
      updateSession: () => {},
    });

    const ok = bridge.openDashboard();
    assert.strictEqual(ok, true);
    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, bundledPython);
    assert.deepStrictEqual(
      spawnCalls[0].args,
      [
        hostScript,
        "launch",
        "--workspace-root",
        root,
        "--state-path",
        path.join(root, "dashboard_state.json"),
        "--runtime-path",
        path.join(root, "runtime.json"),
        "--theme-path",
        path.join(root, "theme.json"),
      ]
    );
    assert.strictEqual(spawnCalls[0].spawnOpts.cwd, root);
  });

  it("returns false when no python runtime is available", () => {
    const root = makeTempDir();
    const hostScript = path.join(root, "personal_dashboard_host.py");
    fs.writeFileSync(hostScript, "# host");

    const bridge = createDashboardBridge({
      config: {
        dashboardMode: true,
        workspaceRoot: root,
        dashboardHostScript: hostScript,
        dashboardStatePath: path.join(root, "dashboard_state.json"),
        dashboardRuntimePath: path.join(root, "runtime.json"),
      },
      env: {
        PATH: "",
        Path: "",
      },
      spawnImpl() {
        throw new Error("spawn should not be called when python is missing");
      },
      updateSession: () => {},
    });

    assert.strictEqual(bridge.openDashboard(), false);
  });

  it("mutates quick-task state and persists to local dashboard state file", async () => {
    const root = makeTempDir();
    const statePath = path.join(root, "state", "dashboard_state.json");
    const deadlineAt = Date.now() + (3 * 60 * 60 * 1000);

    const bridge = createDashboardBridge({
      config: {
        dashboardMode: true,
        workspaceRoot: root,
        dashboardHostScript: path.join(root, "missing.py"),
        dashboardStatePath: statePath,
        dashboardRuntimePath: path.join(root, "runtime.json"),
      },
      updateSession: () => {},
    });

    const payload = await bridge.addQuickTaskTodo({
      name: "Write architecture note",
      cadence: "temporary",
      deadlineAt,
    });

    const persisted = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.ok(Array.isArray(persisted.tasks));
    assert.ok(persisted.tasks.length >= 1);
    assert.strictEqual(persisted.tasks[0].name, "Write architecture note");
    assert.strictEqual(persisted.tasks[0].dueAt, deadlineAt);
    assert.strictEqual(persisted.tasks[0].cadence, "temporary");
    assert.ok(payload && Array.isArray(payload.todos));
    const taskInPayload = payload.todos.find((item) => String(item.id) === String(persisted.tasks[0].id));
    assert.ok(taskInPayload);
    assert.strictEqual(taskInPayload.dueAt, deadlineAt);
    assert.match(taskInPayload.dueLabel, /^DDL /);
  });

  it("claims a temporary todo from the panel without going through dashboard claims", async () => {
    const root = makeTempDir();
    const statePath = path.join(root, "state", "dashboard_state.json");

    const bridge = createDashboardBridge({
      config: {
        dashboardMode: true,
        workspaceRoot: root,
        dashboardHostScript: path.join(root, "missing.py"),
        dashboardStatePath: statePath,
        dashboardRuntimePath: path.join(root, "runtime.json"),
      },
      updateSession: () => {},
    });

    await bridge.addQuickTaskTodo({ name: "倒杯水", cadence: "temporary" });
    const persistedAfterAdd = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const tempId = persistedAfterAdd.tasks[0].id;

    await bridge.setQuickTaskTodo({ id: tempId, checked: true });
    const payloadAfterClaim = await bridge.claimQuickTaskTodo({ id: tempId });

    const persistedAfterClaim = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const stored = persistedAfterClaim.tasks.find((task) => task.id === tempId);
    assert.ok(stored);
    assert.strictEqual(stored.quickTask.cleaned, true);
    assert.strictEqual(stored.quickTask.cleanedByClaim, "quick-task-panel");
    assert.strictEqual(payloadAfterClaim.todos.find((todo) => todo.id === tempId), undefined);
    assert.deepStrictEqual(persistedAfterClaim.gameState.questClaims.claimed, {});
  });

  it("toggles work clock from quick-task panel", async () => {
    const root = makeTempDir();
    const statePath = path.join(root, "state", "dashboard_state.json");

    const bridge = createDashboardBridge({
      config: {
        dashboardMode: true,
        workspaceRoot: root,
        dashboardHostScript: path.join(root, "missing.py"),
        dashboardStatePath: statePath,
        dashboardRuntimePath: path.join(root, "runtime.json"),
      },
      updateSession: () => {},
    });

    const afterClockIn = await bridge.toggleQuickTaskWorkClock();
    assert.strictEqual(afterClockIn.workStatus.active, true);

    const persistedIn = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const todayKey = afterClockIn.todayKey;
    assert.strictEqual(persistedIn.workRecords[todayKey].sessions.length, 1);
    assert.ok(!persistedIn.workRecords[todayKey].sessions[0].end);

    const afterClockOut = await bridge.toggleQuickTaskWorkClock();
    assert.strictEqual(afterClockOut.workStatus.active, false);
    assert.strictEqual(afterClockOut.workStatus.hasClockIn, true);

    const persistedOut = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.ok(persistedOut.workRecords[todayKey].sessions[0].end);
  });

  it("persists dashboard theme snapshots for the web host", () => {
    const root = makeTempDir();
    const themePath = path.join(root, "runtime", "rpg_hub", "theme.json");

    const bridge = createDashboardBridge({
      config: {
        dashboardMode: true,
        workspaceRoot: root,
        dashboardHostScript: path.join(root, "missing.py"),
        dashboardStatePath: path.join(root, "dashboard_state.json"),
        dashboardRuntimePath: path.join(root, "runtime.json"),
        dashboardThemePath: themePath,
      },
      updateSession: () => {},
    });

    const ok = bridge.setDashboardTheme({
      id: "mint-chip",
      name: "Mint Chip",
      variant: "lab",
      pageStart: "rgba(244,255,249,0.95)",
      accentStrong: "#14b8a6",
      preview: {
        swatches: ["#14b8a6", "#6ee7b7", "#f8fffb"],
        accent: "#14b8a6",
        surface: "rgba(255,255,255,0.92)",
      },
    });

    assert.strictEqual(ok, true);
    const persisted = JSON.parse(fs.readFileSync(themePath, "utf8"));
    assert.strictEqual(persisted.id, "mint-chip");
    assert.strictEqual(persisted.variant, "lab");
    assert.deepStrictEqual(persisted.preview.swatches, ["#14b8a6", "#6ee7b7", "#f8fffb"]);
    assert.strictEqual(bridge.readDashboardTheme().id, "mint-chip");
  });

  it("emits reward attention only once for the same reward id", () => {
    const root = makeTempDir();
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const statePath = path.join(root, "dashboard_state.json");
    fs.writeFileSync(statePath, JSON.stringify({
      workRecords: {
        [todayKey]: {
          sessions: [],
        },
      },
      gameState: {
        rewardLogs: [
          {
            id: "reward-001",
            date: todayKey,
            title: "主线突破",
            questLane: "main",
          },
        ],
        petCollection: {
          equipped: "deskpet-base",
        },
      },
    }));

    const calls = [];
    const bridge = createDashboardBridge({
      config: {
        dashboardMode: true,
        workspaceRoot: root,
        dashboardHostScript: path.join(root, "missing.py"),
        dashboardStatePath: statePath,
        dashboardRuntimePath: path.join(root, "runtime.json"),
      },
      updateSession: (...args) => calls.push(args),
    });

    bridge.syncDashboardSignal();
    bridge.syncDashboardSignal();

    const attentionCalls = calls.filter((item) => item[2] && String(item[2]).includes("Reward"));
    assert.strictEqual(attentionCalls.length, 1);
  });

  it("applies reward signal cooldown from profile", () => {
    const root = makeTempDir();
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const statePath = path.join(root, "dashboard_state.json");

    const writeState = (rewardLogs) => {
      fs.writeFileSync(statePath, JSON.stringify({
        workRecords: {
          [todayKey]: {
            sessions: [],
          },
        },
        gameState: {
          rewardLogs,
          petCollection: {
            equipped: "deskpet-base",
          },
        },
      }));
    };

    writeState([
      { id: "reward-001", date: todayKey, title: "第一条奖励", questLane: "main" },
    ]);

    const calls = [];
    const bridge = createDashboardBridge({
      config: {
        dashboardMode: true,
        workspaceRoot: root,
        dashboardHostScript: path.join(root, "missing.py"),
        dashboardStatePath: statePath,
        dashboardRuntimePath: path.join(root, "runtime.json"),
        legacyProfile: {
          rewardSignalCooldownMs: 60000,
        },
      },
      updateSession: (...args) => calls.push(args),
    });

    const originalNow = Date.now;
    let now = originalNow();
    Date.now = () => now;
    try {
      bridge.syncDashboardSignal();
      writeState([
        { id: "reward-002", date: todayKey, title: "第二条奖励", questLane: "main" },
        { id: "reward-001", date: todayKey, title: "第一条奖励", questLane: "main" },
      ]);
      bridge.syncDashboardSignal();
      now += 61000;
      bridge.syncDashboardSignal();
    } finally {
      Date.now = originalNow;
    }

    const attentionCalls = calls.filter((item) => item[2] && String(item[2]).includes("Reward"));
    assert.strictEqual(attentionCalls.length, 2);
    assert.match(String(attentionCalls[1][11] || ""), /第二条奖励/);
  });

  it("watches dashboard state/runtime files and closes watchers on stop", async () => {
    const root = makeTempDir();
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const statePath = path.join(root, "state", "dashboard_state.json");
    const runtimePath = path.join(root, "runtime", "runtime.json");
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({
      workRecords: { [todayKey]: { sessions: [] } },
      gameState: { rewardLogs: [], petCollection: { equipped: "deskpet-base" } },
    }));
    fs.writeFileSync(runtimePath, JSON.stringify({ url: "http://127.0.0.1:50123/" }));

    const watchCalls = [];
    const watchers = [];
    const fsImpl = {
      ...fs,
      watch(target, _options, cb) {
        const watcher = {
          closed: false,
          close() {
            this.closed = true;
          },
        };
        watchCalls.push({ target, cb, watcher });
        watchers.push(watcher);
        return watcher;
      },
    };

    let refreshCount = 0;
    const bridge = createDashboardBridge({
      config: {
        dashboardMode: true,
        workspaceRoot: root,
        dashboardHostScript: path.join(root, "missing.py"),
        dashboardStatePath: statePath,
        dashboardRuntimePath: runtimePath,
      },
      fsImpl,
      updateSession: () => {},
      onQuickTaskDataChanged: () => { refreshCount += 1; },
      pollIntervalMs: 60000,
      watchDebounceMs: 40,
    });

    bridge.startMonitor();
    assert.ok(watchCalls.length >= 2);

    const baseline = refreshCount;
    const stateWatcher = watchCalls.find((item) => String(item.target).includes(path.dirname(statePath)));
    assert.ok(stateWatcher);
    const changedState = JSON.parse(fs.readFileSync(statePath, "utf8"));
    changedState.gameState.xp = 10;
    fs.writeFileSync(statePath, JSON.stringify(changedState));
    stateWatcher.cb("change", path.basename(statePath));
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.ok(refreshCount > baseline);

    bridge.stopMonitor();
    assert.ok(watchers.length >= 2);
    watchers.forEach((watcher) => {
      assert.strictEqual(watcher.closed, true);
    });
  });
});


describe("dashboard-bridge persistence regressions", () => {
  function fixture(overrides = {}) {
    const root = makeTempDir();
    const statePath = path.join(root, "state.json");
    const runtimePath = path.join(root, "runtime.json");
    fs.writeFileSync(statePath, JSON.stringify({ tasks: [], gameState: { xp: 0 } }));
    const bridge = createDashboardBridge({
      config: { dashboardMode: true, workspaceRoot: root, dashboardStatePath: statePath, dashboardRuntimePath: runtimePath },
      logger: { warn() {} },
      ...overrides,
    });
    return { bridge, statePath, runtimePath };
  }

  it("does not overwrite a damaged state file with an empty task list", async () => {
    const { bridge, statePath } = fixture();
    fs.writeFileSync(statePath, "{broken");
    await assert.rejects(bridge.addQuickTaskTodo({ name: "new" }), /无法读取/);
    assert.strictEqual(fs.readFileSync(statePath, "utf8"), "{broken");
  });

  it("reports HTTP save errors without bypassing them through a local write", async () => {
    const { bridge, statePath, runtimePath } = fixture({ fetchImpl: async () => ({ ok: false, status: 500 }) });
    fs.writeFileSync(runtimePath, JSON.stringify({ url: "http://127.0.0.1:54321/" }));
    const before = fs.readFileSync(statePath, "utf8");
    await assert.rejects(bridge.addQuickTaskTodo({ name: "new" }), /保存失败/);
    assert.strictEqual(fs.readFileSync(statePath, "utf8"), before);
  });

  it("retries a conflicted task mutation against the newer state", async () => {
    let statePath, attempts = 0;
    const fx = fixture({ fetchImpl: async (_url, request) => {
      assert.ok(request.headers["If-Match"]);
      assert.ok(request.signal);
      attempts += 1;
      if (attempts === 1) {
        fs.writeFileSync(statePath, JSON.stringify({ tasks: [{ id: 90, name: "remote", status: "未开始", cadence: "temporary" }] }));
        return { ok: false, status: 409 };
      }
      fs.writeFileSync(statePath, request.body);
      return { ok: true, status: 200 };
    } });
    statePath = fx.statePath;
    fs.writeFileSync(fx.runtimePath, JSON.stringify({ url: "http://127.0.0.1:54321/" }));
    const result = await fx.bridge.addQuickTaskTodo({ name: "local" });
    assert.strictEqual(attempts, 2);
    assert.ok(result.todos.some(todo => todo.title === "remote"));
    assert.ok(result.todos.some(todo => todo.title === "local"));
  });

  it("does not reread unchanged JSON or resend unchanged panel data", () => {
    let reads = 0, pushes = 0;
    const { bridge } = fixture({
      fsImpl: { ...fs, readFileSync(...args) { reads += 1; return fs.readFileSync(...args); } },
      onQuickTaskDataChanged() { pushes += 1; },
    });
    for (let n = 0; n < 50; n += 1) bridge.syncDashboardSignal();
    assert.strictEqual(reads, 1);
    assert.strictEqual(pushes, 1);
  });

  it("serializes rapid offline mutations and retains a valid backup", async () => {
    const { bridge, statePath } = fixture();
    await Promise.all([bridge.addQuickTaskTodo({ name: "one" }), bridge.addQuickTaskTodo({ name: "two" })]);
    const saved = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.deepStrictEqual(saved.tasks.map(task => task.name).sort(), ["one", "two"]);
    assert.strictEqual(JSON.parse(fs.readFileSync(statePath + ".bak", "utf8")).tasks[0].name, "one");
    assert.ok(!fs.readdirSync(path.dirname(statePath)).some(name => name.endsWith(".tmp")));
  });
});

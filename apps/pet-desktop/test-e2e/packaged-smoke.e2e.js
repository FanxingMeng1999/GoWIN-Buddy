"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { _electron, chromium } = require("playwright-core");
const runFile = promisify(execFile);
const repo = path.resolve(__dirname, "../../..");
const installedRoot = path.resolve(process.argv[2] || "");
if (!process.argv[2]) throw new Error("Pass the isolated installed application directory");
const profile = path.join(path.dirname(installedRoot), "test-user-data");
const output = path.join(repo, "logs/quality");
const executable = path.join(installedRoot, "pet-dist/win-unpacked/GoWIN!Buddy.exe");
const report = { installedRoot, ok: false, checks: [], rendererErrors: [] };
const runId = Date.now();
const offlineTitle = "安装版离线任务 " + runId;
const onlineTitle = "安装版在线任务 " + runId;
const dashboardTitle = "安装版双向同步任务 " + runId;
const environment = { ...process.env, GOWIN_USER_DATA_ROOT: profile, GOWIN_BUDDY_MODE: "dashboard", GOWIN_INTERACTION_DEBUG: "1" };
for (const key of ["ELECTRON_RUN_AS_NODE", "GOWIN_BUDDY_ROOT", "RIOS_WORKSPACE_ROOT", "GOWIN_DASHBOARD_HOST_SCRIPT", "GOWIN_DASHBOARD_STATE_PATH", "GOWIN_DASHBOARD_RUNTIME_PATH", "GOWIN_DASHBOARD_THEME_PATH", "GOWIN_BUNDLED_PYTHON", "GOWIN_DASHBOARD_PYTHON", "RIOS_BUNDLED_PYTHON", "RIOS_DASHBOARD_PYTHON"]) delete environment[key];
environment.RIOS_WORKSPACE_ROOT = path.join(repo, "unrelated-rios-directory");
environment.RIOS_BUNDLED_PYTHON = path.join(repo, "unrelated-python.exe");
environment.RIOS_UPDATE_REPO = "unrelated/legacy-updates";
let app, host, browser;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await sleep(100);
  }
  throw new Error("Timed out: " + label);
}
function mark(name) { report.checks.push(name); }
async function captureNative(app, suffix, target) {
  await app.evaluate(async ({ BrowserWindow }, input) => {
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith(input.suffix));
    if (!win) throw Error('Capture window missing: ' + input.suffix);
    const image = await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    if (image.isEmpty()) throw Error('Empty window capture');
    process.getBuiltinModule('fs').writeFileSync(input.target, image.toPNG());
  }, { suffix, target });
}

(async () => {
  try {
    assert.ok(fs.existsSync(executable));
    assert.ok(fs.existsSync(path.join(installedRoot, "qa-install.marker")));
    assert.ok(!fs.existsSync(path.join(installedRoot, "configs/runtime-paths.resolved.json")));
    assert.ok(!fs.existsSync(path.join(installedRoot, "runtime/nsis")));
    assert.ok(!fs.existsSync(path.join(installedRoot, "runtime/node/node_modules")));
    mark("Standalone payload excludes machine paths and build tools");
    app = await _electron.launch({ executablePath: executable, cwd: installedRoot, env: environment, timeout: 30000 });
    app.on("window", page => page.on("pageerror", error => report.rendererErrors.push(error.message)));
    const main = await until(() => app.windows().find(page => page.url().endsWith("/index.html")), "pet window");
    const hit = await until(() => app.windows().find(page => page.url().endsWith("/hit.html")), "input window");
    for (const page of app.windows()) page.on("pageerror", error => report.rendererErrors.push(error.message));
    await main.waitForSelector("#clawd");
    await until(() => main.evaluate(() => !!document.getElementById("clawd").data), "pet animation");
    const configuration = await app.evaluate(({ app }) => {
      const path = process.getBuiltinModule("path");
      const requireInstalled = process.getBuiltinModule("module").createRequire(path.join(app.getAppPath(), "package.json"));
      const { resolveDashboardRuntimeConfig } = requireInstalled(path.join(app.getAppPath(), "src/dashboard-env.js"));
      return { version: app.getVersion(), electron: process.versions.electron, profile: app.getPath("userData"),
        ...resolveDashboardRuntimeConfig({ baseDir: path.join(app.getAppPath(), "src"), isPackaged: app.isPackaged, resourcesPath: process.resourcesPath, userDataRoot: app.getPath("userData") }) };
    });
    assert.equal(configuration.version, require("../package.json").version);
    assert.equal(configuration.workspaceRoot.toLowerCase(), installedRoot.toLowerCase());
    assert.equal(configuration.dashboardStatePath.toLowerCase(), path.join(profile, "state/game_state.json").toLowerCase());
    assert.ok(configuration.bundledPython.toLowerCase().startsWith(installedRoot.toLowerCase()));
    const installedTick = await app.evaluate(({ app }) => process.getBuiltinModule("fs").readFileSync(process.getBuiltinModule("path").join(app.getAppPath(), "src/tick.js"), "utf8"));
    assert.match(installedTick, /Hidden pets do not need native cursor polling/);
    const expectedPetHashes = Object.fromEntries(["dashboard-env.js", "dashboard-bridge.js", "runtime-state.js", "tick.js", "updater.js", "quick-tasks-renderer.js", "quick-tasks.html", "renderer.js", "styles.css", "../hooks/shared-process.js"].map(file => [file, crypto.createHash("sha256").update(fs.readFileSync(path.join(repo, "apps/pet-desktop/src", file), "utf8").replace(/\r\n/g, "\n")).digest("hex")]));
    const actualPetHashes = await app.evaluate(({ app }, files) => {
      const fs = process.getBuiltinModule("fs"), path = process.getBuiltinModule("path"), crypto = process.getBuiltinModule("crypto");
      return Object.fromEntries(files.map(file => [file, crypto.createHash("sha256").update(fs.readFileSync(path.join(app.getAppPath(), "src", file), "utf8").replace(/\r\n/g, "\n")).digest("hex")]));
    }, Object.keys(expectedPetHashes));
    assert.deepEqual(actualPetHashes, expectedPetHashes);
    for (const file of ["apps/rpg-hub/host/personal_dashboard_host.py", "apps/rpg-hub/web/dashboard.html", "apps/rpg-hub/web/state-sync.js", "scripts/windows/gowin-quality-common.ps1"]) assert.equal(fs.readFileSync(path.join(installedRoot, file), "utf8").replace(/\r\n/g, "\n"), fs.readFileSync(path.join(repo, file), "utf8").replace(/\r\n/g, "\n"));
    report.payloadHashes = actualPetHashes;
    mark("Installed runtime and dashboard match the final reviewed source files");
    report.configuration = configuration;
    mark("Direct executable launch resolves installed root and writable user data");
    const reduceMotion = await main.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    await app.evaluate(({ BrowserWindow }, file) => {
      const win = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().endsWith("/index.html"));
      win.webContents.send("state-change", "working", file);
    }, "clawd-working-typing.svg");
    await main.waitForFunction(() => {
      const active = document.getElementById("clawd");
      return active && active.tagName === "IMG" && active.complete && active.naturalWidth > 0;
    }, null, { timeout: 3000, polling: "raf" });
    if (reduceMotion) {
      assert.equal(await main.locator(".pet-asset-fading").count(), 0);
      assert.equal(await main.locator("#clawd").evaluate(el => el.style.opacity), "1");
    } else {
      await main.waitForFunction(() => {
        const outgoing = document.querySelector(".pet-asset-fading");
        return outgoing && outgoing.style.opacity === "0";
      }, null, { timeout: 1500, polling: "raf" });
      const fade = await main.locator(".pet-asset-fading").evaluate(el => ({ transition: el.style.transition, pointerEvents: getComputedStyle(el).pointerEvents }));
      assert.match(fade.transition, /140ms/);
      assert.equal(fade.pointerEvents, "none");
      await main.waitForFunction(() => !document.querySelector(".pet-asset-fading"), null, { timeout: 1500, polling: "raf" });
    }
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().endsWith("/index.html"));
      win.webContents.send("state-change", "idle", "clawd-idle-follow.svg");
    });
    await main.waitForFunction(() => document.getElementById("clawd")?.tagName === "OBJECT", null, { timeout: 3000, polling: "raf" });
    mark("Mascot movement is visible and state changes use the 140 ms crossfade");
    report.quickTaskShortcutRegistered = await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered("CommandOrControl+Alt+Q"));
    // A concurrently running previous version can own this system-wide shortcut.
    // Panel interactions below remain available and are verified independently.
    await hit.evaluate(() => window.hitAPI.hoverQuickTasks(true));
    const quick = await until(() => app.windows().find(page => page.url().endsWith("/quick-tasks.html")), "task panel");
    await quick.waitForSelector("#todoInput");
    let tasks = await quick.evaluate(title => window.quickTasksAPI.addTodo(title, "temporary", null), offlineTitle);
    assert.ok(tasks.todos.some(task => task.title === offlineTitle));
    const task = tasks.todos.find(task => task.title === offlineTitle);
    tasks = await quick.evaluate(id => window.quickTasksAPI.setTodoChecked(id, true), task.id);
    assert.ok(tasks.todos.find(item => item.id === task.id).checked);
    tasks = await quick.evaluate(id => window.quickTasksAPI.claimTodo(id), task.id);
    assert.ok(!tasks.todos.some(item => item.id === task.id));
    const clockIn = await quick.evaluate(() => window.quickTasksAPI.toggleClock());
    assert.ok(clockIn.workStatus.active);
    const clockOut = await quick.evaluate(() => window.quickTasksAPI.toggleClock());
    assert.ok(!clockOut.workStatus.active);
    mark("Installed task add/check/clear and work clock use offline atomic persistence");
    const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith("/index.html")).getBounds());
    await hit.evaluate(() => { window.hitAPI.dragLock(true); window.hitAPI.moveWindowBy(25, 15); });
    await sleep(150);
    const moved = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith("/index.html")).getBounds());
    assert.ok(moved.x !== bounds.x || moved.y !== bounds.y);
    await hit.evaluate(() => { window.hitAPI.dragLock(false); window.hitAPI.dragEnd(); });
    mark("Installed input window moves the pet through its drag IPC chain");
    const originalPid = app.process().pid;
    await runFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(installedRoot, "GoWINBuddy.Launcher.ps1"), "-Root", installedRoot, "-Action", "launch"], { env: environment, windowsHide: true, timeout: 15000 });
    await sleep(1800);
    assert.equal(app.process().pid, originalPid);
    assert.equal(await app.evaluate(({ app }) => app.getVersion()), require("../package.json").version);
    mark("Launching the shortcut again preserves the original running process");
    let hostErrors = "";
    host = spawn(configuration.bundledPython, [configuration.dashboardHostScript, "launch", "--workspace-root", installedRoot, "--state-path", configuration.dashboardStatePath, "--runtime-path", configuration.dashboardRuntimePath, "--theme-path", configuration.dashboardThemePath, "--no-open"], { env: environment, cwd: installedRoot, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    host.stderr.on("data", bytes => { hostErrors = (hostErrors + bytes).slice(-4000); });
    const url = await until(async () => {
      try {
        const runtime = JSON.parse(fs.readFileSync(configuration.dashboardRuntimePath, "utf8"));
        const response = await fetch(new URL("/health", runtime.url), { signal: AbortSignal.timeout(1000) });
        return response.ok && runtime.url;
      } catch { return false; }
    }, "bundled dashboard host: " + hostErrors);
    const online = await quick.evaluate(title => window.quickTasksAPI.addTodo(title, "daily", null), onlineTitle);
    assert.ok(online.todos.some(task => task.title === onlineTitle));
    const stateResponse = await fetch(new URL("/api/state", url));
    assert.ok(stateResponse.headers.get("ETag"));
    const state = await stateResponse.json();
    assert.ok(state.tasks.some(task => task.name === onlineTitle));
    mark("Bundled Python serves the installed dashboard and conditional pet saves");
    const chrome = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find(file => fs.existsSync(file));
    assert.ok(chrome);
    browser = await chromium.launch({ executablePath: chrome, headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", error => report.rendererErrors.push(error.message));
    await page.goto(url);
    await page.waitForSelector("#questStarValue");
    await page.waitForFunction(() => !remoteDirty && !remoteSaveInFlight);
    await page.evaluate(title => { document.getElementById("taskInput").value = title; addTask(); }, dashboardTitle);
    await page.waitForFunction(() => !remoteDirty && !remoteSaveInFlight);
    await until(async () => (await quick.evaluate(() => window.quickTasksAPI.getData())).todos.some(task => task.title === dashboardTitle), "dashboard to pet synchronization");
    await page.screenshot({ path: path.join(output, "installed-dashboard-20261003.png") });
    await captureNative(app, "/index.html", path.join(output, "installed-pet-20261003.png"));
    await captureNative(app, "/quick-tasks.html", path.join(output, "installed-task-panel-20261003.png"));
    mark("Installed dashboard renders and synchronizes new tasks back to the pet");
    assert.deepEqual(report.rendererErrors, []);
    report.ok = true;
  } catch (error) {
    report.error = error.stack;
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (app) await app.close().catch(() => {});
    if (host) { host.kill(); await sleep(300); }
    fs.writeFileSync(path.join(output, "installed-smoke-20261003.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
})();

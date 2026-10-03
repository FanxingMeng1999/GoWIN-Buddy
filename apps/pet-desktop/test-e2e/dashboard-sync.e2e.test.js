const { before, after, beforeEach, describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const SOURCE_HOST_SCRIPT = path.join(REPO_ROOT, "apps", "rpg-hub", "host", "personal_dashboard_host.py");
const SOURCE_WEB_ROOT = path.join(REPO_ROOT, "apps", "rpg-hub", "web");
const SOURCE_TEMPLATE_PATH = path.join(SOURCE_WEB_ROOT, "doctor_dashboard_state_template.v1.json");

const FIXTURES = [];
let skipReason = "";
let fixtureRoot = "";
let dashboardUrl = "";
let hostProcess = null;
let browser = null;
let context = null;
let page = null;
let templateState = null;

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveBrowserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_PATH || "",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function resolvePythonInvocation() {
  const fileCandidates = [
    process.env.GOWIN_TOOL_PYTHON || "",
    path.join(REPO_ROOT, "tools", "runtime", "python", "windows-x64", "3.11.9", "python.exe"),
    path.join(REPO_ROOT, ".venv", "Scripts", "python.exe"),
  ].filter(Boolean);
  for (const candidate of fileCandidates) {
    if (fs.existsSync(candidate)) {
      return { command: candidate, prefixArgs: [] };
    }
  }
  return null;
}

function createFixtureWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gowin-dashboard-e2e-"));
  FIXTURES.push(root);
  const hostDir = path.join(root, "apps", "rpg-hub", "host");
  const webDir = path.join(root, "apps", "rpg-hub", "web");
  fs.mkdirSync(hostDir, { recursive: true });
  fs.mkdirSync(webDir, { recursive: true });
  fs.copyFileSync(SOURCE_HOST_SCRIPT, path.join(hostDir, "personal_dashboard_host.py"));
  fs.cpSync(SOURCE_WEB_ROOT, webDir, { recursive: true });
  return root;
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDashboardUrl(runtimePath, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(runtimePath)) {
      try {
        const payload = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
        if (payload && typeof payload.url === "string" && payload.url) {
          const health = await fetch(new URL("/health", payload.url).toString(), { method: "GET" });
          if (health.ok) return payload.url;
        }
      } catch {}
    }
    await wait(200);
  }
  return "";
}

function buildState(overrides = {}) {
  const now = Date.now();
  const {
    stars = 0,
    tasks = [],
  } = overrides;
  const state = deepClone(templateState);
  state.tasks = tasks.map((name, idx) => ({
    id: now + idx + 1,
    name,
    status: "未开始",
    createdAt: now + idx,
    completedAt: null,
    source: "custom",
    cadence: "temporary",
    quickTask: {
      struck: false,
      cleaned: false,
      cleanedAt: null,
      cleanedByClaim: "",
    },
  }));
  state.gameState = state.gameState || {};
  state.gameState.xp = Number(state.gameState.xp) || 0;
  state.gameState.stars = Number(stars) || 0;
  state.gameState.rewardLogs = Array.isArray(state.gameState.rewardLogs) ? state.gameState.rewardLogs : [];
  state.workRecords = state.workRecords || {};
  state.reflectionRecords = state.reflectionRecords || {};
  return state;
}

async function postRemoteState(state) {
  const endpoint = new URL("/api/state", dashboardUrl).toString();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  assert.strictEqual(response.ok, true, "POST /api/state failed");
}

async function getRemoteState() {
  const endpoint = new URL("/api/state", dashboardUrl).toString();
  const response = await fetch(endpoint, { method: "GET" });
  assert.strictEqual(response.ok, true, "GET /api/state failed");
  return response.json();
}

async function waitForStar(expected, timeoutMs = 12000) {
  if (!page) throw new Error("dashboard page is not ready");
  const expectedText = String(expected);
  await page.waitForFunction(
    (value) => {
      const el = document.getElementById("questStarValue");
      return !!el && String(el.textContent || "").trim() === value;
    },
    expectedText,
    { timeout: timeoutMs }
  );
}

async function currentStar() {
  if (!page) throw new Error("dashboard page is not ready");
  return page.$eval("#questStarValue", (el) => String(el.textContent || "").trim());
}

async function waitForSyncIdle(timeoutMs = 12000) {
  if (!page) throw new Error("dashboard page is not ready");
  await page.waitForFunction(
    () => {
      const el = document.getElementById("remoteSyncStatus");
      if (!el) return false;
      const text = String(el.textContent || "");
      return !text.includes("正在同步") && !text.includes("正在保存") && !remoteSaveInFlight && !remoteDirty;
    },
    null,
    { timeout: timeoutMs }
  );
}

function shouldSkip(t) {
  if (skipReason || !page || !dashboardUrl) {
    t.skip(skipReason || "dashboard e2e runtime is not ready");
    return true;
  }
  return false;
}

describe("dashboard remote sync e2e", { concurrency: 1 }, () => {
  before(async () => {
    if (!fs.existsSync(SOURCE_HOST_SCRIPT) || !fs.existsSync(SOURCE_TEMPLATE_PATH)) {
      skipReason = "dashboard host assets are missing";
      return;
    }
    const browserExecutable = resolveBrowserExecutable();
    if (!browserExecutable) {
      skipReason = "no Chromium browser executable found";
      return;
    }
    const python = resolvePythonInvocation();
    if (!python) {
      skipReason = "no Python runtime found for dashboard host";
      return;
    }

    fixtureRoot = createFixtureWorkspace();
    templateState = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "apps", "rpg-hub", "web", "doctor_dashboard_state_template.v1.json"), "utf8"));

    const fixtureHostScript = path.join(fixtureRoot, "apps", "rpg-hub", "host", "personal_dashboard_host.py");
    hostProcess = spawn(
      python.command,
      [...python.prefixArgs, fixtureHostScript, "launch", "--workspace-root", fixtureRoot, "--no-open"],
      {
        cwd: fixtureRoot,
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      }
    );

    let hostErrors = "";
    hostProcess.stderr.on("data", chunk => { hostErrors = (hostErrors + chunk).slice(-4000); });
    const runtimePath = path.join(fixtureRoot, "runtime", "rpg_hub", "runtime.json");
    dashboardUrl = await waitForDashboardUrl(runtimePath, 40000);
    if (!dashboardUrl) {
      throw new Error("dashboard host failed to start: " + hostErrors);
    }

    browser = await chromium.launch({
      headless: true,
      executablePath: browserExecutable,
      args: ["--disable-gpu", "--no-first-run", "--no-default-browser-check"],
    });
    context = await browser.newContext();
    page = await context.newPage();
    await page.goto(dashboardUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#questStarValue", { timeout: 15000 });
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (hostProcess && !hostProcess.killed) {
      hostProcess.kill("SIGTERM");
      await wait(500);
      try {
        if (!hostProcess.killed) hostProcess.kill("SIGKILL");
      } catch {}
    }
    while (FIXTURES.length) {
      const dir = FIXTURES.pop();
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
          break;
        } catch {
          await wait(250);
        }
      }
    }
  });

  beforeEach(async (t) => {
    if (skipReason || !page || !dashboardUrl) {
      t.skip(skipReason);
      return;
    }
    const baseline = buildState({ stars: 0, tasks: [] });
    await postRemoteState(baseline);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#questStarValue", { timeout: 15000 });
    await waitForStar(0);
    await waitForSyncIdle();
    await page.waitForTimeout(400);
  });

  it("applies remote state changes without hard reload", async (t) => {
    if (shouldSkip(t)) return;
    await page.evaluate(() => { window.__dashboardE2EMarker = "persist"; });
    await waitForSyncIdle();
    await postRemoteState(buildState({ stars: 12 }));
    await waitForStar(12);
    const marker = await page.evaluate(() => window.__dashboardE2EMarker);
    assert.strictEqual(marker, "persist");
  });

  it("pauses remote refresh while user is editing and resumes after blur", async (t) => {
    if (shouldSkip(t)) return;
    await waitForSyncIdle();
    await postRemoteState(buildState({ stars: 8 }));
    await waitForStar(8);

    await page.focus("#bestThing");
    await page.keyboard.type("editing-lock-check");
    await postRemoteState(buildState({ stars: 19 }));
    await page.waitForTimeout(2800);

    const blockedStar = await currentStar();
    assert.strictEqual(blockedStar, "8");
    const inputValue = await page.$eval("#bestThing", (el) => el.value);
    assert.match(inputValue, /editing-lock-check/);

    await page.evaluate(() => {
      const active = document.activeElement;
      if (active && typeof active.blur === "function") active.blur();
    });
    await waitForStar(19);
  });

  it("preserves independent local and remote tasks during a save conflict", async (t) => {
    if (shouldSkip(t)) return;
    await waitForSyncIdle();
    await postRemoteState(buildState({ stars: 3, tasks: [] }));
    await waitForStar(3);

    await page.evaluate(() => {
      const input = document.getElementById("taskInput");
      input.value = "LOCAL_TASK_E2E";
      window.addTask();
    });

    await postRemoteState(buildState({ stars: 3, tasks: ["REMOTE_TASK_E2E"] }));
    await page.waitForTimeout(1800);

    const remote = await getRemoteState();
    const names = (remote.tasks || []).map((task) => task && task.name).filter(Boolean);
    assert.ok(names.includes("LOCAL_TASK_E2E"));
    assert.ok(names.includes("REMOTE_TASK_E2E"));
    const localPayload = await page.evaluate(() => localStorage.getItem("phd_pro_v3") || "");
    assert.match(localPayload, /LOCAL_TASK_E2E/);
  });

  it("serializes two local edits while the first save is in flight", async (t) => {
    if (shouldSkip(t)) return;
    await waitForSyncIdle();
    let delayed = false;
    await page.route("**/api/state", async route => {
      if (route.request().method() === "POST" && !delayed) {
        delayed = true;
        await wait(700);
      }
      await route.continue();
    });
    try {
      await page.evaluate(() => {
        document.getElementById("taskInput").value = "FIRST_IN_FLIGHT";
        addTask();
      });
      await page.waitForTimeout(250);
      await page.evaluate(() => {
        document.getElementById("taskInput").value = "SECOND_IN_FLIGHT";
        addTask();
        watchRemoteStateChanges();
      });
      await page.waitForTimeout(1600);
      const remote = await getRemoteState();
      const names = remote.tasks.map(task => task.name);
      assert.ok(names.includes("FIRST_IN_FLIGHT"));
      assert.ok(names.includes("SECOND_IN_FLIGHT"));
      assert.strictEqual(await page.evaluate(() => remoteDirty || remoteSaveInFlight), false);
    } finally {
      await page.unroute("**/api/state");
    }
  });

  it("retains local cache and remote rewards when the same field conflicts", async (t) => {
    if (shouldSkip(t)) return;
    await waitForSyncIdle();
    await page.evaluate(() => { appData.gameState.stars = 111; saveData(); });
    await postRemoteState(buildState({ stars: 222 }));
    await page.waitForTimeout(1400);
    const remote = await getRemoteState();
    assert.strictEqual(remote.gameState.stars, 222);
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("phd_pro_v3")).gameState.stars), 111);
    assert.match(await page.$eval("#remoteSyncStatus", element => element.textContent), /相同内容/);
  });

});

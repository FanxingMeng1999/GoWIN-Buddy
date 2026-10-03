"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const Module = require("node:module");
const { performance } = require("node:perf_hooks");
const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "apps/pet-desktop/src/dashboard-bridge.js");
const baselinePath = process.argv[2] ? path.resolve(process.argv[2]) : null;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "gowin-sync-benchmark-"));
const statePath = path.join(temporary, "state.json");
const iterations = 120;
const today = new Date();
const dateKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
const seed = {
  tasks: Array.from({ length: 500 }, (_, id) => ({ id, name: "Benchmark task " + id, status: "未开始", cadence: "temporary", createdAt: Date.now() })),
  workRecords: { [dateKey]: { sessions: [] } },
  gameState: { xp: 150, stars: 30, rewardLogs: Array.from({ length: 1000 }, (_, id) => ({ id: "reward-" + id, date: dateKey, title: "Benchmark reward", questLane: "daily" })) },
};
fs.writeFileSync(statePath, JSON.stringify(seed, null, 2));
function loadSource(file) {
  const implementation = new Module(sourcePath, module);
  implementation.filename = sourcePath;
  implementation.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  implementation._compile(fs.readFileSync(file, "utf8"), sourcePath);
  return implementation.exports;
}
function run(implementation) {
  let fileReads = 0, bytesRead = 0, panelUpdates = 0;
  let bridge;
  bridge = implementation.createDashboardBridge({
    config: { dashboardMode: true, workspaceRoot: temporary, dashboardStatePath: statePath },
    fsImpl: { ...fs, readFileSync(...args) { const bytes = fs.readFileSync(...args); fileReads += 1; bytesRead += Buffer.byteLength(bytes); return bytes; } },
    updateSession() {},
    onQuickTaskDataChanged() { panelUpdates += 1; bridge.getQuickTaskPayload(); },
    logger: { warn() {} },
  });
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) bridge.syncDashboardSignal();
  return { fileReads, bytesRead, panelUpdates, elapsedMs: +(performance.now() - started).toFixed(2) };
}
const current = loadSource(sourcePath);
const baseline = baselinePath ? loadSource(baselinePath) : null;
const results = { scenario: "500 tasks, 1000 reward logs; unchanged state; 120 sync calls per round", iterations, rounds: 5, baseline: [], current: [] };
const originalNow = Date.now;
const fixedNow = Date.now();
try {
  Date.now = () => fixedNow;
  for (let round = 0; round < results.rounds; round += 1) {
    if (baseline) results.baseline.push(run(baseline));
    results.current.push(run(current));
  }
  const median = items => items.map(item => item.elapsedMs).sort((a, b) => a - b)[Math.floor(items.length / 2)];
  results.currentMedianMs = median(results.current);
  if (baseline) results.baselineMedianMs = median(results.baseline);
  const report = path.join(root, "logs/quality/dashboard-sync-benchmark-latest.json");
  fs.writeFileSync(report, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  Date.now = originalNow;
  if (path.dirname(temporary) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith("gowin-sync-benchmark-")) throw new Error("Unexpected benchmark cleanup path");
  fs.rmSync(temporary, { recursive: true, force: true });
}

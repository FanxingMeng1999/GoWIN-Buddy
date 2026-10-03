const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const { writeJsonAtomic } = require("../hooks/json-utils");
const { spawn } = require("child_process");
const {
  addCustomTodo,
  buildQuickTaskSnapshot,
  claimTempTodo,
  ensureDashboardState,
  getTodayKey: getQuickTaskTodayKey,
  setQuestChecked,
  setTodoChecked,
  toggleWorkClock,
} = require("./gowin-quick-tasks");

const DEFAULT_SESSION_ID = "__gowin_dashboard__";
const DEFAULT_PET_LOOK_HINTS = {
  "deskpet-base": { idle: "rios-idle-base", working: "rios-work-base" },
  "route-compass": { idle: "rios-idle-route-compass", working: "rios-work-route-compass" },
  "midterm-goggles": { idle: "rios-idle-midterm-goggles", working: "rios-work-midterm-goggles" },
  "seminar-lanyard": { idle: "rios-idle-seminar-lanyard", working: "rios-work-seminar-lanyard" },
  "paper-scroll": { idle: "rios-idle-paper-scroll", working: "rios-work-paper-scroll" },
  "funding-ribbon": { idle: "rios-idle-funding-ribbon", working: "rios-work-funding-ribbon" },
  "gold-medal": { idle: "rios-idle-gold-medal", working: "rios-work-gold-medal" },
  "thesis-stack": { idle: "rios-idle-thesis-stack", working: "rios-work-thesis-stack" },
  "defense-crown": { idle: "rios-idle-defense-crown", working: "rios-work-defense-crown" },
};

function getTodayKey(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function normalizeLogger(logger) {
  if (!logger || typeof logger !== "object") return console;
  return logger;
}

function normalizeNonNegativeInt(value, fallback = 0) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
}

function createDashboardBridge(options = {}) {
  const {
    config = {},
    env = process.env,
    isWin = process.platform === "win32",
    fsImpl = fs,
    pathImpl = path,
    spawnImpl = spawn,
    fetchImpl = typeof fetch === "function" ? fetch : null,
    openExternal = () => Promise.resolve(),
    updateSession = () => {},
    onQuickTaskDataChanged = () => {},
    logger = console,
    pollIntervalMs = 10000,
    watchDebounceMs = 120,
  } = options;

  const log = normalizeLogger(logger);
  const dashboardMode = !!config.dashboardMode;
  const workspaceRoot = config.workspaceRoot || process.cwd();
  const dashboardHostScript = config.dashboardHostScript || "";
  const dashboardStatePath = config.dashboardStatePath || "";
  const dashboardRuntimePath = config.dashboardRuntimePath || "";
  const dashboardThemePath = config.dashboardThemePath || "";
  const bundledPython = config.bundledPython || "";
  const sessionId = config.sessionId || DEFAULT_SESSION_ID;
  const petLookHints = config.petLookHints || DEFAULT_PET_LOOK_HINTS;
  const legacyProfile = config.legacyProfile && typeof config.legacyProfile === "object"
    ? config.legacyProfile
    : {};
  const rewardSignalCooldownMs = normalizeNonNegativeInt(
    config.rewardSignalCooldownMs ?? legacyProfile.rewardSignalCooldownMs,
    0
  );

  let pollTimer = null;
  let watchTimer = null;
  let fileWatchers = [];
  let cache = { workActive: null, rewardId: null, dominantLane: null, todayCompletedQuestCount: 0 };
  let lastRewardSignalAt = 0;
  let mutationChain = Promise.resolve();
  let rawStateCache = null;
  let lastQuickTaskSignature = null;

  function closeWatchers() {
    fileWatchers.forEach((watcher) => {
      try {
        if (watcher && typeof watcher.close === "function") watcher.close();
      } catch {}
    });
    fileWatchers = [];
  }

  function scheduleWatchSync() {
    if (watchTimer) clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      watchTimer = null;
      syncDashboardSignal();
    }, Math.max(30, Number(watchDebounceMs) || 120));
  }

  function watchDashboardFile(targetPath) {
    if (!targetPath || typeof fsImpl.watch !== "function") return;
    const normalizedPath = pathImpl.resolve(targetPath);
    const targetName = pathImpl.basename(normalizedPath);
    const watchDir = fsImpl.existsSync(pathImpl.dirname(normalizedPath))
      ? pathImpl.dirname(normalizedPath)
      : "";
    if (!watchDir) return;
    try {
      const watcher = fsImpl.watch(watchDir, { persistent: false }, (_eventType, filename) => {
        const changed = String(filename || "");
        if (!changed || changed === targetName || changed.endsWith(targetName)) {
          scheduleWatchSync();
        }
      });
      fileWatchers.push(watcher);
    } catch (err) {
      log.warn("GoWIN mode: failed to watch dashboard file:", err.message);
    }
  }

  function startFileWatchers() {
    closeWatchers();
    watchDashboardFile(dashboardStatePath);
    watchDashboardFile(dashboardRuntimePath);
  }

  function resolveDashboardPetLookHint(snapshot) {
    const look = petLookHints[snapshot.equippedPetLook] || petLookHints["deskpet-base"];
    return snapshot.workActive ? look.working : look.idle;
  }

  function commandExists(command) {
    if (!command || typeof command !== "string") return false;
    const hasPathSeparator = command.includes(pathImpl.sep) || command.includes("/") || command.includes("\\");
    if (hasPathSeparator) {
      try {
        return fsImpl.existsSync(command);
      } catch {
        return false;
      }
    }
    const pathValue = env.Path || env.PATH || "";
    if (!pathValue) return false;
    const lookupDirs = pathValue
      .split(pathImpl.delimiter)
      .map((item) => item.trim())
      .filter(Boolean);
    const extCandidates = isWin
      ? (env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
        .split(";")
        .map((ext) => String(ext || "").trim())
        .filter(Boolean)
      : [""];
    const lowerCommand = command.toLowerCase();
    const commandHasKnownExt = extCandidates.some((ext) => lowerCommand.endsWith(ext.toLowerCase()));

    for (const dir of lookupDirs) {
      const directCandidate = pathImpl.join(dir, command);
      try {
        if (fsImpl.existsSync(directCandidate)) return true;
      } catch {}
      if (isWin && !commandHasKnownExt) {
        for (const ext of extCandidates) {
          const candidate = pathImpl.join(dir, `${command}${ext}`);
          try {
            if (fsImpl.existsSync(candidate)) return true;
          } catch {}
        }
      }
    }
    return false;
  }

  function resolveDashboardPythonInvocation() {
    const explicitPython = env.GOWIN_DASHBOARD_PYTHON;
    if (explicitPython && fsImpl.existsSync(explicitPython)) {
      return { command: explicitPython, prefixArgs: [] };
    }
    if (bundledPython && fsImpl.existsSync(bundledPython)) {
      return { command: bundledPython, prefixArgs: [] };
    }
    if (isWin) {
      if (commandExists("python")) return { command: "python", prefixArgs: [] };
      if (commandExists("python3")) return { command: "python3", prefixArgs: [] };
      if (commandExists("py")) return { command: "py", prefixArgs: ["-3"] };
      return null;
    }
    if (commandExists("python3")) return { command: "python3", prefixArgs: [] };
    if (commandExists("python")) return { command: "python", prefixArgs: [] };
    return null;
  }

  function readDashboardRawState({ clone = true, strict = false } = {}) {
    try {
      if (!dashboardStatePath || !fsImpl.existsSync(dashboardStatePath)) {
        rawStateCache = null;
        return null;
      }
      const stat = fsImpl.statSync(dashboardStatePath);
      const key = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
      if (!rawStateCache || rawStateCache.key !== key) {
        const bytes = fsImpl.readFileSync(dashboardStatePath);
        const state = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
        if (!state || typeof state !== "object" || Array.isArray(state)) {
          throw new Error("state must be a JSON object");
        }
        rawStateCache = { key, state, revision: '"' + createHash("sha256").update(bytes).digest("hex") + '"' };
      }
      return clone ? structuredClone(rawStateCache.state) : rawStateCache.state;
    } catch (err) {
      log.warn("GoWIN mode: failed to read dashboard raw state:", err.message);
      if (strict) throw new Error("任务数据暂时无法读取，请打开仪表盘恢复后重试。", { cause: err });
      return rawStateCache ? structuredClone(rawStateCache.state) : null;
    }
  }

  function readDashboardRuntimeUrl() {
    try {
      if (!dashboardRuntimePath || !fsImpl.existsSync(dashboardRuntimePath)) return null;
      const runtime = JSON.parse(fsImpl.readFileSync(dashboardRuntimePath, "utf8"));
      if (runtime && typeof runtime.url === "string" && runtime.url) return runtime.url;
    } catch (err) {
      log.warn("GoWIN mode: failed to read dashboard runtime:", err.message);
    }
    return null;
  }

  function normalizeDashboardThemePayload(theme) {
    if (!theme || typeof theme !== "object") return null;
    const variant = String(theme.variant || "grid").trim().toLowerCase();
    return {
      id: String(theme.id || "").trim() || "clawd",
      name: String(theme.name || "").trim() || "Sprout Buddy",
      variant,
      pageStart: String(theme.pageStart || "").trim(),
      pageEnd: String(theme.pageEnd || "").trim(),
      pageGlow: String(theme.pageGlow || "").trim(),
      surfaceBg: String(theme.surfaceBg || "").trim(),
      surfaceStrongBg: String(theme.surfaceStrongBg || "").trim(),
      surfaceMutedBg: String(theme.surfaceMutedBg || "").trim(),
      surfaceBorder: String(theme.surfaceBorder || "").trim(),
      surfaceShadow: String(theme.surfaceShadow || "").trim(),
      textMain: String(theme.textMain || "").trim(),
      textMuted: String(theme.textMuted || "").trim(),
      accentStrong: String(theme.accentStrong || "").trim(),
      accentAlt: String(theme.accentAlt || "").trim(),
      accentMint: String(theme.accentMint || "").trim(),
      accentSky: String(theme.accentSky || "").trim(),
      accentPurple: String(theme.accentPurple || "").trim(),
      accentYellow: String(theme.accentYellow || "").trim(),
      accentCoral: String(theme.accentCoral || "").trim(),
      accentLime: String(theme.accentLime || "").trim(),
      chipBg: String(theme.chipBg || "").trim(),
      chipText: String(theme.chipText || "").trim(),
      idleButtonFrom: String(theme.idleButtonFrom || "").trim(),
      idleButtonTo: String(theme.idleButtonTo || "").trim(),
      activeButtonFrom: String(theme.activeButtonFrom || "").trim(),
      activeButtonTo: String(theme.activeButtonTo || "").trim(),
      scrollbarTrack: String(theme.scrollbarTrack || "").trim(),
      scrollbarThumb: String(theme.scrollbarThumb || "").trim(),
      modalBorder: String(theme.modalBorder || "").trim(),
      ornament: String(theme.ornament || "").trim(),
      preview: theme.preview && typeof theme.preview === "object" ? {
        swatches: Array.isArray(theme.preview.swatches) ? theme.preview.swatches.slice(0, 3).map((item) => String(item || "").trim()).filter(Boolean) : [],
        accent: String(theme.preview.accent || "").trim(),
        surface: String(theme.preview.surface || "").trim(),
      } : null,
    };
  }

  function readDashboardTheme() {
    try {
      if (!dashboardThemePath || !fsImpl.existsSync(dashboardThemePath)) return null;
      return normalizeDashboardThemePayload(JSON.parse(fsImpl.readFileSync(dashboardThemePath, "utf8")));
    } catch (err) {
      log.warn("GoWIN mode: failed to read dashboard theme:", err.message);
      return null;
    }
  }

  function setDashboardTheme(theme) {
    const normalized = normalizeDashboardThemePayload(theme);
    if (!normalized || !dashboardThemePath) return false;
    try {
      fsImpl.mkdirSync(pathImpl.dirname(dashboardThemePath), { recursive: true });
      writeJsonAtomic(dashboardThemePath, normalized, fsImpl);
      return true;
    } catch (err) {
      log.warn("GoWIN mode: failed to persist dashboard theme:", err.message);
      return false;
    }
  }

  function getQuickTaskPayload() {
    const todayKey = getQuickTaskTodayKey();
    const rawState = ensureDashboardState(readDashboardRawState(), todayKey);
    return buildQuickTaskSnapshot(rawState, todayKey);
  }

  function stateConflict() {
    const error = new Error("任务在另一窗口更新，请重试。");
    error.code = "STATE_CONFLICT";
    return error;
  }

  async function persistDashboardState(nextState, expectedRevision) {
    const runtimeUrl = readDashboardRuntimeUrl();
    if (runtimeUrl && typeof fetchImpl === "function") {
      let response;
      try {
        response = await fetchImpl(new URL("/api/state", runtimeUrl).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(expectedRevision ? { "If-Match": expectedRevision } : {}) },
          body: JSON.stringify(nextState),
          signal: AbortSignal.timeout(4000),
        });
      } catch (err) {
        if (err.name === "TimeoutError" || err.name === "AbortError") throw err;
        log.warn("GoWIN mode: dashboard unavailable, using local atomic save:", err.message);
      }
      if (response) {
        if (response.status === 409) throw stateConflict();
        if (!response.ok) throw new Error("任务保存失败，请重试。");
        rawStateCache = null;
        return;
      }
    }
    readDashboardRawState({ clone: false, strict: true });
    if ((rawStateCache && rawStateCache.revision) !== expectedRevision) throw stateConflict();
    fsImpl.mkdirSync(pathImpl.dirname(dashboardStatePath), { recursive: true });
    if (rawStateCache) writeJsonAtomic(dashboardStatePath + ".bak", rawStateCache.state, fsImpl);
    writeJsonAtomic(dashboardStatePath, nextState, fsImpl);
    rawStateCache = null;
  }

  function mutateDashboardState(mutator) {
    mutationChain = mutationChain.catch(() => {}).then(async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const todayKey = getQuickTaskTodayKey();
        const raw = readDashboardRawState({ strict: true });
        const expectedRevision = rawStateCache && rawStateCache.revision;
        const baseState = ensureDashboardState(raw, todayKey);
        const nextState = mutator(baseState) || baseState;
        try {
          await persistDashboardState(nextState, expectedRevision);
          syncDashboardSignal();
          return getQuickTaskPayload();
        } catch (err) {
          rawStateCache = null;
          if (err.code === "STATE_CONFLICT" && attempt < 2) continue;
          log.warn("GoWIN mode: quick-task mutation failed:", err.message);
          throw err;
        }
      }
    });
    return mutationChain;
  }

  function openDashboard() {
    if (!dashboardHostScript || !fsImpl.existsSync(dashboardHostScript)) {
      const runtimeUrl = readDashboardRuntimeUrl();
      if (runtimeUrl) {
        Promise.resolve(openExternal(runtimeUrl)).catch((err) => {
          log.warn("GoWIN mode: failed to open dashboard runtime url:", err.message);
        });
        return true;
      }
      log.warn("GoWIN mode: personal dashboard host not found:", dashboardHostScript);
      return false;
    }
    const py = resolveDashboardPythonInvocation();
    if (!py) {
      log.warn("GoWIN mode: python runtime not found for personal dashboard host");
      const runtimeUrl = readDashboardRuntimeUrl();
      if (runtimeUrl) {
        Promise.resolve(openExternal(runtimeUrl)).catch((err) => {
          log.warn("GoWIN mode: failed to open dashboard runtime url:", err.message);
        });
        return true;
      }
      return false;
    }
    const args = [
      ...py.prefixArgs,
      dashboardHostScript,
      "launch",
      "--workspace-root",
      workspaceRoot,
    ];
    if (dashboardStatePath) {
      args.push("--state-path", dashboardStatePath);
    }
    if (dashboardRuntimePath) {
      args.push("--runtime-path", dashboardRuntimePath);
    }
    if (dashboardThemePath) {
      args.push("--theme-path", dashboardThemePath);
    }
    try {
      const child = spawnImpl(py.command, args, {
        cwd: workspaceRoot,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: {
          ...env,
          PYTHONUTF8: "1",
        },
      });
      if (child && typeof child.on === "function") {
        child.on("error", (err) => {
          log.warn("GoWIN mode: dashboard host spawn failed:", err && err.message ? err.message : String(err));
        });
      }
      child.unref();
      return true;
    } catch (err) {
      log.warn("GoWIN mode: failed to open personal dashboard:", err.message);
      return false;
    }
  }

  function readDashboardStateSnapshot() {
    try {
      const raw = readDashboardRawState({ clone: false });
      if (!raw) return null;
      const todayKey = getTodayKey();
      const workSessions = (((raw || {}).workRecords || {})[todayKey] || {}).sessions || [];
      const workActive = workSessions.some((session) => session && session.start && !session.end);
      const gameState = (raw || {}).gameState || {};
      const rewardLogs = Array.isArray(gameState.rewardLogs) ? gameState.rewardLogs : [];
      const todayRewardLogs = rewardLogs.filter((item) => item && item.id && typeof item.date === "string" && item.date === todayKey);
      const latestReward = todayRewardLogs.find((item) => item && item.id) || rewardLogs.find((item) => item && item.id) || null;
      const equippedTitle = gameState.equippedTitle || "";
      const petCollection = (gameState || {}).petCollection || {};
      const equippedPetLook = typeof petCollection.equipped === "string" && petCollection.equipped
        ? petCollection.equipped
        : "deskpet-base";
      const completedMilestones = Array.isArray(raw.longTermMilestones)
        ? raw.longTermMilestones.filter((item) => item && (item.completed || item.complete || item.claimed)).length
        : 0;
      const laneCounts = { main: 0, side: 0, daily: 0, longterm: 0, bonus: 0, title: 0, weekly: 0 };
      const inferQuestLane = (item) => {
        if (!item) return "";
        if (typeof item.questLane === "string" && item.questLane) return item.questLane;
        const source = String(item.source || "");
        const questId = String(item.questId || "");
        const title = String(item.title || "");
        const merged = `${source} ${questId} ${title}`;
        if (/paper-output|academic-presence|experiment-sprint|milestone-push|论文|学术|实验|里程碑/.test(merged)) return "main";
        if (/body-charge|family-anchor|light-reset|desk-reset|身体|家庭|轻断|环境/.test(merged)) return "side";
        if (/daily-check-in|online-tier|off-before-22|micro-reset|reflection-loop|clock-in|reflection-note|文献|补水|收工|摸鱼|回路|在线/.test(merged)) return "daily";
        if (/proposal-defense|midterm-review|paper-accept|national-scholarship|annual-funding|thesis-draft|defense-clear|开题|中期|答辩|奖学金|毕业/.test(merged)) return "longterm";
        if (/weekly-settlement|周结算|满周|稳周/.test(merged)) return "weekly";
        if (/title-unlock|称号/.test(merged)) return "title";
        if (/loot-chest|宝箱/.test(merged)) return "bonus";
        return "";
      };
      todayRewardLogs.forEach((item) => {
        const lane = inferQuestLane(item);
        if (lane && laneCounts[lane] !== undefined) laneCounts[lane] += 1;
      });
      const dominantLane = ["main", "side", "daily"].reduce((best, lane) => {
        if ((laneCounts[lane] || 0) > (laneCounts[best] || 0)) return lane;
        return best;
      }, "");
      const latestRewardLane = inferQuestLane(latestReward);
      const todayCompletedQuestCount = todayRewardLogs.filter((item) => {
        const lane = inferQuestLane(item);
        return lane === "main" || lane === "side" || lane === "daily";
      }).length;
      const activeStreak = Number((((gameState || {}).checkIn || {}).streak) || 0);
      return {
        workActive,
        latestReward,
        latestRewardLane,
        equippedTitle,
        equippedPetLook,
        completedMilestones,
        laneCounts,
        dominantLane,
        todayCompletedQuestCount,
        activeStreak,
      };
    } catch (err) {
      log.warn("GoWIN mode: failed to read dashboard state:", err.message);
      return null;
    }
  }

  function syncDashboardSignal() {
    const snapshot = readDashboardStateSnapshot();
    if (!snapshot) {
      updateSession(
        sessionId,
        "idle",
        "DashboardIdle",
        null,
        workspaceRoot,
        null,
        null,
        null,
        "gowin-dashboard",
        "gowin-dashboard",
        true,
        null
      );
      cache = { workActive: false, rewardId: null, dominantLane: null, todayCompletedQuestCount: 0 };
      if (lastQuickTaskSignature !== "missing") {
        lastQuickTaskSignature = "missing";
        onQuickTaskDataChanged();
      }
      return;
    }

    const dashboardPoseHint = resolveDashboardPetLookHint(snapshot);
    if (snapshot.workActive) {
      updateSession(
        sessionId,
        "working",
        "DashboardWorkActive",
        null,
        workspaceRoot,
        null,
        null,
        null,
        "gowin-dashboard",
        "gowin-dashboard",
        true,
        dashboardPoseHint
      );
    } else {
      updateSession(
        sessionId,
        "idle",
        "DashboardIdle",
        null,
        workspaceRoot,
        null,
        null,
        null,
        "gowin-dashboard",
        "gowin-dashboard",
        true,
        dashboardPoseHint
      );
    }

    const nextRewardId = snapshot.latestReward && snapshot.latestReward.id;
    let rewardSignalSent = false;
    if (nextRewardId && nextRewardId !== cache.rewardId) {
      const now = Date.now();
      const cooldownSatisfied = rewardSignalCooldownMs <= 0 || (now - lastRewardSignalAt) >= rewardSignalCooldownMs;
      if (cooldownSatisfied) {
        let rewardLabel = snapshot.latestReward.title || snapshot.latestReward.lootLabel || "奖励到账";
        let rewardSession = "DashboardReward";
        if (snapshot.latestRewardLane === "main") {
          rewardLabel = `主线推进 · ${rewardLabel}`;
          rewardSession = "DashboardMainlineReward";
        } else if (snapshot.latestRewardLane === "side") {
          rewardLabel = `支线完成 · ${rewardLabel}`;
          rewardSession = "DashboardSideReward";
        } else if (snapshot.latestRewardLane === "daily") {
          rewardLabel = `日常清单 · ${rewardLabel}`;
          rewardSession = "DashboardDailyReward";
        } else if (snapshot.latestRewardLane === "longterm") {
          rewardLabel = `大节点推进 · ${rewardLabel}`;
          rewardSession = "DashboardLongtermReward";
        } else if (snapshot.latestRewardLane === "title") {
          rewardLabel = `称号到账 · ${rewardLabel}`;
          rewardSession = "DashboardTitleReward";
        } else if (snapshot.latestRewardLane === "weekly") {
          rewardLabel = `周结算到账 · ${rewardLabel}`;
          rewardSession = "DashboardWeeklyReward";
        }
        updateSession(
          sessionId,
          "attention",
          rewardSession,
          null,
          workspaceRoot,
          null,
          null,
          null,
          "gowin-dashboard",
          "gowin-dashboard",
          true,
          rewardLabel
        );
        lastRewardSignalAt = now;
        rewardSignalSent = true;
      }
    }

    const nextCachedRewardId = nextRewardId
      ? (rewardSignalSent ? nextRewardId : cache.rewardId)
      : null;

    cache = {
      workActive: snapshot.workActive,
      rewardId: nextCachedRewardId,
      dominantLane: snapshot.dominantLane || null,
      todayCompletedQuestCount: snapshot.todayCompletedQuestCount || 0,
    };
    const signature = [rawStateCache && rawStateCache.revision, getTodayKey(),
      snapshot.workActive ? Math.floor(Date.now() / 60000) : ""].join("|");
    if (signature !== lastQuickTaskSignature) {
      lastQuickTaskSignature = signature;
      onQuickTaskDataChanged();
    }
  }

  function startMonitor() {
    if (!dashboardMode || pollTimer) return;
    syncDashboardSignal();
    startFileWatchers();
    pollTimer = setInterval(syncDashboardSignal, pollIntervalMs);
  }

  function stopMonitor() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (watchTimer) {
      clearTimeout(watchTimer);
      watchTimer = null;
    }
    closeWatchers();
  }

  return {
    dashboardMode,
    workspaceRoot,
    sessionId,
    openDashboard,
    readDashboardRawState,
    readDashboardRuntimeUrl,
    readDashboardTheme,
    getQuickTaskPayload,
    mutateDashboardState,
    setQuickTaskQuest: (payload = {}) =>
      mutateDashboardState((state) => setQuestChecked(state, payload.id, !!payload.checked, getQuickTaskTodayKey())),
    setQuickTaskTodo: (payload = {}) =>
      mutateDashboardState((state) => setTodoChecked(state, payload.id, !!payload.checked, getQuickTaskTodayKey())),
    addQuickTaskTodo: (payload = {}) =>
      mutateDashboardState((state) => addCustomTodo(state, payload, getQuickTaskTodayKey())),
    claimQuickTaskTodo: (payload = {}) =>
      mutateDashboardState((state) => claimTempTodo(state, payload.id, getQuickTaskTodayKey())),
    toggleQuickTaskWorkClock: () =>
      mutateDashboardState((state) => toggleWorkClock(state, getQuickTaskTodayKey())),
    setDashboardTheme,
    syncDashboardSignal,
    startMonitor,
    stopMonitor,
  };
}

module.exports = {
  createDashboardBridge,
  getTodayKey,
};

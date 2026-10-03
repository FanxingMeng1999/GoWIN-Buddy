function getTodayKey(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function getWeekKey(now = new Date()) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return `WEEK:${getTodayKey(date)}`;
}

const { getLevelSnapshot } = require("./pet-level");

const CUSTOM_TEMP_TODO_CLAIM_QUEST_ID = "custom-temp-todo-claim";

function ensureObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : { ...fallback };
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function toTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function getDateKeyFromTimestamp(value) {
  const ts = toTimestamp(value);
  if (ts == null) return "";
  return getTodayKey(new Date(ts));
}

function getWeekKeyFromTimestamp(value) {
  const ts = toTimestamp(value);
  if (ts == null) return "";
  return getWeekKey(new Date(ts));
}

function normalizeTodoCadence(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "temporary";
  if (["daily", "day", "每天", "每日", "日常"].includes(value)) return "daily";
  if (["weekly", "week", "每周", "周常", "周任务"].includes(value)) return "weekly";
  if (["longterm", "long-term", "long_term", "长期", "主线", "里程碑"].includes(value)) return "longterm";
  if (["temporary", "temp", "once", "临时", "一次性"].includes(value)) return "temporary";
  return "temporary";
}

function getTodoCadence(task) {
  return normalizeTodoCadence(
    task?.cadence
      || task?.recurrence
      || task?.taskType
      || task?.type
      || task?.category
      || ""
  );
}

function getTodoCadenceLabel(cadence) {
  if (cadence === "daily") return "每日";
  if (cadence === "weekly") return "每周";
  if (cadence === "longterm") return "长期";
  return "临时";
}

function formatDeadlineLabel(timestamp) {
  const ts = toTimestamp(timestamp);
  if (ts == null) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `DDL ${month}-${day} ${hour}:${minute}`;
}

function resolveTodoDueAt(task, cadence) {
  if (cadence !== "temporary") return null;
  return toTimestamp(task?.dueAt);
}

function isTaskCompleted(task) {
  return String(task?.status || "") === "已完成";
}

function shouldResetTodoByCadence(task, cadence, todayKey, weekKey) {
  if (!isTaskCompleted(task)) return false;
  if (cadence === "daily") {
    const completedToday = getDateKeyFromTimestamp(task.completedAt);
    return completedToday && completedToday !== todayKey;
  }
  if (cadence === "weekly") {
    const completedWeek = getWeekKeyFromTimestamp(task.completedAt);
    return completedWeek && completedWeek !== weekKey;
  }
  return false;
}

function normalizeCustomTask(task, todayKey, weekKey) {
  if (!task || task.id == null) return;
  const cadence = getTodoCadence(task);
  task.cadence = cadence;
  task.dueAt = resolveTodoDueAt(task, cadence);
  task.source = task.source || "custom";
  task.quickTask = ensureObject(task.quickTask);

  if (shouldResetTodoByCadence(task, cadence, todayKey, weekKey)) {
    task.status = "未开始";
    task.completedAt = null;
    task.quickTask.struck = false;
    task.quickTask.cleaned = false;
    task.quickTask.cleanedAt = null;
    task.quickTask.cleanedByClaim = "";
  }

  if (isTaskCompleted(task)) {
    if (typeof task.completedAt !== "number") {
      task.completedAt = toTimestamp(task.completedAt) || Date.now();
    }
    task.quickTask.struck = true;
  } else {
    task.quickTask.struck = false;
    task.quickTask.cleaned = false;
    task.quickTask.cleanedAt = null;
    task.quickTask.cleanedByClaim = "";
  }
}

function getClaimedQuestIds(state) {
  return Object.keys(ensureObject(state.gameState?.questClaims?.claimed))
    .filter((id) => !!state.gameState.questClaims.claimed[id])
    .sort();
}

function getClaimVersion(state, todayKey, claimedIds) {
  const date = state.gameState?.questClaims?.date || todayKey;
  return `${date}|${claimedIds.join(",")}`;
}

function cleanupCompletedCustomTodosAfterClaim(state, claimVersion, options = {}) {
  const cadenceFilter = normalizeTodoCadence(options.cadence || "");
  const filterByCadence = !!options.cadence;
  const tasks = ensureArray(state.tasks);
  const now = Date.now();
  tasks.forEach((task) => {
    if (!task || task.id == null) return;
    if (String(task.source || "custom") === "system") return;
    const cadence = getTodoCadence(task);
    if (filterByCadence && cadence !== cadenceFilter) return;
    if (!isTaskCompleted(task)) return;
    task.quickTask = ensureObject(task.quickTask);
    if (!task.quickTask.struck || task.quickTask.cleaned) return;
    task.quickTask.cleaned = true;
    task.quickTask.cleanedAt = now;
    task.quickTask.cleanedByClaim = claimVersion;
  });
  state.gameState.quickTaskMeta.lastClaimVersion = claimVersion;
}

function ensureDashboardState(rawState, todayKey = getTodayKey()) {
  const state = rawState && typeof rawState === "object" ? rawState : {};
  state.tasks = ensureArray(state.tasks);
  state.workRecords = ensureObject(state.workRecords);
  state.reflectionRecords = ensureObject(state.reflectionRecords, state.mindRecords || {});
  state.gameState = ensureObject(state.gameState);

  state.gameState.questClaims = ensureObject(state.gameState.questClaims, { date: todayKey, claimed: {} });
  state.gameState.questClaims.claimed = ensureObject(state.gameState.questClaims.claimed);
  if (state.gameState.questClaims.date !== todayKey) {
    state.gameState.questClaims = { date: todayKey, claimed: {} };
  }

  state.gameState.questProgress = ensureObject(state.gameState.questProgress, { date: todayKey, progress: {} });
  state.gameState.questProgress.progress = ensureObject(state.gameState.questProgress.progress);
  if (state.gameState.questProgress.date !== todayKey) {
    state.gameState.questProgress = { date: todayKey, progress: {} };
  }

  state.gameState.dailyCounters = ensureObject(state.gameState.dailyCounters, { date: todayKey, microResets: 0 });
  if (state.gameState.dailyCounters.date !== todayKey) {
    state.gameState.dailyCounters = { date: todayKey, microResets: 0 };
  }

  const legacyMicro = Number(state.gameState.dailyCounters.woodfish) || 0;
  const currentMicro = Number(state.gameState.dailyCounters.microResets) || 0;
  state.gameState.dailyCounters.microResets = Math.max(0, legacyMicro, currentMicro);

  state.gameState.quickTaskMeta = ensureObject(state.gameState.quickTaskMeta, { lastClaimVersion: "" });
  if (typeof state.gameState.quickTaskMeta.lastClaimVersion !== "string") {
    state.gameState.quickTaskMeta.lastClaimVersion = "";
  }

  const weekKey = getWeekKey(new Date(`${todayKey}T00:00:00`));
  state.tasks.forEach((task) => normalizeCustomTask(task, todayKey, weekKey));

  const claimedIds = getClaimedQuestIds(state);
  if (claimedIds.length > 0) {
    const claimVersion = getClaimVersion(state, todayKey, claimedIds);
    if (state.gameState.quickTaskMeta.lastClaimVersion !== claimVersion) {
      if (claimedIds.includes(CUSTOM_TEMP_TODO_CLAIM_QUEST_ID)) {
        cleanupCompletedCustomTodosAfterClaim(state, claimVersion, { cadence: "temporary" });
      } else {
        state.gameState.quickTaskMeta.lastClaimVersion = claimVersion;
      }
    }
  }

  return state;
}

function normalizeWorkDayRecord(record) {
  if (!record) return { sessions: [] };
  if (Array.isArray(record.sessions)) return { sessions: record.sessions };
  const sessions = [];
  ["morning", "afternoon", "evening"].forEach((period) => {
    ensureArray(record[period]).forEach((seg) => {
      sessions.push({ ...seg, period });
    });
  });
  sessions.sort((a, b) => (a.start || 0) - (b.start || 0));
  return { sessions };
}

function getSessionDurationMinutes(session, nowTs = Date.now()) {
  const start = toTimestamp(session?.start);
  if (start == null) return 0;
  const end = session?.end ? toTimestamp(session.end) : nowTs;
  if (end == null || end <= start) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

function getTodayWorkStatus(state, todayKey) {
  const dayRecord = normalizeWorkDayRecord(state.workRecords?.[todayKey]);
  const sessions = ensureArray(dayRecord.sessions);
  const activeSession = sessions.find((session) => session && session.start && !session.end) || null;
  const completedSessions = sessions.filter((session) => session && session.start && session.end);
  const lastCompleted = completedSessions.length ? completedSessions[completedSessions.length - 1] : null;
  const lastCompletedDate = lastCompleted && lastCompleted.end ? new Date(lastCompleted.end) : null;
  const totalMinutes = sessions.reduce((sum, session) => sum + getSessionDurationMinutes(session), 0);
  return {
    hasClockIn: sessions.length > 0,
    active: !!activeSession,
    activeSessionStart: activeSession ? toTimestamp(activeSession.start) : null,
    completedCount: completedSessions.length,
    totalMinutes,
    lastCompletedHour: lastCompletedDate instanceof Date && !Number.isNaN(lastCompletedDate.getTime())
      ? lastCompletedDate.getHours() + (lastCompletedDate.getMinutes() / 60)
      : null,
  };
}

function hasReflectionToday(state, todayKey) {
  const record = state.reflectionRecords?.[todayKey] || state.mindRecords?.[todayKey];
  if (!record) return false;
  return !!(`${record.best || ""}`.trim() || `${record.improve || ""}`.trim() || `${record.note || ""}`.trim());
}

function getMicroResetCount(state) {
  return Math.max(0, Number(state.gameState?.dailyCounters?.microResets) || 0);
}

function getQuestProgressSnapshot(state, id, target = 1, options = {}) {
  const mode = options.mode || "manual";
  const claimed = !!state.gameState.questClaims.claimed[id];
  let progress = 0;
  if (mode === "auto") {
    progress = Math.max(0, Math.min(target, Number(options.autoProgress) || 0));
  } else {
    progress = Math.max(0, Math.min(target, Number(state.gameState.questProgress.progress[id]) || 0));
  }
  if (claimed) progress = target;
  const completed = claimed || progress >= target;
  return {
    target,
    progress,
    claimed,
    completed,
    progressLabel: `${progress} / ${target}`,
    progressValue: target > 0 ? Math.round((progress / target) * 100) : 0,
  };
}

const QUEST_DEFINITIONS = [
  { id: "priority-push", lane: "main", laneLabel: "主线", title: "核心任务推进", description: "今天推进一个最关键任务。", actionLabel: "记推进", mode: "manual", target: 1 },
  { id: "deep-focus", lane: "main", laneLabel: "主线", title: "专注冲刺", description: "完成至少一段高质量专注。", actionLabel: "记专注", mode: "manual", target: 1 },
  { id: "learn-input", lane: "daily", laneLabel: "日常", title: "学习输入", description: "吸收一条新知识并记录。", actionLabel: "记输入", mode: "manual", target: 1 },
  { id: "body-reset", lane: "life", laneLabel: "生活", title: "身体激活", description: "做一轮轻运动，恢复能量。", actionLabel: "记运动", mode: "manual", target: 1 },
  { id: "social-touch", lane: "life", laneLabel: "生活", title: "关系触达", description: "和重要的人进行一次联系。", actionLabel: "记连线", mode: "manual", target: 1 },
  { id: "space-reset", lane: "life", laneLabel: "生活", title: "环境整备", description: "整理关键工作区，降低摩擦。", actionLabel: "整环境", mode: "manual", target: 1 },
  {
    id: "daily-check-in",
    lane: "daily",
    laneLabel: "自动",
    title: "进入状态",
    description: "开始一次工作/学习会话。",
    mode: "auto",
    statusNote: "由会话记录自动推进。",
    resolveAutoProgress: ({ workStatus }) => (workStatus.hasClockIn ? 1 : 0),
  },
  {
    id: "online-tier-1",
    lane: "daily",
    laneLabel: "自动",
    title: "在线时长 I 档",
    description: "今日累计在线 30 分钟。",
    mode: "auto",
    target: 30,
    statusNote: "按今日累计在线时长自动推进。",
    resolveAutoProgress: ({ workStatus }) => workStatus.totalMinutes,
  },
  {
    id: "online-tier-2",
    lane: "daily",
    laneLabel: "自动",
    title: "在线时长 II 档",
    description: "今日累计在线 90 分钟。",
    mode: "auto",
    target: 90,
    statusNote: "按今日累计在线时长自动推进。",
    resolveAutoProgress: ({ workStatus }) => workStatus.totalMinutes,
  },
  {
    id: "online-tier-3",
    lane: "daily",
    laneLabel: "自动",
    title: "在线时长 III 档",
    description: "今日累计在线 180 分钟。",
    mode: "auto",
    target: 180,
    statusNote: "按今日累计在线时长自动推进。",
    resolveAutoProgress: ({ workStatus }) => workStatus.totalMinutes,
  },
  {
    id: "reflection-loop",
    lane: "daily",
    laneLabel: "自动",
    title: "反馈复盘",
    description: "写下一条复盘反馈。",
    mode: "auto",
    statusNote: "记录反思后自动完成。",
    resolveAutoProgress: ({ state, todayKey }) => (hasReflectionToday(state, todayKey) ? 1 : 0),
  },
  {
    id: "healthy-shutdown",
    lane: "daily",
    laneLabel: "自动",
    title: "健康收工",
    description: "在夜间过晚前完成收工。",
    mode: "auto",
    statusNote: "由最后收工时间自动判定。",
    resolveAutoProgress: ({ workStatus }) => (!workStatus.active && workStatus.lastCompletedHour !== null && workStatus.lastCompletedHour < 23 ? 1 : 0),
  },
  {
    id: "micro-reset",
    lane: "daily",
    laneLabel: "自动",
    title: "微复位",
    description: "完成一次低成本状态复位。",
    mode: "auto",
    statusNote: "任一微复位动作会自动推进。",
    resolveAutoProgress: ({ microResets }) => (microResets > 0 ? 1 : 0),
  },
];

function sortDoneLast(items) {
  return items.slice().sort((a, b) => {
    if (!!a.checked !== !!b.checked) return a.checked ? 1 : -1;
    return (a.displayOrder || 0) - (b.displayOrder || 0);
  });
}

function buildQuestItems(state, todayKey = getTodayKey()) {
  ensureDashboardState(state, todayKey);
  const workStatus = getTodayWorkStatus(state, todayKey);
  const microResets = getMicroResetCount(state);
  const items = QUEST_DEFINITIONS.map((quest, index) => {
    const snapshot = getQuestProgressSnapshot(
      state,
      quest.id,
      quest.target || 1,
      quest.mode === "auto"
        ? {
            mode: "auto",
            autoProgress: quest.resolveAutoProgress
              ? quest.resolveAutoProgress({ state, todayKey, workStatus, microResets })
              : 0,
          }
        : { mode: "manual" }
    );
    return {
      kind: "quest",
      id: quest.id,
      lane: quest.lane,
      laneLabel: quest.laneLabel,
      title: quest.title,
      description: quest.description,
      actionLabel: quest.actionLabel || "",
      mode: quest.mode,
      checked: snapshot.completed,
      claimed: snapshot.claimed,
      progressLabel: snapshot.progressLabel,
      progressValue: snapshot.progressValue,
      target: snapshot.target,
      statusNote: quest.statusNote || "",
      canToggle: quest.mode === "manual" && !snapshot.claimed,
      displayOrder: index,
    };
  });
  return {
    manual: sortDoneLast(items.filter((item) => item.mode === "manual" && !item.claimed)),
    auto: sortDoneLast(items.filter((item) => item.mode === "auto" && !item.claimed)),
  };
}

function buildTodoItemHint(item) {
  if (item.checked) return "已勾选，领奖后会清理";
  if (item.cadence === "daily") return "每日刷新";
  if (item.cadence === "weekly") return "每周刷新";
  if (item.cadence === "longterm") return "长期保留";
  return "一次性任务";
}

function buildTodoItems(state, todayKey = getTodayKey()) {
  ensureDashboardState(state, todayKey);
  const groupSpec = [
    { key: "daily", label: "每日任务" },
    { key: "weekly", label: "每周任务" },
    { key: "longterm", label: "长期任务" },
    { key: "temporary", label: "临时任务" },
  ];
  const buckets = {
    daily: [],
    weekly: [],
    longterm: [],
    temporary: [],
  };

  ensureArray(state.tasks).forEach((task) => {
    if (!task || task.id == null) return;
    const cadence = getTodoCadence(task);
    const quickTask = ensureObject(task.quickTask);
    const checked = isTaskCompleted(task);
    const dueAt = resolveTodoDueAt(task, cadence);
    const dueLabel = formatDeadlineLabel(dueAt);
    const isOverdue = !checked && dueAt != null && dueAt < Date.now();
    if (checked && quickTask.cleaned) return;
    const normalizedStatus = checked ? "已完成" : (task.status === "进行中" ? "进行中" : "未开始");
    buckets[cadence].push({
      kind: "todo",
      id: task.id,
      title: task.name || "未命名待办",
      status: normalizedStatus,
      checked,
      struck: checked,
      cadence,
      cadenceLabel: getTodoCadenceLabel(cadence),
      hint: buildTodoItemHint({ checked, cadence }),
      dueAt,
      dueLabel,
      isOverdue,
      canToggle: !quickTask.cleaned,
      completedAt: toTimestamp(task.completedAt) || 0,
    });
  });

  const statusOrder = { "进行中": 0, "未开始": 1, "已完成": 2 };
  Object.keys(buckets).forEach((key) => {
    buckets[key].sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      if (!a.checked && !b.checked) {
        const statusDelta = (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1);
        if (statusDelta !== 0) return statusDelta;
        const aDue = a.dueAt == null ? Number.MAX_SAFE_INTEGER : a.dueAt;
        const bDue = b.dueAt == null ? Number.MAX_SAFE_INTEGER : b.dueAt;
        if (aDue !== bDue) return aDue - bDue;
        return String(a.title || "").localeCompare(String(b.title || ""), "zh-Hans-CN");
      }
      return (a.completedAt || 0) - (b.completedAt || 0);
    });
  });

  const groups = groupSpec
    .map((meta) => ({
      key: meta.key,
      label: meta.label,
      items: buckets[meta.key],
    }))
    .filter((group) => group.items.length > 0);

  return {
    groups,
    flat: groups.flatMap((group) => group.items),
  };
}

function buildQuickTaskSnapshot(rawState, todayKey = getTodayKey()) {
  const state = ensureDashboardState(rawState, todayKey);
  const questItems = buildQuestItems(state, todayKey);
  const todoItems = buildTodoItems(state, todayKey);
  const workStatus = getTodayWorkStatus(state, todayKey);
  const levelStats = getLevelSnapshot(state.gameState && state.gameState.xp);
  return {
    todayKey,
    summary: {
      manualPending: questItems.manual.filter((item) => !item.checked).length,
      autoPending: questItems.auto.filter((item) => !item.checked).length,
      todosPending: todoItems.flat.filter((item) => !item.checked).length,
      claimableManual: questItems.manual.filter((item) => item.checked).length,
    },
    todoGroups: todoItems.groups,
    todos: todoItems.flat,
    manualQuests: questItems.manual,
    autoQuests: questItems.auto,
    workStatus: {
      active: !!workStatus.active,
      hasClockIn: !!workStatus.hasClockIn,
      totalMinutes: Math.max(0, Number(workStatus.totalMinutes) || 0),
      completedCount: Math.max(0, Number(workStatus.completedCount) || 0),
      activeSessionStart: workStatus.activeSessionStart || null,
    },
    levelStats,
    empty:
      questItems.manual.filter((item) => !item.checked).length === 0 &&
      questItems.auto.filter((item) => !item.checked).length === 0 &&
      todoItems.flat.filter((item) => !item.checked).length === 0,
  };
}

function setQuestChecked(rawState, questId, checked, todayKey = getTodayKey()) {
  const state = ensureDashboardState(rawState, todayKey);
  const quest = QUEST_DEFINITIONS.find((item) => item.id === questId);
  if (!quest || quest.mode !== "manual") return state;
  if (state.gameState.questClaims.claimed[questId]) return state;
  state.gameState.questProgress.progress[questId] = checked ? (quest.target || 1) : 0;
  return state;
}

function setTodoChecked(rawState, taskId, checked, todayKey = getTodayKey()) {
  const state = ensureDashboardState(rawState, todayKey);
  const task = ensureArray(state.tasks).find((item) => String(item.id) === String(taskId));
  if (!task) return state;
  task.quickTask = ensureObject(task.quickTask);
  task.cadence = getTodoCadence(task);
  if (checked) {
    task.quickTask.prevStatus = task.status === "进行中" ? "进行中" : "未开始";
    task.status = "已完成";
    task.completedAt = Date.now();
    task.quickTask.struck = true;
    task.quickTask.cleaned = false;
    task.quickTask.cleanedAt = null;
    task.quickTask.cleanedByClaim = "";
  } else {
    task.status = task.quickTask.prevStatus === "进行中" ? "进行中" : "未开始";
    task.completedAt = null;
    task.quickTask.struck = false;
    task.quickTask.cleaned = false;
    task.quickTask.cleanedAt = null;
    task.quickTask.cleanedByClaim = "";
  }
  return state;
}

function createTaskId(tasks) {
  const existing = new Set(ensureArray(tasks).map((item) => String(item?.id)));
  let attempt = 0;
  while (attempt < 8) {
    const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    if (!existing.has(id)) return id;
    attempt += 1;
  }
  return `custom-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function claimTempTodo(rawState, taskId, todayKey = getTodayKey()) {
  const state = ensureDashboardState(rawState, todayKey);
  const task = ensureArray(state.tasks).find((item) => item && String(item.id) === String(taskId));
  if (!task) return state;
  if (getTodoCadence(task) !== "temporary") return state;
  if (!isTaskCompleted(task)) return state;
  task.quickTask = ensureObject(task.quickTask);
  if (task.quickTask.cleaned) return state;
  task.quickTask.struck = true;
  task.quickTask.cleaned = true;
  task.quickTask.cleanedAt = Date.now();
  task.quickTask.cleanedByClaim = "quick-task-panel";
  return state;
}

function formatLocalDateTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function toggleWorkClock(rawState, todayKey = getTodayKey(), nowTs = Date.now()) {
  const state = ensureDashboardState(rawState, todayKey);
  state.workRecords = ensureObject(state.workRecords);
  const dayRecord = ensureObject(state.workRecords[todayKey], { sessions: [] });
  state.workRecords[todayKey] = dayRecord;
  if (!Array.isArray(dayRecord.sessions)) dayRecord.sessions = [];
  const sessions = dayRecord.sessions;
  const activeIndex = sessions.findIndex((session) => session && session.start && session.end == null);
  if (activeIndex >= 0) {
    const session = sessions[activeIndex];
    const startTs = toTimestamp(session.start) || nowTs;
    const endTs = nowTs > startTs ? nowTs : startTs + 1;
    session.end = endTs;
    session.endTimeStr = formatLocalDateTime(endTs);
    session.duration = Math.max(0, Math.floor((endTs - startTs) / 60000));
  } else {
    sessions.push({
      start: nowTs,
      end: null,
      startTimeStr: formatLocalDateTime(nowTs),
      endTimeStr: null,
      duration: 0,
    });
  }
  return state;
}

function addCustomTodo(rawState, payload = {}, todayKey = getTodayKey()) {
  const state = ensureDashboardState(rawState, todayKey);
  const name = String(payload.name || "").trim();
  if (!name) return state;
  const cadence = normalizeTodoCadence(payload.cadence);
  const dueAt = cadence === "temporary" ? toTimestamp(payload.deadlineAt) : null;
  const now = Date.now();
  const task = {
    id: createTaskId(state.tasks),
    name,
    status: "未开始",
    source: "custom",
    cadence,
    dueAt,
    createdAt: now,
    completedAt: null,
    quickTask: {
      struck: false,
      cleaned: false,
      cleanedAt: null,
      cleanedByClaim: "",
      prevStatus: "未开始",
    },
  };
  state.tasks.unshift(task);
  return state;
}

module.exports = {
  addCustomTodo,
  buildQuickTaskSnapshot,
  claimTempTodo,
  ensureDashboardState,
  getTodayKey,
  setQuestChecked,
  setTodoChecked,
  toggleWorkClock,
};

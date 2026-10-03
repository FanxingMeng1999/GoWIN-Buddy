const summaryEl = document.getElementById("summary");
const manualListEl = document.getElementById("manualList");
const autoListEl = document.getElementById("autoList");
const todoListEl = document.getElementById("todoList");
const allDoneEl = document.getElementById("allDone");
const closeBtn = document.getElementById("closeBtn");
const clockBtn = document.getElementById("clockBtn");
const clockBtnLabel = document.getElementById("clockBtnLabel");
const todoInputEl = document.getElementById("todoInput");
const todoCadenceEl = document.getElementById("todoCadence");
const todoDeadlineEl = document.getElementById("todoDeadline");
const todoAddBtn = document.getElementById("todoAddBtn");
const todoAddHintEl = document.getElementById("todoAddHint");
const panelEl = document.querySelector(".panel");

let latestPayload = null;
let busyIds = new Set();
let addingTodo = false;
let togglingClock = false;

function normalizePanelTheme(theme = {}) {
  const raw = theme && typeof theme === "object" ? theme : {};
  const variant = String(raw.variant || "grid").trim().toLowerCase();
  const allowedVariants = new Set(["grid", "night", "milk", "lab", "soda", "paper", "aurora", "cocoa"]);
  return {
    variant: allowedVariants.has(variant) ? variant : "grid",
    panelBg: String(raw.panelBg || "rgba(255, 252, 247, 0.96)").trim(),
    panelBorder: String(raw.panelBorder || "rgba(253, 186, 116, 0.32)").trim(),
    panelShadow: String(raw.panelShadow || "0 18px 44px rgba(249, 115, 22, 0.16)").trim(),
    summaryBg: String(raw.summaryBg || "rgba(255,255,255,0.72)").trim(),
    itemBg: String(raw.itemBg || "rgba(255,255,255,0.84)").trim(),
    itemDoneBg: String(raw.itemDoneBg || "rgba(245, 248, 251, 0.92)").trim(),
    inputBg: String(raw.inputBg || "rgba(255,255,255,0.9)").trim(),
    textMain: String(raw.textMain || "#24324a").trim(),
    textMuted: String(raw.textMuted || "#7a889d").trim(),
    line: String(raw.line || "rgba(148, 163, 184, 0.18)").trim(),
    chipBg: String(raw.chipBg || "rgba(255, 237, 213, 0.9)").trim(),
    chipText: String(raw.chipText || "#ea580c").trim(),
    success: String(raw.success || "#10b981").trim(),
    closeBg: String(raw.closeBg || "rgba(255,255,255,0.84)").trim(),
    closeText: String(raw.closeText || "#fb7185").trim(),
    scrollThumb: String(raw.scrollThumb || "rgba(251, 146, 60, 0.26)").trim(),
    autoDot: String(raw.autoDot || "#a855f7").trim(),
    autoDotGlow: String(raw.autoDotGlow || "rgba(168, 85, 247, 0.12)").trim(),
  };
}

function applyTheme(theme) {
  if (!panelEl) return;
  const resolved = normalizePanelTheme(theme);
  panelEl.className = `panel variant-${resolved.variant}`;
  const mapping = {
    "--panel-bg": resolved.panelBg,
    "--panel-border": resolved.panelBorder,
    "--panel-shadow": resolved.panelShadow,
    "--summary-bg": resolved.summaryBg,
    "--item-bg": resolved.itemBg,
    "--item-done-bg": resolved.itemDoneBg,
    "--input-bg": resolved.inputBg,
    "--text-main": resolved.textMain,
    "--text-muted": resolved.textMuted,
    "--line": resolved.line,
    "--chip": resolved.chipBg,
    "--chip-text": resolved.chipText,
    "--success": resolved.success,
    "--close-bg": resolved.closeBg,
    "--close-text": resolved.closeText,
    "--scroll-thumb": resolved.scrollThumb,
    "--auto-dot": resolved.autoDot,
    "--auto-dot-glow": resolved.autoDotGlow,
  };
  Object.entries(mapping).forEach(([key, value]) => panelEl.style.setProperty(key, value));
}

function escapeHtml(text) {
  return String(text || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

function renderSummary(summary) {
  const cards = [
    { label: "待勾日常", value: summary?.manualPending ?? 0 },
    { label: "自动待完成", value: summary?.autoPending ?? 0 },
    { label: "待办项", value: summary?.todosPending ?? 0 },
  ];
  summaryEl.innerHTML = cards.map((card) => `
    <div class="summary-card">
      <div class="summary-label">${escapeHtml(card.label)}</div>
      <div class="summary-value">${escapeHtml(card.value)}</div>
    </div>
  `).join("");
}

function renderManualItem(item) {
  const checked = item.checked ? "checked" : "";
  const disabled = item.canToggle ? "" : "disabled";
  const itemClass = item.checked ? "item is-done" : "item";
  const progressText = item.checked ? "已勾选，领奖后会清理" : `待完成 · ${item.progressLabel}`;
  return `
    <div class="${itemClass}">
      <input class="item-checkbox" type="checkbox" data-kind="quest" data-id="${escapeHtml(item.id)}" ${checked} ${disabled}>
      <div class="item-body">
        <div class="item-title-row">
          <div class="item-title">${escapeHtml(item.title)}</div>
          <span class="item-chip">${escapeHtml(item.laneLabel)}</span>
        </div>
        <div class="item-desc">${escapeHtml(item.description)}</div>
        <div class="item-meta">
          <span class="${item.checked ? "done-label" : "item-progress"}">${escapeHtml(progressText)}</span>
          <span>${escapeHtml(item.actionLabel || "勾选完成")}</span>
        </div>
      </div>
    </div>
  `;
}

function renderAutoItem(item) {
  const itemClass = item.checked ? "item item-auto is-done" : "item item-auto";
  return `
    <div class="${itemClass}">
      <div class="item-body">
        <div class="item-title-row">
          <div class="item-title">${escapeHtml(item.title)}</div>
          <span class="item-chip">${escapeHtml(item.laneLabel)}</span>
        </div>
        <div class="item-desc">${escapeHtml(item.description)}</div>
        <div class="item-meta">
          <span class="${item.checked ? "done-label" : "item-progress"}">${item.checked ? "已完成，领奖后会清理" : `进行中 · ${escapeHtml(item.progressLabel)}`}</span>
          <span>${escapeHtml(item.statusNote || "")}</span>
        </div>
      </div>
    </div>
  `;
}

function renderTodoItem(item) {
  const checked = item.checked ? "checked" : "";
  const disabled = item.canToggle ? "" : "disabled";
  const itemClass = item.checked ? "item is-done" : "item";
  const statusText = item.checked ? "已完成" : (item.isOverdue ? "已逾期" : (item.status === "进行中" ? "进行中" : "未开始"));
  const dueText = item.dueLabel
    ? `<span class="item-due ${item.isOverdue ? "is-overdue" : ""}">${escapeHtml(item.dueLabel)}</span>`
    : "";
  const isClaimable = item.checked && item.cadence === "temporary";
  const claimBtn = isClaimable
    ? `<button class="item-claim" data-action="claim-todo" data-id="${escapeHtml(item.id)}" type="button">收起</button>`
    : "";
  const hintText = isClaimable ? "点右侧收起已完成待办" : (item.hint || "勾选后会同步记为已完成");
  return `
    <div class="${itemClass}">
      <input class="item-checkbox" type="checkbox" data-kind="todo" data-id="${escapeHtml(item.id)}" ${checked} ${disabled}>
      <div class="item-body">
        <div class="item-title-row">
          <div class="item-title">${escapeHtml(item.title)}</div>
          <span class="item-chip">${escapeHtml(item.cadenceLabel || "待办")}</span>
        </div>
        <div class="item-meta">
          <span class="${item.checked ? "done-label" : "item-progress"}">${escapeHtml(statusText)}</span>
          <span>${escapeHtml(hintText)}</span>
          ${dueText}
        </div>
      </div>
      ${claimBtn}
    </div>
  `;
}

function renderTodoGroups(groups, todos) {
  const normalizedGroups = Array.isArray(groups) && groups.length
    ? groups
    : (Array.isArray(todos) && todos.length ? [{ key: "all", label: "自定义待办", items: todos }] : []);
  if (!normalizedGroups.length) {
    return `<div class="empty">没有待处理的自定义待办。</div>`;
  }
  return normalizedGroups.map((group) => `
    <div class="todo-group">
      <div class="todo-group-head">
        <div class="todo-group-title">${escapeHtml(group.label || "待办")}</div>
        <div class="todo-group-count">${escapeHtml((group.items || []).length)}</div>
      </div>
      <div class="list">
        ${(group.items || []).map(renderTodoItem).join("")}
      </div>
    </div>
  `).join("");
}

function bindItemActions() {
  document.querySelectorAll(".item-checkbox").forEach((input) => {
    input.addEventListener("change", async () => {
      const id = input.dataset.id;
      const kind = input.dataset.kind;
      const busyKey = `${kind}:${id}`;
      if (busyIds.has(busyKey)) return;
      busyIds.add(busyKey);
      input.disabled = true;
      try {
        if (kind === "quest") {
          latestPayload = await window.quickTasksAPI.setQuestChecked(id, !!input.checked);
        } else {
          latestPayload = await window.quickTasksAPI.setTodoChecked(id, !!input.checked);
        }
        render(latestPayload);
      } catch (error) {
        input.checked = !input.checked;
        input.disabled = false;
        setTodoAddHint("保存失败，原有任务已保留，请重试。", true);
      } finally {
        busyIds.delete(busyKey);
      }
    });
  });
  document.querySelectorAll('.item-claim[data-action="claim-todo"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const busyKey = `claim:${id}`;
      if (busyIds.has(busyKey)) return;
      busyIds.add(busyKey);
      btn.disabled = true;
      btn.textContent = "收起中…";
      try {
        latestPayload = await window.quickTasksAPI.claimTodo(id);
        render(latestPayload);
      } catch (error) {
        btn.disabled = false;
        btn.textContent = "收起";
        setTodoAddHint("收起未保存，请重试。", true);
      } finally {
        busyIds.delete(busyKey);
      }
    });
  });
}

function formatWorkDuration(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  if (minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours <= 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h${remainder}m`;
}

function renderClockButton(workStatus) {
  if (!clockBtn || !clockBtnLabel) return;
  const status = workStatus && typeof workStatus === "object" ? workStatus : {};
  const active = !!status.active;
  clockBtn.classList.toggle("is-active", active);
  if (active) {
    clockBtnLabel.textContent = `已上班 · ${formatWorkDuration(status.totalMinutes)}`;
    clockBtn.title = "点击下班打卡";
  } else if (status.hasClockIn) {
    clockBtnLabel.textContent = `已下班 · ${formatWorkDuration(status.totalMinutes)}`;
    clockBtn.title = "再次上班打卡";
  } else {
    clockBtnLabel.textContent = "上班打卡";
    clockBtn.title = "点击上班打卡";
  }
  if (!togglingClock) {
    clockBtn.disabled = false;
  }
}

async function handleClockToggle() {
  if (!clockBtn || togglingClock) return;
  togglingClock = true;
  clockBtn.disabled = true;
  try {
    latestPayload = await window.quickTasksAPI.toggleClock();
    render(latestPayload);
  } catch (error) {
    setTodoAddHint("打卡未保存，请重试。", true);
  } finally {
    togglingClock = false;
    if (clockBtn) clockBtn.disabled = false;
  }
}

function setTodoAddHint(text, isError = false) {
  if (!todoAddHintEl) return;
  todoAddHintEl.textContent = text || "";
  todoAddHintEl.classList.toggle("error", !!isError);
}

function syncTodoDeadlineInput() {
  if (!todoCadenceEl || !todoDeadlineEl) return;
  const isTemporary = String(todoCadenceEl.value || "temporary") === "temporary";
  todoDeadlineEl.disabled = !isTemporary;
  todoDeadlineEl.classList.toggle("is-hidden", !isTemporary);
  todoDeadlineEl.title = isTemporary ? "可选：给临时任务设置截止时间" : "仅临时任务支持 DDL";
  if (!isTemporary && todoDeadlineEl.value) {
    todoDeadlineEl.value = "";
  }
}

function parseTodoDeadline(cadence) {
  if (cadence !== "temporary" || !todoDeadlineEl) return { value: null };
  const rawValue = String(todoDeadlineEl.value || "").trim();
  if (!rawValue) return { value: null };
  const ts = Date.parse(rawValue);
  if (!Number.isFinite(ts)) {
    return {
      error: "DDL 时间无效，请重新选择。",
    };
  }
  return { value: ts };
}

async function submitTodoQuickAdd() {
  if (addingTodo) return;
  const name = String(todoInputEl?.value || "").trim();
  const cadence = String(todoCadenceEl?.value || "temporary");
  if (!name) {
    setTodoAddHint("先写一个待办名称。", true);
    todoInputEl?.focus();
    return;
  }
  const deadline = parseTodoDeadline(cadence);
  if (deadline.error) {
    setTodoAddHint(deadline.error, true);
    todoDeadlineEl?.focus();
    return;
  }
  addingTodo = true;
  if (todoAddBtn) todoAddBtn.disabled = true;
  try {
    latestPayload = await window.quickTasksAPI.addTodo(name, cadence, deadline.value);
    render(latestPayload);
    if (todoInputEl) todoInputEl.value = "";
    if (todoDeadlineEl) todoDeadlineEl.value = "";
    setTodoAddHint("已添加到对应分类。");
    todoInputEl?.focus();
  } catch (error) {
    setTodoAddHint("添加未保存，输入内容已保留，请重试。", true);
  } finally {
    addingTodo = false;
    if (todoAddBtn) todoAddBtn.disabled = false;
  }
}

function bindQuickAddActions() {
  if (!todoAddBtn || !todoInputEl || !todoCadenceEl || !todoDeadlineEl) return;
  todoAddBtn.addEventListener("click", () => submitTodoQuickAdd());
  todoInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitTodoQuickAdd();
    }
  });
  todoDeadlineEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitTodoQuickAdd();
    }
  });
  todoCadenceEl.addEventListener("change", () => setTodoAddHint(""));
  todoCadenceEl.addEventListener("change", () => syncTodoDeadlineInput());
  syncTodoDeadlineInput();
}

function render(payload) {
  latestPayload = payload || { summary: {}, todoGroups: [], manualQuests: [], autoQuests: [], todos: [], empty: true };
  applyTheme(latestPayload.theme);
  renderSummary(latestPayload.summary || {});
  renderClockButton(latestPayload.workStatus || {});
  todoListEl.innerHTML = renderTodoGroups(latestPayload.todoGroups, latestPayload.todos);
  manualListEl.innerHTML = latestPayload.manualQuests?.length
    ? latestPayload.manualQuests.map(renderManualItem).join("")
    : `<div class="empty">当前没有需要手动勾选的日常/生活任务。</div>`;
  autoListEl.innerHTML = latestPayload.autoQuests?.length
    ? latestPayload.autoQuests.map(renderAutoItem).join("")
    : `<div class="empty">自动联动任务这会儿都已经清掉了。</div>`;
  allDoneEl.hidden = !latestPayload.empty;
  bindItemActions();
}

async function refresh() {
  try {
    const payload = await window.quickTasksAPI.getData();
    render(payload);
  } catch {
    setTodoAddHint("任务暂时无法读取，请重新打开面板。", true);
  }
}

document.body.addEventListener("mouseenter", () => window.quickTasksAPI.hoverPanel(true));
document.body.addEventListener("mouseleave", () => window.quickTasksAPI.hoverPanel(false));
window.addEventListener("blur", () => window.quickTasksAPI.hoverPanel(false));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) window.quickTasksAPI.hoverPanel(false);
});
closeBtn.addEventListener("click", () => window.quickTasksAPI.closePanel());
if (clockBtn) clockBtn.addEventListener("click", () => handleClockToggle());
window.quickTasksAPI.onDataUpdate((payload) => render(payload));
bindQuickAddActions();
refresh();

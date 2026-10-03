const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("quickTasksAPI", {
  getData: () => ipcRenderer.invoke("quick-task:get-data"),
  setQuestChecked: (id, checked) => ipcRenderer.invoke("quick-task:set-quest", { id, checked }),
  setTodoChecked: (id, checked) => ipcRenderer.invoke("quick-task:set-todo", { id, checked }),
  addTodo: (name, cadence, deadlineAt) => ipcRenderer.invoke("quick-task:add-todo", { name, cadence, deadlineAt }),
  claimTodo: (id) => ipcRenderer.invoke("quick-task:claim-todo", { id }),
  toggleClock: () => ipcRenderer.invoke("quick-task:toggle-clock"),
  closePanel: () => ipcRenderer.send("quick-task:close"),
  hoverPanel: (inside) => ipcRenderer.send("quick-task:hover-panel", !!inside),
  onDataUpdate: (callback) => ipcRenderer.on("quick-task:data", (_, payload) => callback(payload)),
});

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petReminderAPI", {
  onShow: (callback) => ipcRenderer.on("pet-reminder:show", (_event, payload) => callback(payload || {})),
  onHide: (callback) => ipcRenderer.on("pet-reminder:hide", () => callback()),
});

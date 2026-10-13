const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("paperReviewer", Object.freeze({
  selectPdf: () => ipcRenderer.invoke("paper:select"),
  startReview: (options) => ipcRenderer.invoke("paper:start", options),
  saveResult: (kind) => ipcRenderer.invoke("paper:save", kind),
  savePdfReport: () => ipcRenderer.invoke("paper:pdf-report"),
  hasStoredApiKey: () => ipcRenderer.invoke("key:has"),
  deleteStoredApiKey: () => ipcRenderer.invoke("key:delete"),
  clearReviewData: () => ipcRenderer.invoke("paper:clear"),
  onProgress: (callback) => {
    if (typeof callback !== "function") throw new TypeError("A callback is required");
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("paper:progress", listener);
    return () => ipcRenderer.removeListener("paper:progress", listener);
  },
}));

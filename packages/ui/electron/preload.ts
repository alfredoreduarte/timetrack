import { contextBridge, ipcRenderer } from "electron";

// Define the API interface
export interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  minimizeToTray: () => Promise<void>;
  showWindow: () => Promise<void>;
  onStartTimer: (callback: () => void) => void;
  onStopTimer: (callback: () => void) => void;
  onNewProject: (callback: () => void) => void;
  removeAllListeners: (channel: string) => void;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  minimizeToTray: () => ipcRenderer.invoke("minimize-to-tray"),
  showWindow: () => ipcRenderer.invoke("show-window"),
  onStartTimer: (callback: () => void) => {
    ipcRenderer.on("start-timer", callback);
  },
  onStopTimer: (callback: () => void) => {
    ipcRenderer.on("stop-timer", callback);
  },
  onNewProject: (callback: () => void) => {
    ipcRenderer.on("new-project", callback);
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

// Type declaration for the global window object
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

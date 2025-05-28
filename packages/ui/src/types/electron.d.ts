// Electron API interface for renderer process
export interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  minimizeToTray: () => Promise<void>;
  showWindow: () => Promise<void>;
  onStartTimer: (callback: () => void) => void;
  onStopTimer: (callback: () => void) => void;
  onNewProject: (callback: () => void) => void;
  removeAllListeners: (channel: string) => void;
}

// Extend the global Window interface
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};

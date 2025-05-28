import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  ipcMain,
  shell,
} from "electron";
import * as path from "path";
import { isDev } from "./utils";

class TimeTrackApp {
  private mainWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;

  constructor() {
    this.setupApp();
  }

  private setupApp(): void {
    // Handle app ready
    app.whenReady().then(() => {
      this.createWindow();
      this.createTray();
      this.setupMenu();
      this.setupIPC();

      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createWindow();
        }
      });
    });

    // Handle window closed
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });

    // Security: Prevent new window creation
    app.on("web-contents-created", (_, contents) => {
      contents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
      });
    });
  }

  private createWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
        webSecurity: false, // TEMPORARY: Disable for development only
      },
      titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
      show: false,
      icon: this.getAppIcon(),
    });

    // Load the app
    if (isDev()) {
      this.mainWindow.loadURL("http://localhost:5173");
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
    }

    // Show window when ready
    this.mainWindow.once("ready-to-show", () => {
      this.mainWindow?.show();
    });

    // Handle window closed
    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
    });

    // Handle minimize to tray
    this.mainWindow.on("minimize", (event: Electron.Event) => {
      if (this.tray) {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });

    this.mainWindow.on("close", (event: Electron.Event) => {
      if (this.tray && !(app as any).isQuiting) {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });
  }

  private createTray(): void {
    const trayIcon = this.getAppIcon();
    this.tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show TimeTrack",
        click: () => {
          this.mainWindow?.show();
        },
      },
      {
        label: "Start Timer",
        click: () => {
          this.mainWindow?.webContents.send("start-timer");
        },
      },
      {
        label: "Stop Timer",
        click: () => {
          this.mainWindow?.webContents.send("stop-timer");
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          (app as any).isQuiting = true;
          app.quit();
        },
      },
    ]);

    this.tray.setToolTip("TimeTrack - Time Tracking App");
    this.tray.setContextMenu(contextMenu);

    this.tray.on("click", () => {
      this.mainWindow?.show();
    });
  }

  private setupMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: "File",
        submenu: [
          {
            label: "New Project",
            accelerator: "CmdOrCtrl+N",
            click: () => {
              this.mainWindow?.webContents.send("new-project");
            },
          },
          { type: "separator" },
          {
            label: "Quit",
            accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
            click: () => {
              app.quit();
            },
          },
        ],
      },
      {
        label: "Timer",
        submenu: [
          {
            label: "Start Timer",
            accelerator: "CmdOrCtrl+Space",
            click: () => {
              this.mainWindow?.webContents.send("start-timer");
            },
          },
          {
            label: "Stop Timer",
            accelerator: "CmdOrCtrl+Shift+Space",
            click: () => {
              this.mainWindow?.webContents.send("stop-timer");
            },
          },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      {
        label: "Window",
        submenu: [{ role: "minimize" }, { role: "close" }],
      },
    ];

    if (process.platform === "darwin") {
      template.unshift({
        label: app.getName(),
        submenu: [
          { role: "about" },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  private setupIPC(): void {
    ipcMain.handle("get-app-version", () => {
      return app.getVersion();
    });

    ipcMain.handle("minimize-to-tray", () => {
      this.mainWindow?.hide();
    });

    ipcMain.handle("show-window", () => {
      this.mainWindow?.show();
    });
  }

  private getAppIcon(): Electron.NativeImage {
    const iconPath = isDev()
      ? path.join(__dirname, "../assets/icon.png")
      : path.join(__dirname, "../assets/icon.png");

    try {
      return nativeImage.createFromPath(iconPath);
    } catch {
      return nativeImage.createEmpty();
    }
  }
}

// Extend app with custom property
declare global {
  namespace Electron {
    interface App {
      isQuiting?: boolean;
    }
  }
}

// Initialize the app
new TimeTrackApp();

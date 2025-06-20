import SwiftUI

class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            // No visible windows, so create/show the main window
            for window in sender.windows {
                if window.contentViewController != nil {
                    window.makeKeyAndOrderFront(nil)
                    return false
                }
            }
            // If no window found, let the system handle it
            return true
        }
        return false
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Ensure the app can continue running without windows
        NSApp.setActivationPolicy(.regular)
    }
}

@main
struct TimeTrackApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var authViewModel = AuthViewModel()
    @StateObject private var timerViewModel = TimerViewModel()
    @State private var menuBarManager: MenuBarManager?
    @Environment(\.openWindow) private var openWindow

    var body: some Scene {
        WindowGroup("TimeTrack", id: "main") {
            ContentView()
                .environmentObject(authViewModel)
                .environmentObject(timerViewModel)
                .onAppear {
                    setupMenuBarManager()
                }
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentSize)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Show Main Window") {
                    showMainWindow()
                }
                .keyboardShortcut("m", modifiers: [.command])

                Button("Refresh") {
                    Task {
                        await timerViewModel.loadInitialData()
                    }
                }

                Button("Log Out") {
                    authViewModel.logout()
                }
            }
        }

        // Settings scene (hidden by default, but allows the app to run without showing the main window)
        Settings {
            EmptyView()
        }
    }

    private func setupMenuBarManager() {
        if menuBarManager == nil {
            Task { @MainActor in
                menuBarManager = MenuBarManager(
                    timerViewModel: timerViewModel,
                    authViewModel: authViewModel,
                    showMainWindowCallback: showMainWindow
                )
            }
        }
    }

    private func showMainWindow() {
        NSApp.activate(ignoringOtherApps: true)

        // Try to find and show existing window
        for window in NSApp.windows {
            if window.contentViewController != nil && !window.title.isEmpty {
                window.makeKeyAndOrderFront(nil)
                window.orderFrontRegardless()
                return
            }
        }

        // If no window exists, try to open a new one
        if #available(macOS 13.0, *) {
            openWindow(id: "main")
        } else {
            // Fallback for older macOS versions
            DispatchQueue.main.async {
                NSApp.delegate?.applicationShouldHandleReopen?(NSApp, hasVisibleWindows: false)
            }
        }
    }
}
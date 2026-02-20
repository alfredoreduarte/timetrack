import SwiftUI
import AppKit
import Combine

enum ToolbarViewMode: String {
    case current = "current"
    case today = "today"
}

@MainActor
class MenuBarManager: ObservableObject {
    private var statusItem: NSStatusItem?
    private var popover: NSPopover?
    private var timerViewModel: TimerViewModel
    private var authViewModel: AuthViewModel
    private var dashboardViewModel: DashboardViewModel
    private var earningsRefreshTimer: Timer?
    private var showMainWindowCallback: (() -> Void)?
    private var cancellables = Set<AnyCancellable>()

    @Published var toolbarViewMode: ToolbarViewMode {
        didSet {
            UserDefaults.standard.set(toolbarViewMode.rawValue, forKey: "toolbarViewMode")
            updateStatusItemIcon()
        }
    }

    init(timerViewModel: TimerViewModel, authViewModel: AuthViewModel, showMainWindowCallback: @escaping () -> Void) {
        self.timerViewModel = timerViewModel
        self.authViewModel = authViewModel
        self.dashboardViewModel = DashboardViewModel()
        self.showMainWindowCallback = showMainWindowCallback

        // Load saved toolbar view mode from UserDefaults
        if let savedMode = UserDefaults.standard.string(forKey: "toolbarViewMode"),
           let mode = ToolbarViewMode(rawValue: savedMode) {
            self.toolbarViewMode = mode
        } else {
            self.toolbarViewMode = .current
        }

        setupMenuBar()
        setupEarningsRefresh()
        setupReactiveUpdates()
    }

    private func setupMenuBar() {
        // Ensure we're on the main thread
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.setupMenuBar()
            }
            return
        }

        // Create status item
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        // Create popover
        popover = NSPopover()
        popover?.contentSize = NSSize(width: 300, height: 400)
        popover?.behavior = .transient

        setupStatusItem()
        setupPopover()
        updateStatusItemIcon()
    }

    private func cleanup() {
        cancellables.removeAll()
        earningsRefreshTimer?.invalidate()
        earningsRefreshTimer = nil

        if let statusItem = statusItem {
            NSStatusBar.system.removeStatusItem(statusItem)
        }
    }

    private func setupStatusItem() {
        guard let statusItem = statusItem,
              let button = statusItem.button else { return }

        button.target = self
        button.action = #selector(statusItemClicked)
        button.sendAction(on: [.leftMouseUp, .rightMouseUp])

        // Set initial appearance
        updateStatusItemIcon()
    }

    private func setupPopover() {
        guard let popover = popover else { return }

        let hostingController = NSHostingController(
            rootView: MenuBarView()
                .environmentObject(timerViewModel)
                .environmentObject(authViewModel)
                .environmentObject(self)
        )
        popover.contentViewController = hostingController
    }

    private func setupReactiveUpdates() {
        // Subscribe to elapsedTime changes for instant menu bar updates
        timerViewModel.$elapsedTime
            .debounce(for: .milliseconds(10), scheduler: RunLoop.main)
            .sink { [weak self] newValue in
                self?.updateStatusItemIcon()
            }
            .store(in: &cancellables)

        // Subscribe to currentEntry changes to update when timer starts/stops
        timerViewModel.$currentEntry
            .debounce(for: .milliseconds(10), scheduler: RunLoop.main)
            .sink { [weak self] _ in
                self?.updateStatusItemIcon()
            }
            .store(in: &cancellables)

        // Subscribe to dashboard earnings changes
        dashboardViewModel.$earnings
            .debounce(for: .milliseconds(10), scheduler: RunLoop.main)
            .sink { [weak self] _ in
                self?.updateStatusItemIcon()
            }
            .store(in: &cancellables)
    }

    private func setupEarningsRefresh() {
        // Initial load of earnings
        Task {
            await dashboardViewModel.loadDashboardEarnings()
        }

        // Refresh earnings every 30 seconds, but only when a timer is running
        earningsRefreshTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.timerViewModel.isRunning else { return }
                await self.dashboardViewModel.loadDashboardEarnings()
            }
        }
    }

    @objc private func statusItemClicked(_ sender: NSStatusBarButton) {
        guard let event = NSApp.currentEvent else { return }

        if event.type == .rightMouseUp {
            // Right click - show context menu
            showContextMenu()
        } else {
            // Left click - toggle popover
            togglePopover()
        }
    }

    private func togglePopover() {
        guard let statusItem = statusItem,
              let button = statusItem.button,
              let popover = popover else { return }

        if popover.isShown {
            popover.performClose(nil)
        } else {
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        }
    }

    private func showContextMenu() {
        guard let statusItem = statusItem else { return }

        let menu = NSMenu()

        if timerViewModel.isRunning {
            menu.addItem(NSMenuItem(title: "Stop Timer", action: #selector(stopTimerAction), keyEquivalent: ""))
        } else {
            menu.addItem(NSMenuItem(title: "Start Latest Timer", action: #selector(startLatestTimerAction), keyEquivalent: ""))
        }

        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Show Window", action: #selector(showMainWindow), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))

        // Set targets for menu items
        for item in menu.items {
            item.target = self
        }

        statusItem.menu = menu
        statusItem.button?.performClick(nil)
        statusItem.menu = nil
    }

    @objc private func stopTimerAction() {
        Task {
            await timerViewModel.stopTimer()
        }
    }

    @objc private func startLatestTimerAction() {
        Task {
            // Start timer with the latest entry's details
            if let latestEntry = timerViewModel.recentEntries.first {
                await timerViewModel.restartTimer(fromEntry: latestEntry)
            }
        }
    }

    @objc private func showMainWindow() {
        showMainWindowCallback?()
    }

    func requestShowMainWindow() {
        showMainWindowCallback?()
    }

    private func updateStatusItemIcon() {
        guard let statusItem = statusItem,
              let button = statusItem.button else { return }

        let attributedString = NSMutableAttributedString()

        if toolbarViewMode == .current {
            // CURRENT MODE: Show current timer time and earnings
            let isRunning = timerViewModel.isRunning
            let timeText = timerViewModel.formattedElapsedTime
            let currentEarnings = timerViewModel.currentTimerLiveEarnings ?? 0.0

            // Add icon
            let iconName = isRunning ? "stop.fill" : "play.fill"
            if let icon = NSImage(systemSymbolName: iconName, accessibilityDescription: nil) {
                icon.isTemplate = true
                let iconAttachment = NSTextAttachment()
                iconAttachment.image = icon
                iconAttachment.bounds = CGRect(x: 0, y: -2, width: 12, height: 12)
                attributedString.append(NSAttributedString(attachment: iconAttachment))
            }

            // Add current timer time
            let displayTime = (isRunning && !timeText.isEmpty) ? timeText : "00:00"
            attributedString.append(NSAttributedString(string: " \(displayTime)", attributes: [
                .font: NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .regular),
                .foregroundColor: NSColor.controlTextColor
            ]))

            // Add current timer earnings
            let earningsText = String(format: " - $%.2f", currentEarnings)
            attributedString.append(NSAttributedString(string: earningsText, attributes: [
                .font: NSFont.systemFont(ofSize: 11, weight: .regular),
                .foregroundColor: NSColor.controlTextColor
            ]))
        } else {
            // TODAY MODE: Show today's total time and earnings (including current timer)
            let todayBaseTime = dashboardViewModel.earnings?.today.duration ?? 0
            let currentTime = timerViewModel.isRunning ? timerViewModel.elapsedTime : 0
            let todayTotalTime = todayBaseTime + currentTime
            let todayTotalEarnings = dashboardViewModel.calculateTodayTotalEarnings(
                currentTimerEarnings: timerViewModel.currentTimerLiveEarnings
            )

            // Add calendar icon
            if let icon = NSImage(systemSymbolName: "calendar", accessibilityDescription: nil) {
                icon.isTemplate = true
                let iconAttachment = NSTextAttachment()
                iconAttachment.image = icon
                iconAttachment.bounds = CGRect(x: 0, y: -2, width: 12, height: 12)
                attributedString.append(NSAttributedString(attachment: iconAttachment))
            }

            // Add today's total time - show HH:MM:SS when over 1 hour
            let hours = todayTotalTime / 3600
            let minutes = (todayTotalTime % 3600) / 60
            let seconds = todayTotalTime % 60
            let displayTime = hours > 0 ? String(format: "%d:%02d:%02d", hours, minutes, seconds) : String(format: "%d:%02d", minutes, seconds)
            attributedString.append(NSAttributedString(string: " \(displayTime)", attributes: [
                .font: NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .regular),
                .foregroundColor: NSColor.controlTextColor
            ]))

            // Add today's total earnings
            let earningsText = String(format: " - $%.2f", todayTotalEarnings)
            attributedString.append(NSAttributedString(string: earningsText, attributes: [
                .font: NSFont.systemFont(ofSize: 11, weight: .regular),
                .foregroundColor: NSColor.controlTextColor
            ]))
        }

        button.attributedTitle = attributedString
    }
}

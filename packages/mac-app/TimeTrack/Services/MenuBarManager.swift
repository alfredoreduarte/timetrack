import SwiftUI
import AppKit

@MainActor
class MenuBarManager: ObservableObject {
    private var statusItem: NSStatusItem?
    private var popover: NSPopover?
    private var timerViewModel: TimerViewModel
    private var authViewModel: AuthViewModel
    private var dashboardViewModel: DashboardViewModel
    private var updateTimer: Timer?
    private var earningsRefreshTimer: Timer?
    private var showMainWindowCallback: (() -> Void)?

    init(timerViewModel: TimerViewModel, authViewModel: AuthViewModel, showMainWindowCallback: @escaping () -> Void) {
        self.timerViewModel = timerViewModel
        self.authViewModel = authViewModel
        self.dashboardViewModel = DashboardViewModel()
        self.showMainWindowCallback = showMainWindowCallback

        setupMenuBar()
        setupEarningsRefresh()
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

        // Listen for timer state changes to update the icon
        setupTimerObserver()
    }

    private func cleanup() {
        updateTimer?.invalidate()
        updateTimer = nil
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

    private func setupTimerObserver() {
        // Observe timer changes to update the menu bar icon
        updateTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateStatusItemIcon()
            }
        }
    }

    private func setupEarningsRefresh() {
        // Initial load of earnings
        Task {
            await dashboardViewModel.loadDashboardEarnings()
        }

        // Refresh earnings every 30 seconds to keep today's total updated
        earningsRefreshTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.dashboardViewModel.loadDashboardEarnings()
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

        let isRunning = timerViewModel.isRunning
        let timeText = timerViewModel.formattedElapsedTime

        // Calculate today's total earnings using centralized method
        let todayTotalEarnings = dashboardViewModel.calculateTodayTotalEarnings(
            currentTimerEarnings: timerViewModel.currentTimerLiveEarnings
        )

        // Create attributed string with icon, time, and earnings
        let attributedString = NSMutableAttributedString()

        // Add icon
        let iconName = isRunning ? "stop.fill" : "play.fill"

        if let icon = NSImage(systemSymbolName: iconName, accessibilityDescription: nil) {
            icon.isTemplate = true
            let iconAttachment = NSTextAttachment()
            iconAttachment.image = icon
            iconAttachment.bounds = CGRect(x: 0, y: -2, width: 12, height: 12)
            attributedString.append(NSAttributedString(attachment: iconAttachment))
        }

        // Add time
        let displayTime = (isRunning && !timeText.isEmpty) ? timeText : "00:00"
        attributedString.append(NSAttributedString(string: " \(displayTime)", attributes: [
            .font: NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .regular),
            .foregroundColor: NSColor.controlTextColor
        ]))

        // Add earnings
        let earningsText = String(format: " - $%.2f", todayTotalEarnings)
        attributedString.append(NSAttributedString(string: earningsText, attributes: [
            .font: NSFont.systemFont(ofSize: 11, weight: .regular),
            .foregroundColor: NSColor.controlTextColor
        ]))

        button.attributedTitle = attributedString
    }
}

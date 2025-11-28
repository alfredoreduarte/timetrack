import SwiftUI

struct MenuBarView: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var menuBarManager: MenuBarManager
    @StateObject private var dashboardViewModel = DashboardViewModel()
    @State private var refreshTimer: Timer?
    @State private var idleTimeoutMinutes: String = String(AppConstants.defaultIdleTimeoutSeconds / 60)
    @State private var isSavingIdleTimeout = false
    @State private var idleTimeoutErrorMessage: String?
    @FocusState private var isIdleTimeoutFieldFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            if authViewModel.isAuthenticated {
                authenticatedView
            } else {
                unauthenticatedView
            }
        }
        .frame(width: 320, height: 480)
        .background(AppTheme.background)
        .onAppear {
            Task {
                await dashboardViewModel.loadDashboardEarnings()
            }
            startRefreshTimer()
            loadIdleTimeoutMinutes()
        }
        .onDisappear {
            stopRefreshTimer()
        }
        .onReceive(NotificationCenter.default.publisher(for: .idleTimeoutUpdated)) { notification in
            guard let seconds = notification.userInfo?["seconds"] as? Int else { return }
            idleTimeoutMinutes = String(max(1, seconds / 60))
        }
        .onChange(of: idleTimeoutMinutes) { newValue in
            let sanitized = sanitizeIdleTimeoutInput(newValue)
            if sanitized != newValue {
                idleTimeoutMinutes = sanitized
            }
            idleTimeoutErrorMessage = nil
        }
    }

    // MARK: - Authenticated View
    private var authenticatedView: some View {
        VStack(spacing: 0) {
            // Current timer section with premium styling
            currentTimerSection
                .padding(.horizontal, AppTheme.spacingLG)
                .padding(.top, AppTheme.spacingXL)
                .padding(.bottom, AppTheme.spacingLG)

            PremiumDivider()

            // Earnings section
            earningsSection
                .padding(AppTheme.spacingLG)

            PremiumDivider()

            // Preferences section
            preferencesSection
                .padding(AppTheme.spacingLG)

            PremiumDivider()

            // Account section (logout)
            accountSection
                .padding(AppTheme.spacingLG)

            Spacer()
        }
    }

    // MARK: - Unauthenticated View
    private var unauthenticatedView: some View {
        VStack(spacing: AppTheme.spacingXL) {
            Spacer()

            // Premium icon with subtle glow
            ZStack {
                Circle()
                    .fill(AppTheme.accent.opacity(0.1))
                    .frame(width: 80, height: 80)
                    .blur(radius: 20)

                Image(systemName: "clock.circle.fill")
                    .font(.system(size: 48, weight: .light))
                    .foregroundStyle(AppTheme.accentGradient)
            }

            VStack(spacing: AppTheme.spacingSM) {
                Text("TimeTrack")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundColor(AppTheme.primary)

                Text("Sign in to start tracking")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(AppTheme.secondary)
            }

            Button(action: {
                menuBarManager.requestShowMainWindow()
            }) {
                HStack(spacing: AppTheme.spacingSM) {
                    Text("Open TimeTrack")
                        .font(.system(size: 13, weight: .semibold))
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, AppTheme.spacingXL)
                .padding(.vertical, AppTheme.spacingMD)
                .background(AppTheme.accentGradient)
                .clipShape(Capsule())
                .shadow(color: AppTheme.accent.opacity(0.3), radius: 8, x: 0, y: 4)
            }
            .buttonStyle(.plain)

            Spacer()
        }
        .padding(AppTheme.spacingXL)
    }

    // MARK: - Current Timer Section
    private var currentTimerSection: some View {
        VStack(spacing: AppTheme.spacingMD) {
            if let currentEntry = timerViewModel.currentEntry {
                // Active timer display
                VStack(spacing: AppTheme.spacingMD) {
                    // Project and task
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: AppTheme.spacingSM) {
                                Circle()
                                    .fill(timerViewModel.getProjectColor(for: currentEntry))
                                    .frame(width: 8, height: 8)

                                Text(timerViewModel.getProjectName(for: currentEntry))
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(AppTheme.primary)
                                    .lineLimit(1)
                            }

                            if let task = currentEntry.task {
                                Text(task.name)
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(AppTheme.secondary)
                                    .lineLimit(1)
                                    .padding(.leading, 16)
                            }
                        }

                        Spacer()

                        // Action buttons
                        HStack(spacing: AppTheme.spacingSM) {
                            Button(action: {
                                Task {
                                    await timerViewModel.loadInitialData()
                                    await dashboardViewModel.loadDashboardEarnings()
                                }
                            }) {
                                Image(systemName: "arrow.clockwise")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(AppTheme.tertiary)
                            }
                            .buttonStyle(.plain)

                            Button(action: { menuBarManager.requestShowMainWindow() }) {
                                Image(systemName: "arrow.up.right.square")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(AppTheme.tertiary)
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    // Timer and earnings display
                    HStack(alignment: .bottom) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(timerViewModel.formattedElapsedTime)
                                .font(.system(size: 28, weight: .bold, design: .monospaced))
                                .foregroundColor(AppTheme.primary)

                            if let earnings = timerViewModel.currentTimerLiveEarnings {
                                Text(String(format: "$%.2f", earnings))
                                    .font(.system(size: 16, weight: .bold, design: .rounded))
                                    .foregroundColor(AppTheme.earnings)
                            }
                        }

                        Spacer()

                        // Stop/Resume button
                        Button(action: {
                            Task {
                                if timerViewModel.isRunning {
                                    await timerViewModel.stopTimer()
                                } else {
                                    await timerViewModel.restartTimer(fromEntry: currentEntry)
                                }
                                await dashboardViewModel.loadDashboardEarnings()
                            }
                        }) {
                            HStack(spacing: 6) {
                                Image(systemName: timerViewModel.isRunning ? "stop.fill" : "play.fill")
                                    .font(.system(size: 11, weight: .semibold))
                                Text(timerViewModel.isRunning ? "Stop" : "Resume")
                                    .font(.system(size: 12, weight: .semibold))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, AppTheme.spacingLG)
                            .padding(.vertical, AppTheme.spacingSM)
                            .background(timerViewModel.isRunning ? AppTheme.errorGradient : AppTheme.successGradient)
                            .clipShape(Capsule())
                            .shadow(color: (timerViewModel.isRunning ? AppTheme.error : AppTheme.success).opacity(0.3), radius: 6, x: 0, y: 3)
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else {
                // No active timer state
                VStack(spacing: AppTheme.spacingMD) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("No Active Timer")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(AppTheme.primary)

                            Text("Start tracking from the main app")
                                .font(.system(size: 12))
                                .foregroundColor(AppTheme.tertiary)
                        }

                        Spacer()

                        // Action buttons
                        HStack(spacing: AppTheme.spacingSM) {
                            Button(action: {
                                Task {
                                    await timerViewModel.loadInitialData()
                                    await dashboardViewModel.loadDashboardEarnings()
                                }
                            }) {
                                Image(systemName: "arrow.clockwise")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(AppTheme.tertiary)
                            }
                            .buttonStyle(.plain)

                            Button(action: { menuBarManager.requestShowMainWindow() }) {
                                Image(systemName: "arrow.up.right.square")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(AppTheme.tertiary)
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    // Quick start from latest entry
                    if let latestEntry = timerViewModel.recentEntries.first {
                        Button(action: {
                            Task {
                                await timerViewModel.restartTimer(fromEntry: latestEntry)
                                await dashboardViewModel.loadDashboardEarnings()
                            }
                        }) {
                            HStack(spacing: AppTheme.spacingSM) {
                                Image(systemName: "play.fill")
                                    .font(.system(size: 10))
                                Text("Resume: \(timerViewModel.getProjectName(for: latestEntry))")
                                    .font(.system(size: 12, weight: .medium))
                                    .lineLimit(1)
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, AppTheme.spacingLG)
                            .padding(.vertical, AppTheme.spacingSM)
                            .frame(maxWidth: .infinity)
                            .background(AppTheme.successGradient)
                            .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Earnings Section
    private var earningsSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
            Text("Earnings")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundColor(AppTheme.tertiary)
                .textCase(.uppercase)
                .tracking(0.5)

            if dashboardViewModel.isLoading {
                HStack {
                    ProgressView()
                        .scaleEffect(0.7)
                    Text("Loading...")
                        .font(.system(size: 12))
                        .foregroundColor(AppTheme.secondary)
                }
            } else if let errorMessage = dashboardViewModel.errorMessage {
                Text(errorMessage)
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.error)
            } else {
                VStack(spacing: AppTheme.spacingSM) {
                    MenuBarEarningsRow(
                        label: "Today",
                        value: dashboardViewModel.todayEarningsWithLive(currentTimerEarnings: timerViewModel.currentTimerLiveEarnings)
                    )

                    MenuBarEarningsRow(
                        label: "This Week",
                        value: dashboardViewModel.thisWeekEarningsFormatted
                    )
                }
            }
        }
    }

    // MARK: - Preferences Section
    private var preferencesSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
            Text("Preferences")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundColor(AppTheme.tertiary)
                .textCase(.uppercase)
                .tracking(0.5)

            // Toolbar view toggle
            HStack {
                Text("Menu bar shows")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.secondary)

                Spacer()

                // Custom segmented control
                HStack(spacing: 0) {
                    MenuBarSegmentButton(
                        title: "Timer",
                        isSelected: menuBarManager.toolbarViewMode == .current
                    ) {
                        menuBarManager.toolbarViewMode = .current
                    }

                    MenuBarSegmentButton(
                        title: "Today",
                        isSelected: menuBarManager.toolbarViewMode == .today
                    ) {
                        menuBarManager.toolbarViewMode = .today
                    }
                }
                .background(AppTheme.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusSM))
                .overlay(
                    RoundedRectangle(cornerRadius: AppTheme.radiusSM)
                        .stroke(AppTheme.border, lineWidth: 1)
                )
            }

            // Idle timeout setting
            VStack(alignment: .leading, spacing: AppTheme.spacingSM) {
                HStack {
                    Text("Idle timeout")
                        .font(.system(size: 12))
                        .foregroundColor(AppTheme.secondary)

                    Spacer()

                    HStack(spacing: AppTheme.spacingXS) {
                        TextField("10", text: $idleTimeoutMinutes)
                            .font(.system(size: 12, weight: .medium, design: .monospaced))
                            .foregroundColor(AppTheme.primary)
                            .multilineTextAlignment(.center)
                            .textFieldStyle(.plain)
                            .frame(width: 36)
                            .padding(.vertical, 4)
                            .background(AppTheme.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                            .overlay(
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(idleTimeoutErrorMessage != nil ? AppTheme.error : AppTheme.border, lineWidth: 1)
                            )
                            .disabled(isSavingIdleTimeout)
                            .focused($isIdleTimeoutFieldFocused)
                            .onSubmit {
                                Task {
                                    await saveIdleTimeoutPreference()
                                }
                            }
                            .onChange(of: isIdleTimeoutFieldFocused) { focused in
                                if !focused {
                                    // Auto-save when field loses focus
                                    Task {
                                        await saveIdleTimeoutPreference()
                                    }
                                }
                            }

                        Text("min")
                            .font(.system(size: 11))
                            .foregroundColor(AppTheme.tertiary)

                        if isSavingIdleTimeout {
                            ProgressView()
                                .scaleEffect(0.5)
                                .frame(width: 16, height: 16)
                        }
                    }
                }

                // Status messages
                if let error = idleTimeoutErrorMessage {
                    Text(error)
                        .font(.system(size: 10))
                        .foregroundColor(AppTheme.error)
                }
            }
        }
    }

    // MARK: - Account Section
    private var accountSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
            Text("Account")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundColor(AppTheme.tertiary)
                .textCase(.uppercase)
                .tracking(0.5)

            Button(action: {
                authViewModel.logout()
            }) {
                HStack(spacing: AppTheme.spacingSM) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: 12, weight: .medium))
                    Text("Log Out")
                        .font(.system(size: 12, weight: .medium))
                    Spacer()
                }
                .foregroundColor(AppTheme.tertiary)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Helper Methods
    private func startRefreshTimer() {
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { _ in
            Task { @MainActor in
                await dashboardViewModel.loadDashboardEarnings()
            }
        }
    }

    private func stopRefreshTimer() {
        refreshTimer?.invalidate()
        refreshTimer = nil
    }

    private func loadIdleTimeoutMinutes() {
        let storedSeconds = UserDefaults.standard.integer(forKey: AppConstants.idleTimeoutSecondsKey)
        let resolvedSeconds = storedSeconds > 0 ? storedSeconds : AppConstants.defaultIdleTimeoutSeconds
        idleTimeoutMinutes = String(max(1, resolvedSeconds / 60))
    }

    private func sanitizeIdleTimeoutInput(_ value: String) -> String {
        let filtered = value.filter { $0.isNumber }
        return String(filtered.prefix(3))
    }

    private func saveIdleTimeoutPreference() async {
        guard let minutes = Int(idleTimeoutMinutes), minutes >= 1, minutes <= 120 else {
            idleTimeoutErrorMessage = "Enter 1-120 minutes"
            return
        }

        isSavingIdleTimeout = true
        idleTimeoutErrorMessage = nil

        do {
            try await authViewModel.updateIdleTimeout(seconds: minutes * 60)
        } catch {
            idleTimeoutErrorMessage = error.localizedDescription
        }

        isSavingIdleTimeout = false
    }
}

// MARK: - Supporting Components

struct PremiumDivider: View {
    var body: some View {
        Rectangle()
            .fill(AppTheme.border)
            .frame(height: 1)
    }
}

struct MenuBarEarningsRow: View {
    let label: String
    let value: String
    var valueColor: Color = AppTheme.primary
    var isHighlighted: Bool = false

    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 12, weight: isHighlighted ? .medium : .regular))
                .foregroundColor(isHighlighted ? AppTheme.primary : AppTheme.secondary)

            Spacer()

            Text(value)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundColor(valueColor)
        }
    }
}


struct MenuBarSegmentButton: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 11, weight: isSelected ? .semibold : .medium))
                .foregroundColor(isSelected ? AppTheme.primary : AppTheme.tertiary)
                .padding(.horizontal, AppTheme.spacingMD)
                .padding(.vertical, 6)
                .background(isSelected ? AppTheme.accent.opacity(0.2) : Color.clear)
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    MenuBarView()
        .environmentObject(TimerViewModel())
        .environmentObject(AuthViewModel())
        .environmentObject(MenuBarManager(
            timerViewModel: TimerViewModel(),
            authViewModel: AuthViewModel(),
            showMainWindowCallback: {}
        ))
        .frame(width: 320, height: 480)
        .preferredColorScheme(.dark)
}

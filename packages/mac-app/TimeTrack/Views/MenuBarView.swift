import SwiftUI

struct MenuBarView: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var menuBarManager: MenuBarManager
    @StateObject private var dashboardViewModel = DashboardViewModel()
    @State private var refreshTimer: Timer?
    @State private var idleTimeoutMinutes: String = String(AppConstants.defaultIdleTimeoutSeconds / 60)
    @State private var isSavingIdleTimeout = false
    @State private var idleTimeoutStatusMessage: String?
    @State private var idleTimeoutErrorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            if authViewModel.isAuthenticated {
                authenticatedView
            } else {
                unauthenticatedView
            }
        }
        .frame(width: 300, height: 400)
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
            idleTimeoutStatusMessage = nil
            idleTimeoutErrorMessage = nil
        }
    }

    private var authenticatedView: some View {
        VStack(spacing: 0) {
            // Header with current timer status
            headerView

            Divider()
                .background(Color.gray.opacity(0.3))

            // Current timer section
            currentTimerSection

            Divider()
                .background(Color.gray.opacity(0.3))

            // Earnings section
            earningsSection

            Divider()
                .background(Color.gray.opacity(0.3))

            // Quick actions
            quickActionsSection

            Divider()
                .background(Color.gray.opacity(0.3))

            // Preferences
            preferencesSection

            Spacer()
        }
    }

    private var unauthenticatedView: some View {
        VStack(spacing: 16) {
            Image(systemName: "timer")
                .font(.system(size: 40))
                .foregroundColor(.gray)

            Text("Please log in to TimeTrack")
                .font(.headline)
                .foregroundColor(.primary)

            Button("Open Main Window") {
                menuBarManager.requestShowMainWindow()
            }
            .buttonStyle(.borderedProminent)

            Spacer()
        }
        .padding()
    }

    private var headerView: some View {
        HStack {
            Image(systemName: timerViewModel.isRunning ? "stop.fill" : "play.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(timerViewModel.isRunning ? AppTheme.error : AppTheme.success)

            Text(timerViewModel.isRunning ? "Timer Running" : "Timer Stopped")
                .font(.headline)
                .foregroundColor(.primary)

            Spacer()

            Button(action: {
                menuBarManager.requestShowMainWindow()
            }) {
                Image(systemName: "arrow.up.right.square")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(AppTheme.cardBackground)
    }

    private var currentTimerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let currentEntry = timerViewModel.currentEntry {
                // Use shared component for current timer display
                CompactTimeEntryView(
                    entry: currentEntry,
                    showLiveEarnings: true,
                    onTimerAction: {
                        Task {
                            if timerViewModel.isRunning {
                                await timerViewModel.stopTimer()
                            } else {
                                await timerViewModel.restartTimer(fromEntry: currentEntry)
                            }
                            await dashboardViewModel.loadDashboardEarnings()
                        }
                    }
                )
            } else {
                VStack(spacing: 8) {
                    Text("No active timer")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)

                    if let latestEntry = timerViewModel.recentEntries.first {
                        Button(action: {
                            Task {
                                await timerViewModel.restartTimer(fromEntry: latestEntry)
                                await dashboardViewModel.loadDashboardEarnings()
                            }
                        }) {
                            HStack {
                                Image(systemName: "play.fill")
                                    .font(.system(size: 12))
                                Text("Start Latest")
                                    .font(.system(size: 12, weight: .medium))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 6)
                            .background(AppTheme.success)
                            .cornerRadius(6)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var earningsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Earnings")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.primary)

            if dashboardViewModel.isLoading {
                HStack {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Loading...")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
            } else if let errorMessage = dashboardViewModel.errorMessage {
                Text("Error: \(errorMessage)")
                    .font(.system(size: 12))
                    .foregroundColor(.red)
            } else {
                // Use shared earnings display component
                CompactEarningsView(
                    earnings: dashboardViewModel.earnings,
                    showCurrentTimer: timerViewModel.isRunning,
                    currentTimerEarnings: timerViewModel.currentTimerLiveEarnings
                )
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var quickActionsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Quick Actions")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.primary)

            HStack(spacing: 8) {
                Button("Refresh") {
                    Task {
                        await timerViewModel.loadInitialData()
                        await dashboardViewModel.loadDashboardEarnings()
                    }
                }
                .buttonStyle(.bordered)
                .font(.system(size: 11))

                Button("Main Window") {
                    menuBarManager.requestShowMainWindow()
                }
                .buttonStyle(.bordered)
                .font(.system(size: 11))

                Spacer()
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var preferencesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Preferences")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.primary)

            HStack {
                Text("Toolbar view:")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)

                Spacer()

                HStack(spacing: 4) {
                    Text("Current timer")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)

                    Toggle("", isOn: Binding(
                        get: { menuBarManager.toolbarViewMode == .today },
                        set: { isToday in
                            menuBarManager.toolbarViewMode = isToday ? .today : .current
                        }
                    ))
                    .labelsHidden()
                    .toggleStyle(.switch)
                    .scaleEffect(0.7)

                    Text("Today's totals")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
            }

            Divider()
                .background(Color.gray.opacity(0.3))

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Idle timeout (minutes):")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)

                    Spacer()

                    TextField("10", text: $idleTimeoutMinutes)
                        .frame(width: 60)
                        .multilineTextAlignment(.trailing)
                        .textFieldStyle(.roundedBorder)
                        .disabled(isSavingIdleTimeout)
                }

                HStack(spacing: 8) {
                    Button(isSavingIdleTimeout ? "Saving..." : "Save") {
                        Task {
                            await saveIdleTimeoutPreference()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .font(.system(size: 11))
                    .disabled(isSavingIdleTimeout)

                    if isSavingIdleTimeout {
                        ProgressView()
                            .scaleEffect(0.6)
                    }

                    Spacer()
                }

                if let status = idleTimeoutStatusMessage {
                    Text(status)
                        .font(.system(size: 11))
                        .foregroundColor(AppTheme.success)
                } else if let error = idleTimeoutErrorMessage {
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundColor(AppTheme.error)
                }

                Text("Automatically stop running timers after inactivity.")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func startRefreshTimer() {
        // Refresh earnings data every 30 seconds to keep today/week totals updated
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
            idleTimeoutErrorMessage = "Enter between 1 and 120 minutes."
            idleTimeoutStatusMessage = nil
            return
        }

        isSavingIdleTimeout = true
        idleTimeoutErrorMessage = nil
        idleTimeoutStatusMessage = nil

        do {
            try await authViewModel.updateIdleTimeout(seconds: minutes * 60)
            idleTimeoutStatusMessage = "Idle timeout saved."
        } catch {
            idleTimeoutErrorMessage = error.localizedDescription
        }

        isSavingIdleTimeout = false
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
        .frame(width: 300, height: 400)
        .preferredColorScheme(.dark)
}

import SwiftUI

struct MenuBarView: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var menuBarManager: MenuBarManager
    @State private var earnings: DashboardEarnings?
    @State private var isLoadingEarnings = false
    @State private var refreshTimer: Timer?

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
                await loadEarnings()
            }
            startRefreshTimer()
        }
        .onDisappear {
            stopRefreshTimer()
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
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(timerViewModel.getProjectName(for: currentEntry))
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.primary)

                        if let task = currentEntry.task, !task.name.isEmpty {
                            Text(task.name)
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                        }

                        if let description = currentEntry.description, !description.isEmpty {
                            Text(description)
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                        }
                    }

                    Spacer()

                    VStack(alignment: .trailing) {
                        Text(timerViewModel.formattedElapsedTime)
                            .font(.system(size: 18, weight: .bold, design: .monospaced))
                            .foregroundColor(.primary)

                        if let rate = currentEntry.hourlyRateSnapshot {
                            Text("$\(rate, specifier: "%.2f")/hr")
                                .font(.system(size: 10))
                                .foregroundColor(.secondary)
                        }
                    }
                }

                // Timer control button
                HStack {
                    Spacer()

                    Button(action: {
                        Task {
                            if timerViewModel.isRunning {
                                await timerViewModel.stopTimer()
                            } else {
                                // This case shouldn't happen when there's a current entry
                                await timerViewModel.restartTimer(fromEntry: currentEntry)
                            }
                            await loadEarnings()
                        }
                    }) {
                        HStack {
                            Image(systemName: timerViewModel.isRunning ? "stop.fill" : "play.fill")
                                .font(.system(size: 12))
                            Text(timerViewModel.isRunning ? "Stop" : "Resume")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 6)
                        .background(timerViewModel.isRunning ? AppTheme.error : AppTheme.success)
                        .cornerRadius(6)
                    }
                    .buttonStyle(.plain)

                    Spacer()
                }
            } else {
                VStack(spacing: 8) {
                    Text("No active timer")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)

                    if let latestEntry = timerViewModel.recentEntries.first {
                        Button(action: {
                            Task {
                                await timerViewModel.restartTimer(fromEntry: latestEntry)
                                await loadEarnings()
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
                            .background(Color.green)
                            .cornerRadius(8)
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

            if isLoadingEarnings {
                HStack {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Loading...")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
            } else if let earnings = earnings {
                VStack(spacing: 6) {
                    // Show live current timer earnings if timer is running
                    if timerViewModel.isRunning, let currentEntry = timerViewModel.currentEntry, let rate = currentEntry.hourlyRateSnapshot {
                        HStack {
                            Text("Current Timer:")
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)
                            Spacer()
                            // Calculate live earnings based on elapsed time
                            let liveEarnings = rate * Double(timerViewModel.elapsedTime) / 3600.0
                            Text("$\(liveEarnings, specifier: "%.2f")")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.green)
                        }
                    } else if earnings.currentTimer.isRunning {
                        // Fallback to API data if we don't have current entry data
                        HStack {
                            Text("Current Timer:")
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)
                            Spacer()
                            Text("$\(earnings.currentTimer.earnings, specifier: "%.2f")")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.green)
                        }
                    }

                    HStack {
                        Text("Today:")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                        Spacer()
                        Text("$\(earnings.today.earnings, specifier: "%.2f")")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.primary)
                    }

                    HStack {
                        Text("This Week:")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                        Spacer()
                        Text("$\(earnings.thisWeek.earnings, specifier: "%.2f")")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.primary)
                    }
                }
            } else {
                Text("Unable to load earnings")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
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
                        await loadEarnings()
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

    private func loadEarnings() async {
        isLoadingEarnings = true
        defer { isLoadingEarnings = false }

        do {
            earnings = try await APIClient.shared.getDashboardEarnings()
        } catch {
            print("Error loading earnings: \(error)")
        }
    }

    private func startRefreshTimer() {
        // Refresh earnings data every 30 seconds to keep today/week totals updated
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { _ in
            Task { @MainActor in
                await loadEarnings()
            }
        }
    }

    private func stopRefreshTimer() {
        refreshTimer?.invalidate()
        refreshTimer = nil
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

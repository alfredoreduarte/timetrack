import SwiftUI

struct MenuBarView: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var menuBarManager: MenuBarManager
    @StateObject private var dashboardViewModel = DashboardViewModel()
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
                await dashboardViewModel.loadDashboardEarnings()
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

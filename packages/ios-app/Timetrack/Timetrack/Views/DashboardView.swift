import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var timerViewModel: TimerViewModel
    @StateObject private var dashboardViewModel = DashboardViewModel()
    @State private var rotationDegrees = 0.0
    @State private var showingSettings = false

    var body: some View {
        NavigationView {
            ZStack {
                // Dark background
                AppTheme.background
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    // Header
                    HStack {
                        Text("TimeTrack")
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundColor(AppTheme.primary)

                        Spacer()

                        HStack(spacing: AppTheme.spacingMD) {
                            Button(action: {
                                Task {
                                    withAnimation(.linear(duration: 1)) {
                                        rotationDegrees = 360
                                    }
                                    await timerViewModel.loadInitialData()
                                    await dashboardViewModel.loadDashboardEarnings()
                                    rotationDegrees = 0
                                }
                            }) {
                                Image(systemName: "arrow.clockwise")
                                    .font(.system(size: 18, weight: .medium))
                                    .foregroundColor(AppTheme.secondary)
                            }
                            .rotationEffect(.degrees(rotationDegrees))
                            .disabled(timerViewModel.isRefreshing)

                            Button(action: {
                                showingSettings = true
                            }) {
                                Image(systemName: "gearshape")
                                    .font(.system(size: 18, weight: .medium))
                                    .foregroundColor(AppTheme.secondary)
                            }
                        }
                    }
                    .padding(.horizontal, AppTheme.spacingLG)
                    .padding(.top, AppTheme.spacingMD)
                    .padding(.bottom, AppTheme.spacingSM)

                    // Fixed Timer Section at the top
                    TimerView()
                    .padding(AppTheme.spacingLG)
                    .background(AppTheme.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusLG))
                    .overlay(
                        RoundedRectangle(cornerRadius: AppTheme.radiusLG)
                            .stroke(AppTheme.border, lineWidth: 1)
                    )
                    .padding(.horizontal, AppTheme.spacingLG)
                    .padding(.top, AppTheme.spacingSM)

                    // Scrollable content below TimerView
                    ScrollView {
                        VStack(spacing: AppTheme.spacingLG) {
                            // Earnings Cards Section
                            if dashboardViewModel.isLoading {
                                HStack(spacing: AppTheme.spacingMD) {
                                    LoadingEarningsCard(title: "Today")
                                    LoadingEarningsCard(title: "This Week")
                                }
                            } else if let errorMessage = dashboardViewModel.errorMessage {
                                Text("Failed to load earnings: \(errorMessage)")
                                    .foregroundColor(AppTheme.error)
                                    .font(.system(size: 13))
                                    .padding()
                            } else {
                                HStack(spacing: AppTheme.spacingMD) {
                                    // Today's Earnings Card (with live updates)
                                    LiveEarningsCard(
                                        title: "Today",
                                        dashboardViewModel: dashboardViewModel,
                                        duration: dashboardViewModel.todayDurationFormatted
                                    )

                                    // This Week's Earnings Card
                                    EarningsCard(
                                        title: "This Week",
                                        earnings: dashboardViewModel.thisWeekEarningsFormatted,
                                        duration: dashboardViewModel.thisWeekDurationFormatted
                                    )
                                }
                            }

                            // Recent Time Entries Section
                            VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
                                Text("Recent Entries")
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundColor(AppTheme.primary)
                                    .frame(maxWidth: .infinity, alignment: .leading)

                                // Time entries list
                                if timerViewModel.recentEntries.isEmpty {
                                    PremiumEmptyState(
                                        icon: "clock.arrow.circlepath",
                                        title: "No time entries yet",
                                        subtitle: "Start tracking to see your entries here"
                                    )
                                } else {
                                    LazyVStack(spacing: AppTheme.spacingMD) {
                                        ForEach(timerViewModel.recentEntries) { entry in
                                            TimeEntryRow(entry: entry)
                                        }
                                    }
                                }
                            }
                        }
                        .padding(AppTheme.spacingLG)
                    }
                }
            }
            .navigationBarHidden(true)
            .sheet(isPresented: $showingSettings) {
                SettingsView()
            }
            .onAppear {
                Task {
                    await timerViewModel.loadInitialData()
                    await dashboardViewModel.loadDashboardEarnings()
                }
            }
        }
        .navigationViewStyle(StackNavigationViewStyle())
    }
}

struct TimeEntryRow: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    let entry: TimeEntry
    @State private var borderOpacity: Double = 0.5

    var body: some View {
        HStack(spacing: AppTheme.spacingMD) {
            // Project color indicator
            Circle()
                .fill(timerViewModel.getProjectColor(for: entry))
                .frame(width: 8, height: 8)

            // Project/task info and description
            VStack(alignment: .leading, spacing: AppTheme.spacingXS) {
                HStack(spacing: AppTheme.spacingSM) {
                    Text(entry.project?.name ?? "No Project")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(AppTheme.primary)
                        .lineLimit(1)

                    if let task = entry.task {
                        Text(task.name)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(AppTheme.tertiary)
                            .lineLimit(1)
                    }
                }

                if let description = entry.description, !description.isEmpty {
                    Text(description)
                        .font(.system(size: 13))
                        .foregroundColor(AppTheme.tertiary)
                        .lineLimit(1)
                }
            }

            Spacer()

            // Duration display
            Text(entry.formattedDurationShort)
                .font(.system(size: 15, weight: .semibold, design: .monospaced))
                .foregroundColor(AppTheme.primary)

            // Play button (only when no timer running)
            if !timerViewModel.isRunning && !entry.isRunning {
                Button(action: {
                    Task {
                        await timerViewModel.restartTimer(fromEntry: entry)
                    }
                }) {
                    ZStack {
                        Circle()
                            .stroke(AppTheme.success, lineWidth: 2)
                            .frame(width: 36, height: 36)

                        Image(systemName: "play.fill")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(AppTheme.success)
                    }
                }
            }
        }
        .padding(AppTheme.spacingMD)
        .background(AppTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                .stroke(entry.isRunning ? AppTheme.success.opacity(borderOpacity) : AppTheme.border, lineWidth: entry.isRunning ? 2 : 1)
        )
        .onAppear {
            if entry.isRunning {
                withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) {
                    borderOpacity = 1.0
                }
            }
        }
        .onChange(of: entry.isRunning) { newValue in
            if newValue {
                withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) {
                    borderOpacity = 1.0
                }
            } else {
                borderOpacity = 0.5
            }
        }
    }
}

struct EarningsCard: View {
    let title: String
    let earnings: String
    let duration: String

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
            Text(title)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(AppTheme.secondary)

            VStack(alignment: .leading, spacing: AppTheme.spacingXS) {
                Text(earnings)
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundColor(AppTheme.primary)

                Text(duration)
                    .font(.system(size: 13))
                    .foregroundColor(AppTheme.tertiary)
            }
        }
        .padding(AppTheme.spacingLG)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                .stroke(AppTheme.border, lineWidth: 1)
        )
    }
}

struct LoadingEarningsCard: View {
    let title: String
    @State private var isShimmering = false

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
            Text(title)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(AppTheme.secondary)

            VStack(alignment: .leading, spacing: AppTheme.spacingXS) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(AppTheme.border)
                    .frame(width: 80, height: 28)
                    .opacity(isShimmering ? 0.5 : 1)

                RoundedRectangle(cornerRadius: 3)
                    .fill(AppTheme.border)
                    .frame(width: 60, height: 16)
                    .opacity(isShimmering ? 0.5 : 1)
            }
        }
        .padding(AppTheme.spacingLG)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                .stroke(AppTheme.border, lineWidth: 1)
        )
        .onAppear {
            withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) {
                isShimmering = true
            }
        }
    }
}

struct LiveEarningsCard: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    let title: String
    let dashboardViewModel: DashboardViewModel
    let duration: String

    // Computed property that recalculates when timerViewModel.elapsedTime changes
    private var liveEarnings: String {
        dashboardViewModel.todayEarningsWithLive(currentTimerEarnings: timerViewModel.currentTimerLiveEarnings)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
            Text(title)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(AppTheme.secondary)

            VStack(alignment: .leading, spacing: AppTheme.spacingXS) {
                Text(liveEarnings)
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundColor(AppTheme.primary)

                Text(duration)
                    .font(.system(size: 13))
                    .foregroundColor(AppTheme.tertiary)
            }
        }
        .padding(AppTheme.spacingLG)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                .stroke(AppTheme.border, lineWidth: 1)
        )
    }
}

#Preview {
    DashboardView()
        .environmentObject(AuthViewModel())
        .environmentObject(TimerViewModel())
}

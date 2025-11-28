import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var timerViewModel: TimerViewModel
    @StateObject private var dashboardViewModel = DashboardViewModel()
    @State private var rotationDegrees = 0.0

    var body: some View {
        VStack(spacing: 0) {
            // Timer Section - clean, minimal
            TimerView(
                onRefresh: {
                    Task {
                        withAnimation(.easeInOut(duration: 0.8)) {
                            rotationDegrees = 360
                        }
                        await timerViewModel.loadInitialData()
                        await dashboardViewModel.loadDashboardEarnings()
                        rotationDegrees = 0
                    }
                },
                rotationDegrees: rotationDegrees,
                isRefreshing: timerViewModel.isRefreshing
            )
            .padding(AppTheme.spacingLG)
            .background(AppTheme.background)
            .zIndex(1) // Ensure dropdown floats above ScrollView content

            // Scrollable content below
            ScrollView(showsIndicators: false) {
                VStack(spacing: AppTheme.spacingXL) {
                    // Earnings Cards Section
                    earningsCardsSection

                    // Recent Time Entries Section
                    recentEntriesSection
                }
                .padding(.horizontal, AppTheme.spacingLG)
                .padding(.bottom, AppTheme.spacingXL)
            }
        }
        .background(AppTheme.background)
        .onAppear {
            Task {
                await timerViewModel.loadInitialData()
                await dashboardViewModel.loadDashboardEarnings()
            }
        }
    }

    private var earningsCardsSection: some View {
        Group {
            if dashboardViewModel.isLoading {
                HStack(spacing: AppTheme.spacingLG) {
                    SimpleLoadingCard(title: "Today")
                    SimpleLoadingCard(title: "This Week")
                }
            } else if let errorMessage = dashboardViewModel.errorMessage {
                Text("Failed to load earnings: \(errorMessage)")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.error)
                    .padding()
            } else {
                HStack(spacing: AppTheme.spacingLG) {
                    // Today's Earnings
                    SimpleEarningsCard(
                        title: "Today",
                        earnings: dashboardViewModel.todayEarningsWithLive(currentTimerEarnings: timerViewModel.currentTimerLiveEarnings),
                        duration: dashboardViewModel.todayDurationFormatted
                    )

                    // This Week's Earnings
                    SimpleEarningsCard(
                        title: "This Week",
                        earnings: dashboardViewModel.thisWeekEarningsFormatted,
                        duration: dashboardViewModel.thisWeekDurationFormatted
                    )
                }
            }
        }
    }

    private var recentEntriesSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.spacingLG) {
            // Section header
            Text("Today")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(AppTheme.primary)

            if timerViewModel.recentEntries.isEmpty {
                // Empty state
                VStack(spacing: AppTheme.spacingMD) {
                    Text("No time entries yet")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(AppTheme.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppTheme.spacing2XL)
            } else {
                LazyVStack(spacing: AppTheme.spacingMD) {
                    ForEach(timerViewModel.recentEntries) { entry in
                        SimpleTimeEntryRow(entry: entry)
                    }
                }
            }
        }
    }
}

// MARK: - Simple Earnings Card (minimal borders)
struct SimpleEarningsCard: View {
    let title: String
    let earnings: String
    let duration: String

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(AppTheme.secondary)

            Text(earnings)
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(AppTheme.primary)

            Text(duration)
                .font(.system(size: 12))
                .foregroundColor(AppTheme.secondary)
        }
        .padding(AppTheme.spacingLG)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                .stroke(AppTheme.border, lineWidth: 1)
        )
    }
}

// MARK: - Simple Loading Card
struct SimpleLoadingCard: View {
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(AppTheme.secondary)

            Text("...")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(AppTheme.secondary)

            Text("Loading...")
                .font(.system(size: 12))
                .foregroundColor(AppTheme.secondary)
        }
        .padding(AppTheme.spacingLG)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                .stroke(AppTheme.border, lineWidth: 1)
        )
    }
}

// MARK: - Simple Time Entry Row (minimal, like original)
struct SimpleTimeEntryRow: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    let entry: TimeEntry

    @State private var pulseOpacity = 1.0

    var body: some View {
        HStack(spacing: AppTheme.spacingMD) {
            // Project color indicator
            Circle()
                .fill(timerViewModel.getProjectColor(for: entry))
                .frame(width: 8, height: 8)
                .opacity(entry.isRunning ? pulseOpacity : 1.0)
                .onAppear {
                    if entry.isRunning {
                        withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) {
                            pulseOpacity = 0.3
                        }
                    }
                }

            // Entry details
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: AppTheme.spacingSM) {
                    Text(timerViewModel.getProjectName(for: entry))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(AppTheme.primary)
                        .lineLimit(1)

                    if let task = entry.task {
                        Text(task.name)
                            .font(.system(size: 13))
                            .foregroundColor(AppTheme.secondary)
                            .lineLimit(1)
                    }
                }

                if let description = entry.description, !description.isEmpty {
                    Text(description)
                        .font(.system(size: 12))
                        .foregroundColor(AppTheme.secondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            // Duration
            if !entry.isRunning {
                Text(entry.formattedDurationShort)
                    .font(.system(size: 14, weight: .medium, design: .monospaced))
                    .foregroundColor(AppTheme.primary)
            }

            // Play button - only show when no timer is running
            if !timerViewModel.isRunning {
                Button(action: {
                    Task {
                        await timerViewModel.restartTimer(fromEntry: entry)
                    }
                }) {
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 24))
                        .foregroundColor(AppTheme.success)
                }
                .buttonStyle(PlainButtonStyle())
                .help("Restart this timer")
            }
        }
        .padding(AppTheme.spacingMD)
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                .stroke(entry.isRunning ? AppTheme.success.opacity(pulseOpacity) : AppTheme.border, lineWidth: 1)
        )
    }
}

#Preview {
    DashboardView()
        .environmentObject(AuthViewModel())
        .environmentObject(TimerViewModel())
        .frame(width: 420, height: 680)
        .preferredColorScheme(.dark)
}

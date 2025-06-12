import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var timerViewModel: TimerViewModel
    @StateObject private var dashboardViewModel = DashboardViewModel()
    @State private var rotationDegrees = 0.0

    var body: some View {
        // Main content in a scrollable view
        ScrollView {
            VStack(spacing: 16) {
                // Timer Section (always visible at top)
                TimerView(
                    onRefresh: {
                        Task {
                            withAnimation(.linear(duration: 1)) {
                                rotationDegrees = 360
                            }
                            await timerViewModel.loadInitialData()
                            await dashboardViewModel.loadDashboardEarnings()
                            // Reset without animation
                            rotationDegrees = 0
                        }
                    },
                    onSettings: {
                        authViewModel.logout()
                    },
                    rotationDegrees: rotationDegrees,
                    isRefreshing: timerViewModel.isRefreshing
                )
                .cornerRadius(12)

                                // Earnings Cards Section
                if dashboardViewModel.isLoading {
                    HStack(spacing: 16) {
                        LoadingEarningsCard(title: "Today", icon: "💰")
                        LoadingEarningsCard(title: "This Week", icon: "📊")
                    }
                    .padding(.horizontal)
                } else if let errorMessage = dashboardViewModel.errorMessage {
                    Text("Failed to load earnings: \(errorMessage)")
                        .foregroundColor(AppTheme.error)
                        .font(.caption)
                        .padding()
                } else {
                    HStack(spacing: 16) {
                        // Today's Earnings Card
                        EarningsCard(
                            title: "Today",
                            earnings: dashboardViewModel.todayEarningsFormatted,
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
                VStack(alignment: .leading, spacing: 16) {
                    Text("Today")
                        .font(.headline)
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    // Time entries list
                    if timerViewModel.recentEntries.isEmpty {
                        VStack(spacing: 12) {
                            Text("No time entries yet")
                                .font(.headline)
                                .foregroundColor(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 20)
                    } else {
                        LazyVStack(spacing: 12) {
                            ForEach(timerViewModel.recentEntries) { entry in
                                TimeEntryRow(entry: entry)
                            }
                        }
                    }
                }
            }
            .padding()
        }
        .background(AppTheme.background)
        .navigationTitle("")
        .onAppear {
            Task {
                await timerViewModel.loadInitialData()
                await dashboardViewModel.loadDashboardEarnings()
            }
        }
    }
}

struct TimeEntryRow: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    let entry: TimeEntry

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    // Project indicator and name
                    Circle()
                        .fill(timerViewModel.getProjectColor(for: entry))
                        .frame(width: 8, height: 8)

                    Text(timerViewModel.getProjectName(for: entry))
                        .font(.headline)
                        .lineLimit(1)

                    if let task = entry.task {
                        Text(task.name)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }

                    Spacer()

                    // Duration display
                    Text(entry.formattedDuration)
                        .font(.headline)
                        .fontWeight(.medium)
                }

                if let description = entry.description, !description.isEmpty {
                    Text(description)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
            .padding()
            .frame(maxWidth: .infinity)
            .background(Color(NSColor.windowBackgroundColor))
            .cornerRadius(8)

            // Restart button
            if !timerViewModel.isRunning {
                Button(action: {
                    Task {
                        await timerViewModel.restartTimer(fromEntry: entry)
                    }
                }) {
                    Image(systemName: "play.circle.fill")
                        .font(.title2)
                        .foregroundColor(.blue)
                }
                .buttonStyle(PlainButtonStyle())
                .help("Restart this timer")
            }
        }
    }
}

struct EarningsCard: View {
    let title: String
    let earnings: String
    let duration: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(title)
                    .font(.headline)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(earnings)
                    .font(.title)
                    .fontWeight(.bold)
                    .foregroundColor(.primary)

                Text(duration)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.primary.opacity(0.1), lineWidth: 1)
        )
    }
}

struct LoadingEarningsCard: View {
    let title: String
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(title)
                    .font(.headline)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)

                Spacer()

                Text(icon)
                    .font(.title2)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("...")
                    .font(.title)
                    .fontWeight(.bold)
                    .foregroundColor(.secondary)

                Text("Loading...")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.gray.opacity(0.1))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.primary.opacity(0.1), lineWidth: 1)
        )
    }
}

#Preview {
    DashboardView()
        .environmentObject(AuthViewModel())
        .environmentObject(TimerViewModel())
}

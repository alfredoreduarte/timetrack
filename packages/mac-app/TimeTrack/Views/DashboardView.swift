import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var timerViewModel: TimerViewModel
    @StateObject private var dashboardViewModel = DashboardViewModel()
    @State private var rotationDegrees = 0.0

    var body: some View {
        VStack(spacing: 0) {
            // Fixed Timer Section at the top
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
            .padding()
            .background(AppTheme.background)
            .cornerRadius(12)
            .shadow(color: Color.black.opacity(0.1), radius: 8, x: 0, y: 4)
            .zIndex(1) // Ensure the shadow appears above the scrollable content

            // Gradient overlay to soften the transition
            LinearGradient(
                gradient: Gradient(colors: [
                    AppTheme.background.opacity(0.8),
                    AppTheme.background.opacity(0.4),
                    Color.clear
                ]),
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 20)
            .zIndex(1)

            // Scrollable content below TimerView
            ScrollView {
                VStack(spacing: 16) {
                    // Earnings Cards Section
                    if dashboardViewModel.isLoading {
                        HStack(spacing: 16) {
                            LoadingEarningsCard(title: "Today")
                            LoadingEarningsCard(title: "This Week")
                        }
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
            .offset(y: -20) // Offset to overlap with the gradient
            // negative bottom margin to compensate for the negative offset
            .padding(.bottom, -20)
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
    @State private var isBlinking = false

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    // Project indicator and name
                    Circle()
                        .fill(timerViewModel.getProjectColor(for: entry))
                        .frame(width: 8, height: 8)
                        .opacity(entry.isRunning ? (isBlinking ? 0.3 : 1.0) : 1.0)
                        .onAppear {
                            if entry.isRunning {
                                withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) {
                                    isBlinking = true
                                }
                            }
                        }
                        .onChange(of: entry.isRunning) { newValue in
                            if newValue {
                                withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) {
                                    isBlinking = true
                                }
                            } else {
                                withAnimation(.easeInOut(duration: 0.3)) {
                                    isBlinking = false
                                }
                            }
                        }

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
                    if !entry.isRunning {
                        Text(entry.formattedDurationShort)
                            .font(.headline)
                            .fontWeight(.medium)
                    }
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
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(entry.isRunning ? AppTheme.success.opacity(0.5) : Color.primary.opacity(0.1), lineWidth: 0.5)
//                    .stroke(Color.primary.opacity(0.1), lineWidth: 1)
            )

            // Restart button
            if !timerViewModel.isRunning {
                Button(action: {
                    Task {
                        await timerViewModel.restartTimer(fromEntry: entry)
                    }
                }) {
                    Image(systemName: "play.circle.fill")
                        .font(.title2)
                        .foregroundColor(AppTheme.success)
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

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(title)
                    .font(.headline)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)
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
        .frame(width: 400, height: 600)
}

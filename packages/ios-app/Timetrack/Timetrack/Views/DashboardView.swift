import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var timerViewModel: TimerViewModel
    @StateObject private var dashboardViewModel = DashboardViewModel()
    @State private var rotationDegrees = 0.0
    @State private var showingSettings = false

    var body: some View {
        NavigationView {
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
                        showingSettings = true
                    },
                    rotationDegrees: rotationDegrees,
                    isRefreshing: timerViewModel.isRefreshing
                )
                .padding()
                .background(AppTheme.background)
                .cornerRadius(12)
                .shadow(color: Color.black.opacity(0.1), radius: 8, x: 0, y: 4)
                .padding(.horizontal)
                .padding(.top)

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
                            Text("Recent Entries")
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
            }
            .background(Color(UIColor.systemBackground))
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack {
                        Text("TimeTrack")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                        
                        Button(action: {
                            authViewModel.logout()
                        }) {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .font(.title3)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
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
    @State private var isBlinking = false

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    // Use shared project display component
                    ProjectTaskDisplayView(
                        entry: entry,
                        style: .full
                    )
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
        .background(Color(UIColor.secondarySystemBackground))
        .cornerRadius(12)
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
        .background(Color(UIColor.secondarySystemBackground))
        .cornerRadius(12)
    }
}

#Preview {
    DashboardView()
        .environmentObject(AuthViewModel())
        .environmentObject(TimerViewModel())
}
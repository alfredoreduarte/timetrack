import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var timerViewModel: TimerViewModel

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Header with user info and logout
                HStack {
                    VStack(alignment: .leading) {
                        Text("TimeTrack Dashboard")
                            .font(.title)
                            .fontWeight(.bold)

                        if let user = authViewModel.currentUser {
                            Text("Welcome back, \(user.name)")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }

                    Spacer()

                    Button("Logout") {
                        authViewModel.logout()
                    }
                    .foregroundColor(.red)
                }
                .padding()
                .background(Color(NSColor.controlBackgroundColor))

                Divider()

                // Main content
                ScrollView {
                    VStack(spacing: 24) {
                        // Timer Section
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Time Tracker")
                                .font(.title2)
                                .fontWeight(.semibold)

                            TimerView()
                        }
                        .padding()
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(12)

                        // Recent Entries Section
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Recent Time Entries")
                                .font(.title2)
                                .fontWeight(.semibold)

                            if timerViewModel.recentEntries.isEmpty {
                                VStack(spacing: 12) {
                                    Image(systemName: "clock.badge.questionmark")
                                        .font(.system(size: 40))
                                        .foregroundColor(.secondary)

                                    Text("No time entries yet")
                                        .font(.headline)
                                        .foregroundColor(.secondary)

                                    Text("Start tracking to see your entries here")
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 40)
                            } else {
                                LazyVStack(spacing: 12) {
                                    ForEach(timerViewModel.recentEntries.prefix(10)) { entry in
                                        TimeEntryRow(entry: entry)
                                    }
                                }
                            }
                        }
                        .padding()
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(12)
                    }
                    .padding()
                }
            }
        }
        .navigationTitle("")
        .onAppear {
            Task {
                await timerViewModel.loadInitialData()
            }
        }
    }
}

struct TimeEntryRow: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    let entry: TimeEntry

    var body: some View {
        HStack(spacing: 12) {
            // Project color indicator
            Circle()
                .fill(timerViewModel.getProjectColor(for: entry))
                .frame(width: 12, height: 12)

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(timerViewModel.getProjectName(for: entry))
                        .font(.headline)
                        .foregroundColor(.primary)

                    Spacer()

                    Text(entry.formattedDuration)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)
                }

                HStack {
                    if let description = entry.description, !description.isEmpty {
                        Text(description)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                    } else {
                        Text("No description")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .italic()
                    }

                    Spacer()

                    Text(entry.formattedStartTime)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

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
        .padding()
        .background(Color(NSColor.windowBackgroundColor))
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
        )
    }
}

#Preview {
    DashboardView()
        .environmentObject(AuthViewModel())
        .environmentObject(TimerViewModel())
}
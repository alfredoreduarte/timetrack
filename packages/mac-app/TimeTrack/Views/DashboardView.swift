import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var timerViewModel: TimerViewModel

    var body: some View {
        VStack(spacing: 0) {
            // Header with app name and logout
            HStack {
                Text("Chronow")
                    .font(.title)
                    .fontWeight(.bold)

                Spacer()

                Button(action: {
                    Task {
                        await timerViewModel.loadInitialData()
                    }
                }) {
                    Image(systemName: "arrow.clockwise")
                        .font(.title3)
                        .rotationEffect(.degrees(timerViewModel.isRefreshing ? 360 : 0))
                        .animation(timerViewModel.isRefreshing ? Animation.linear(duration: 1).repeatForever(autoreverses: false) : .default, value: timerViewModel.isRefreshing)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 4)
                .keyboardShortcut("r", modifiers: .command)
                .help("Refresh data (⌘R)")
                .disabled(timerViewModel.isRefreshing)

                Button(action: {
                    authViewModel.logout()
                }) {
                    Image(systemName: "gearshape")
                        .font(.title3)
                }
                .buttonStyle(.plain)
            }
            .padding()

            Divider()

            // Main content in a scrollable view
            ScrollView {
                VStack(spacing: 16) {
                    // Timer Section (always visible at top)
                    TimerView()
                        .padding()
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(12)

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
                    .padding()
                }
                .padding()
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

#Preview {
    DashboardView()
        .environmentObject(AuthViewModel())
        .environmentObject(TimerViewModel())
}
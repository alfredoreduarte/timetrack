import SwiftUI

// MARK: - Shared UI Components

// Compact version of TimeEntryRow for menu bar display
struct CompactTimeEntryView: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    let entry: TimeEntry
    let showLiveEarnings: Bool
    let onTimerAction: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                // Use shared project display component
                ProjectTaskDisplayView(
                    entry: entry,
                    style: .compact
                )

                if let description = entry.description, !description.isEmpty {
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

                if showLiveEarnings, let earnings = timerViewModel.currentTimerLiveEarnings {
                    Text("$\(earnings, specifier: "%.2f")")
                        .font(.system(size: 10))
                        .foregroundColor(.green)
                } else if let rate = entry.hourlyRateSnapshot {
                    Text("$\(rate, specifier: "%.2f")/hr")
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                }
            }
        }

        // Timer control button
        HStack {
            Spacer()

            Button(action: onTimerAction) {
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
    }
}

// Compact earnings display for menu bar
struct CompactEarningsView: View {
    let earnings: DashboardEarnings?
    let showCurrentTimer: Bool
    let currentTimerEarnings: Double?

    var body: some View {
        VStack(spacing: 6) {
            // Show live current timer earnings if timer is running
            if showCurrentTimer, let liveEarnings = currentTimerEarnings {
                HStack {
                    Text("Current Timer:")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("$\(liveEarnings, specifier: "%.2f")")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.green)
                }
            }

            if let earnings = earnings {
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
            } else {
                Text("Unable to load earnings")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
        }
    }
}

// Shared project/task display component
struct ProjectTaskDisplayView: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    let entry: TimeEntry
    let style: DisplayStyle

    enum DisplayStyle {
        case full, compact
    }

    var body: some View {
        HStack {
            // Project indicator and name
            Circle()
                .fill(timerViewModel.getProjectColor(for: entry))
                .frame(width: style == .compact ? 6 : 8, height: style == .compact ? 6 : 8)

            Text(timerViewModel.getProjectName(for: entry))
                .font(style == .compact ? .system(size: 14, weight: .medium) : .headline)
                .lineLimit(1)

            if let task = entry.task {
                Text(task.name)
                    .font(style == .compact ? .system(size: 12) : .subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
        }
    }
}
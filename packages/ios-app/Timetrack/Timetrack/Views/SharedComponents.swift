import SwiftUI

// MARK: - Shared UI Components

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
                Text("• \(task.name)")
                    .font(style == .compact ? .system(size: 12) : .subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
        }
    }
}

// Compact earnings display
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
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("$\(liveEarnings, specifier: "%.2f")")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.green)
                }
            }

            if let earnings = earnings {
                HStack {
                    Text("Today:")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("$\(earnings.today.earnings, specifier: "%.2f")")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)
                }

                HStack {
                    Text("This Week:")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("$\(earnings.thisWeek.earnings, specifier: "%.2f")")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)
                }
            } else {
                Text("Unable to load earnings")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }
}
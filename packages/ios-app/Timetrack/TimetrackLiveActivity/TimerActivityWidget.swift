//
//  TimerActivityWidget.swift
//  TimetrackLiveActivity
//
//  Created by Alfredo Re on 2025-11-28.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct TimerActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TimerActivityAttributes.self) { context in
            // Lock Screen / Banner UI
            LockScreenView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 8) {
                        Circle()
                            .fill(Color(hex: context.attributes.projectColor) ?? .blue)
                            .frame(width: 12, height: 12)
                        Text(context.attributes.projectName)
                            .font(.headline)
                            .fontWeight(.semibold)
                            .lineLimit(1)
                    }
                }

                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.attributes.formattedEarnings(for: context.state.elapsedSeconds))
                        .font(.headline)
                        .fontWeight(.bold)
                        .foregroundColor(.green)
                        .monospacedDigit()
                        .privacySensitive()
                }

                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.startTime, style: .timer)
                        .font(.system(size: 32, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                        .monospacedDigit()
                }

                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        if let taskName = context.attributes.taskName {
                            Text(taskName)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                        }
                        Spacer()
                        Button(intent: StopTimerIntent(entryId: context.attributes.entryId)) {
                            HStack(spacing: 6) {
                                Image(systemName: "stop.fill")
                                    .font(.system(size: 12))
                                Text("Stop")
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(Color.red.opacity(0.2))
                            .foregroundColor(.red)
                            .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            } compactLeading: {
                HStack(spacing: 4) {
                    Circle()
                        .fill(Color(hex: context.attributes.projectColor) ?? .blue)
                        .frame(width: 10, height: 10)
                }
            } compactTrailing: {
                Text(context.attributes.startTime, style: .timer)
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .monospacedDigit()
            } minimal: {
                Image(systemName: "timer")
                    .font(.system(size: 12))
                    .symbolEffect(.pulse, options: .repeating)
            }
        }
    }
}

// MARK: - Lock Screen View
struct LockScreenView: View {
    let context: ActivityViewContext<TimerActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header with project and task
            HStack(spacing: 10) {
                Circle()
                    .fill(Color(hex: context.attributes.projectColor) ?? .blue)
                    .frame(width: 14, height: 14)

                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.projectName)
                        .font(.headline)
                        .fontWeight(.semibold)
                        .foregroundColor(.primary)
                        .lineLimit(1)

                    if let taskName = context.attributes.taskName {
                        Text(taskName)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                }

                Spacer()
            }

            // Timer and earnings row
            HStack {
                // Elapsed time (system-managed, no IPC needed)
                Text(context.attributes.startTime, style: .timer)
                    .font(.system(size: 36, weight: .bold, design: .monospaced))
                    .foregroundColor(.primary)
                    .monospacedDigit()

                Spacer()

                // Earnings
                Text(context.attributes.formattedEarnings(for: context.state.elapsedSeconds))
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.green)
                    .monospacedDigit()
                    .privacySensitive()
            }

            // Stop button
            Button(intent: StopTimerIntent(entryId: context.attributes.entryId)) {
                HStack {
                    Spacer()
                    Image(systemName: "stop.fill")
                        .font(.system(size: 14))
                    Text("Stop Timer")
                        .font(.headline)
                        .fontWeight(.semibold)
                    Spacer()
                }
                .padding(.vertical, 12)
                .background(Color.red.opacity(0.15))
                .foregroundColor(.red)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .activityBackgroundTint(Color.black.opacity(0.8))
    }
}

// MARK: - Color Extension
extension Color {
    init?(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            return nil
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Preview
#Preview("Lock Screen", as: .content, using: TimerActivityAttributes(
    projectName: "Client Project",
    projectColor: "#6366F1",
    taskName: "Development",
    hourlyRate: 75.0,
    startTime: Date().addingTimeInterval(-3725),
    entryId: "preview-123"
)) {
    TimerActivityWidget()
} contentStates: {
    TimerActivityAttributes.ContentState(elapsedSeconds: 3725, isRunning: true)
}

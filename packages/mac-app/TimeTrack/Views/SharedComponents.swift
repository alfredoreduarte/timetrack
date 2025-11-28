import SwiftUI

// MARK: - Shared UI Components

/// Compact version of TimeEntryRow for menu bar display
struct CompactTimeEntryView: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    let entry: TimeEntry
    let showLiveEarnings: Bool
    let onTimerAction: () -> Void

    var body: some View {
        VStack(spacing: AppTheme.spacingMD) {
            HStack {
                VStack(alignment: .leading, spacing: AppTheme.spacingXS) {
                    ProjectTaskDisplayView(
                        entry: entry,
                        style: .compact
                    )

                    if let description = entry.description, !description.isEmpty {
                        Text(description)
                            .font(.system(size: 11))
                            .foregroundColor(AppTheme.tertiary)
                            .lineLimit(1)
                    }
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text(timerViewModel.formattedElapsedTime)
                        .font(.system(size: 20, weight: .bold, design: .monospaced))
                        .foregroundColor(AppTheme.primary)

                    if showLiveEarnings, let earnings = timerViewModel.currentTimerLiveEarnings {
                        Text(String(format: "$%.2f", earnings))
                            .font(.system(size: 12, weight: .semibold, design: .rounded))
                            .foregroundColor(AppTheme.earnings)
                    } else if let rate = entry.hourlyRateSnapshot {
                        Text(String(format: "$%.2f/hr", rate))
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(AppTheme.tertiary)
                    }
                }
            }

            // Timer control button
            Button(action: onTimerAction) {
                HStack(spacing: 6) {
                    Image(systemName: timerViewModel.isRunning ? "stop.fill" : "play.fill")
                        .font(.system(size: 11, weight: .semibold))
                    Text(timerViewModel.isRunning ? "Stop" : "Resume")
                        .font(.system(size: 12, weight: .semibold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppTheme.spacingSM)
                .background(timerViewModel.isRunning ? AppTheme.errorGradient : AppTheme.successGradient)
                .clipShape(Capsule())
                .shadow(color: (timerViewModel.isRunning ? AppTheme.error : AppTheme.success).opacity(0.3), radius: 6, x: 0, y: 3)
            }
            .buttonStyle(.plain)
        }
    }
}

/// Compact earnings display for menu bar
struct CompactEarningsView: View {
    let earnings: DashboardEarnings?
    let showCurrentTimer: Bool
    let currentTimerEarnings: Double?

    var body: some View {
        VStack(spacing: AppTheme.spacingSM) {
            // Show live current timer earnings if timer is running
            if showCurrentTimer, let liveEarnings = currentTimerEarnings {
                CompactEarningsRow(
                    label: "Current Timer",
                    value: String(format: "$%.2f", liveEarnings),
                    valueColor: AppTheme.earnings,
                    isHighlighted: true
                )
            }

            if let earnings = earnings {
                CompactEarningsRow(
                    label: "Today",
                    value: String(format: "$%.2f", earnings.today.earnings)
                )

                CompactEarningsRow(
                    label: "This Week",
                    value: String(format: "$%.2f", earnings.thisWeek.earnings)
                )
            } else {
                Text("Unable to load earnings")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.tertiary)
            }
        }
    }
}

/// Single earnings row for compact display
struct CompactEarningsRow: View {
    let label: String
    let value: String
    var valueColor: Color = AppTheme.primary
    var isHighlighted: Bool = false

    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 12, weight: isHighlighted ? .medium : .regular))
                .foregroundColor(isHighlighted ? AppTheme.primary : AppTheme.secondary)

            Spacer()

            Text(value)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundColor(valueColor)
        }
    }
}

/// Shared project/task display component
struct ProjectTaskDisplayView: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    let entry: TimeEntry
    let style: DisplayStyle

    enum DisplayStyle {
        case full, compact
    }

    var body: some View {
        HStack(spacing: style == .compact ? AppTheme.spacingSM : AppTheme.spacingSM) {
            // Project color indicator
            Circle()
                .fill(timerViewModel.getProjectColor(for: entry))
                .frame(width: style == .compact ? 6 : 8, height: style == .compact ? 6 : 8)

            Text(timerViewModel.getProjectName(for: entry))
                .font(style == .compact ? .system(size: 13, weight: .semibold) : .system(size: 14, weight: .semibold))
                .foregroundColor(AppTheme.primary)
                .lineLimit(1)

            if let task = entry.task {
                Text(task.name)
                    .font(style == .compact ? .system(size: 12, weight: .medium) : .system(size: 13, weight: .medium))
                    .foregroundColor(AppTheme.tertiary)
                    .lineLimit(1)
            }
        }
    }
}

// MARK: - Premium Button Styles

/// Primary gradient button style
struct PremiumPrimaryButtonStyle: ButtonStyle {
    var isLoading: Bool = false
    var gradient: LinearGradient = AppTheme.accentGradient

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: AppTheme.spacingSM) {
            if isLoading {
                ProgressView()
                    .scaleEffect(0.7)
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
            }
            configuration.label
        }
        .font(.system(size: 14, weight: .semibold))
        .foregroundColor(.white)
        .frame(maxWidth: .infinity)
        .padding(.vertical, AppTheme.spacingMD)
        .background(gradient)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
        .shadow(color: AppTheme.accent.opacity(configuration.isPressed ? 0.2 : 0.3), radius: configuration.isPressed ? 4 : 8, x: 0, y: configuration.isPressed ? 2 : 4)
        .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
        .animation(.spring(response: 0.2, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// Secondary outline button style
struct PremiumSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(AppTheme.accent)
            .frame(maxWidth: .infinity)
            .padding(.vertical, AppTheme.spacingMD)
            .background(AppTheme.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                    .stroke(AppTheme.accent.opacity(0.5), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

// MARK: - Premium Input Components

/// Premium styled text field with floating label support
struct PremiumInputField: View {
    let title: String
    let placeholder: String
    @Binding var text: String
    var isSecure: Bool = false
    var errorMessage: String? = nil

    @State private var isFocused = false

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.spacingSM) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(AppTheme.primary)

            Group {
                if isSecure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                }
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(AppTheme.primary)
            .textFieldStyle(.plain)
            .padding(AppTheme.spacingMD)
            .background(AppTheme.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusSM))
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.radiusSM)
                    .stroke(errorMessage != nil ? AppTheme.error : (isFocused ? AppTheme.accent.opacity(0.5) : AppTheme.border), lineWidth: 1)
            )
            .onTapGesture {
                isFocused = true
            }

            if let error = errorMessage {
                Text(error)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(AppTheme.error)
            }
        }
    }
}

// MARK: - Status Indicators

/// Animated live status indicator
struct LiveIndicator: View {
    @State private var isAnimating = false

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(AppTheme.success)
                .frame(width: 6, height: 6)
                .opacity(isAnimating ? 0.3 : 1.0)

            Text("LIVE")
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundColor(AppTheme.success)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(AppTheme.success.opacity(0.15))
        .clipShape(Capsule())
        .onAppear {
            withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) {
                isAnimating = true
            }
        }
    }
}

/// Loading spinner with optional label
struct PremiumLoadingView: View {
    var label: String? = nil

    var body: some View {
        HStack(spacing: AppTheme.spacingSM) {
            ProgressView()
                .scaleEffect(0.8)
                .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.accent))

            if let label = label {
                Text(label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(AppTheme.secondary)
            }
        }
    }
}

// MARK: - Cards and Containers

/// Premium card container with optional glow effect
struct PremiumCard<Content: View>: View {
    var hasGlow: Bool = false
    var glowColor: Color = AppTheme.accent
    @ViewBuilder let content: () -> Content

    var body: some View {
        ZStack {
            if hasGlow {
                RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                    .fill(glowColor.opacity(0.05))
                    .blur(radius: 15)
                    .padding(-5)
            }

            content()
                .padding(AppTheme.spacingLG)
                .background(AppTheme.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
                .overlay(
                    RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                        .stroke(hasGlow ? glowColor.opacity(0.3) : AppTheme.border, lineWidth: 1)
                )
        }
    }
}

// MARK: - Empty States

/// Premium empty state view
struct PremiumEmptyState: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: AppTheme.spacingMD) {
            Image(systemName: icon)
                .font(.system(size: 36, weight: .light))
                .foregroundColor(AppTheme.tertiary)

            Text(title)
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundColor(AppTheme.primary)

            Text(subtitle)
                .font(.system(size: 13))
                .foregroundColor(AppTheme.tertiary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, AppTheme.spacing2XL)
    }
}
